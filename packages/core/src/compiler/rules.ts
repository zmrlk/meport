/**
 * Rule-Based Export Compiler
 *
 * THE critical component. Generates actionable RULES from profile dimensions,
 * not descriptions. "Max 5 lines" (~85% compliance) > "User prefers brevity" (~50%).
 *
 * Each question option carries an export_rule — the compiler collects, deduplicates,
 * prioritizes, and formats them for each platform.
 */

import type {
  PersonaProfile,
  ExportableDimension,
} from "../schema/types.js";
import { getDimensionWeight } from "../schema/types.js";

// ─── Rule Types ─────────────────────────────────────────────

export interface ExportRule {
  rule: string;
  source: "explicit" | "anti_pattern" | "compound" | "scan" | "inferred" | "conditional" | "observed" | "example" | "ai_synthesis";
  dimension: string;
  weight: number; // 1-10, from dimension weights
  confidence: number;
  pack?: string;
  sensitive?: boolean; // health/finance — requires explicit export opt-in
}

export interface RuleCompilerConfig {
  maxRules: number;
  maxChars: number;
  includeSensitive: boolean;
  includeContext: boolean; // CONTEXT section (name, tech stack, etc.)
  platform: string;
}

// ─── Generic Rule Patterns ──────────────────────────────────

/**
 * Regex patterns that match generic/useless rules — things every AI does by default.
 * Rules matching these patterns are filtered out unless they are made specific
 * by a SPECIFICITY_BOOST transformation first.
 */
const GENERIC_RULE_PATTERNS: RegExp[] = [
  // Brevity / conciseness (generic)
  /\bbe\s+concise\b/i,
  /\bbe\s+brief\b/i,
  /\bkeep\s+it\s+short\b/i,
  /\bkeep\s+responses\s+short\b/i,
  // Examples (generic, not tied to a domain)
  /^use\s+examples(\.|$)/i,
  /^provide\s+examples(\.|$)/i,
  /\balways\s+use\s+examples\b/i,
  // Default AI virtues
  /\bbe\s+helpful\b/i,
  /\bbe\s+accurate\b/i,
  /\bbe\s+honest\b/i,
  /\bbe\s+truthful\b/i,
  // Tone platitudes
  /\bbe\s+(friendly|polite|respectful|kind)\b/i,
  /\brespond\s+in\s+a\s+friendly\b/i,
  /\buse\s+a\s+(friendly|polite|professional)\s+tone\b/i,
  // Clarity platitudes
  /\buse\s+clear\s+(language|writing)\b/i,
  /\bwrite\s+clearly\b/i,
  /\bkeep\s+language\s+simple\b/i,
  // Clarifying questions (generic)
  /\bask\s+(clarifying\s+)?questions\b/i,
  /\bask\s+before\s+(you\s+)?proceed\b/i,
  // Generic "be direct" without specific context
  /^be\s+direct(\.|$)/i,
  /^be\s+direct\s+and\s+concise(\.|$)/i,
  // AI-synthesis generics (common from local models)
  /\bmaintain\s+a\s+concise.*communication\s+style\b/i,
  /\butilize\s+bullet\s+points?\b/i,
  /\bprioritize\s+clarity\s+and\s+actionable\b/i,
  /\bavoid\s+overly\s+technical\s+language\b/i,
  /\breflecting.*preference\s+for\s+structured\b/i,
  /\bfocus\s+on\s+their\s+practical\s+applications\b/i,
  /\bprovide\s+actionable\s+(insights|information|advice)\b/i,
  /\bensure\s+(responses|answers)\s+are\s+(clear|concise|actionable)\b/i,
];

/**
 * Returns true if the rule text is generic and should be filtered out.
 * Rules that are specific to the user (contain names, tools, concrete numbers,
 * conditional triggers) are kept even if they partially match a pattern.
 */
function isGenericRule(rule: string): boolean {
  // Specificity signals — if any are present the rule is worth keeping
  const specificitySignals = [
    /\bIF\b.*\bTHEN\b/i,          // conditional rules (IF X THEN Y)
    /\bwhen\b.*\b(then|instead|use)\b/i, // conditional without IF/THEN
    /\d+\s*(lines|sentences|min(utes)?|paragraphs|chars|words)/i, // concrete limits
    /`[^`]+`/,                    // code/tool references
    /\b(TypeScript|React|Svelte|Python|Rust|Go|Swift|Kotlin|Java|C\+\+|\.NET|C#|Ruby|PHP|Elixir|Haskell|Scala)\b/i,
    /\b(Supabase|Postgres|SQLite|MongoDB|Redis|MySQL|Firebase|DynamoDB)\b/i,
    /\b(GitHub|Linear|Notion|Figma|Cursor|VSCode|Jira|Asana|Trello)\b/i,
    /\b(NEVER|ALWAYS|MUST|DO NOT)\b/,  // strong directives
    /\b(dentist|lawyer|teacher|doctor|florist|chef|nurse|architect|designer|accountant)\b/i, // occupation-specific
  ];

  for (const signal of specificitySignals) {
    if (signal.test(rule)) return false;
  }

  for (const pattern of GENERIC_RULE_PATTERNS) {
    if (pattern.test(rule)) return true;
  }

  return false;
}

// ─── Shared Utilities ───────────────────────────────────────

/**
 * Truncate text at a word boundary to avoid breaking mid-word.
 * Finds the last newline or space before maxChars and trims there.
 */
export function truncateAtWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  // Find last newline or space before the limit
  let cutAt = text.lastIndexOf("\n", maxChars);
  if (cutAt === -1 || cutAt < maxChars * 0.7) {
    cutAt = text.lastIndexOf(" ", maxChars);
  }
  if (cutAt === -1 || cutAt < maxChars * 0.5) {
    cutAt = maxChars; // fallback: hard cut if no good break point
  }
  return text.slice(0, cutAt).trimEnd();
}

// ─── Deduplication ──────────────────────────────────────────

/**
 * Remove near-duplicate rules using simple word overlap detection.
 * Two rules are considered duplicates when their key-word overlap exceeds 60%.
 * Key words = words longer than 3 chars, lowercased, stop-words stripped.
 */
const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "have", "will",
  "your", "when", "then", "they", "them", "their", "into", "only", "more",
  "just", "also", "been", "are", "you", "not", "use", "can", "all", "any",
  "but", "our", "one", "about",
]);

function keyWords(rule: string): Set<string> {
  return new Set(
    rule
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((w) => b.has(w)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Semantic clusters: dimensions that express the same underlying preference.
 * When 3+ rules from the same cluster survive Jaccard dedup, we keep only
 * the highest-weight rule + any compound rule (which is the merged version).
 */
const SEMANTIC_CLUSTERS: Record<string, string> = {
  "communication.preamble": "brevity",
  "communication.answer_first": "brevity",
  "communication.pleasantries": "brevity",
  "communication.response_length": "brevity",
  "communication.filler_tolerance": "brevity",
  "communication.verbosity_preference": "brevity",
  "conditional.verbosity_boost": "brevity",
  "conditional.verbosity_trigger": "brevity",
  "communication.directness": "directness",
  "communication.feedback_style": "directness",
  "communication.hedge_words": "directness",
  "work.feedback_style": "directness",
  "communication.explanation_depth": "expertise_level",
  "communication.jargon_level": "expertise_level",
  "communication.jargon_preference": "expertise_level",
  "identity.tech_comfort": "expertise_level",
};

/**
 * Remove generic rules and near-duplicate rules from the list.
 * Keeps rules that are specific to the user; first occurrence of a
 * near-duplicate cluster wins (highest weight / confidence, since the
 * list is pre-sorted before this is called).
 */
export function deduplicateAndFilter(rules: ExportRule[]): ExportRule[] {
  const kept: ExportRule[] = [];
  const keptKeywords: Set<string>[] = [];

  for (const rule of rules) {
    // 1. Drop generic rules
    if (isGenericRule(rule.rule)) continue;

    // 2. Drop near-duplicates (Jaccard ≥ 0.45 against any already-kept rule)
    // Compound rules are curated multi-dimension rules — exempt from Jaccard dedup
    const kw = keyWords(rule.rule);
    let isDuplicate = false;
    if (rule.source !== "compound") {
      for (const existingKw of keptKeywords) {
        if (jaccardSimilarity(kw, existingKw) >= 0.45) {
          isDuplicate = true;
          break;
        }
      }
    }
    if (isDuplicate) continue;

    kept.push(rule);
    keptKeywords.push(kw);
  }

  // 3. Semantic cluster dedup: if 3+ rules from same cluster, keep top 2
  const clusterCounts: Record<string, { count: number; indices: number[] }> = {};
  for (let i = 0; i < kept.length; i++) {
    const cluster = SEMANTIC_CLUSTERS[kept[i].dimension];
    if (!cluster) continue;
    if (!clusterCounts[cluster]) clusterCounts[cluster] = { count: 0, indices: [] };
    clusterCounts[cluster].count++;
    clusterCounts[cluster].indices.push(i);
  }

  const toRemove = new Set<number>();
  for (const [, data] of Object.entries(clusterCounts)) {
    if (data.count <= 2) continue;
    // Sort indices by weight DESC (kept is already sorted, but confirm)
    const sorted = data.indices.sort((a, b) => kept[b].weight - kept[a].weight);
    // Keep top 2, mark rest for removal
    for (let i = 2; i < sorted.length; i++) {
      // Don't remove compound rules — they're merged versions
      if (kept[sorted[i]].source === "compound") continue;
      toRemove.add(sorted[i]);
    }
  }

  return kept.filter((_, i) => !toRemove.has(i));
}

// ─── Conflict Detection ────────────────────────────────────────

/**
 * Known rule conflict pairs. When both sides of a conflict are present,
 * the higher-weight rule wins and the loser is dropped.
 * Each entry: [pattern_A, pattern_B] — if both match, conflict exists.
 */
const CONFLICT_PAIRS: Array<{
  a: RegExp;
  b: RegExp;
  resolution: "higher_weight" | "keep_a" | "keep_b";
  reason: string;
}> = [
  {
    a: /\bmax\s+\d+\s+(lines|sentences|paragraphs)\b/i,
    b: /\b(detailed|thorough|comprehensive)\s+(explanation|response|answer)/i,
    resolution: "higher_weight",
    reason: "length limit vs detail request",
  },
  {
    a: /\bskip\s+(basics?|fundamentals?|explanations?)\b/i,
    b: /\b(explain|clarify|break\s+down|step.by.step)\b/i,
    resolution: "higher_weight",
    reason: "skip explanations vs provide explanations",
  },
  {
    a: /\b(casual|friendly|informal)\b/i,
    b: /\b(formal|professional|structured)\s+(tone|language|response)/i,
    resolution: "higher_weight",
    reason: "casual vs formal tone",
  },
  {
    a: /\b(one\s+priority|single\s+task|one\s+at\s+a\s+time)\b/i,
    b: /\b(comprehensive|all\s+options|full\s+list|exhaustive)\b/i,
    resolution: "higher_weight",
    reason: "focused vs comprehensive",
  },
  {
    a: /\bdon'?t\s+(use\s+)?emoji\b/i,
    b: /\buse\s+emoji\b/i,
    resolution: "higher_weight",
    reason: "emoji conflict",
  },
  {
    a: /\b(match\s+my\s+brevity|keep\s+.*\s+short)\b/i,
    b: /\b(thorough|depth|in.depth|comprehensive)\b/i,
    resolution: "higher_weight",
    reason: "brevity vs depth",
  },
  {
    a: /\b(don'?t\s+ask|no\s+clarif|skip\s+clarif|answer\s+directly)\b/i,
    b: /\b(ask\s+(clarifying\s+)?questions?|check\s+before|confirm\s+first)\b/i,
    resolution: "higher_weight",
    reason: "direct answer vs clarification seeking",
  },
];

/**
 * Detect and resolve conflicting rules.
 * When two rules conflict, the one with higher weight wins.
 * Returns the filtered list with conflicts resolved.
 */
function resolveConflicts(rules: ExportRule[]): ExportRule[] {
  const toRemove = new Set<number>();

  for (const conflict of CONFLICT_PAIRS) {
    const matchesA: number[] = [];
    const matchesB: number[] = [];

    for (let i = 0; i < rules.length; i++) {
      if (toRemove.has(i)) continue;
      if (conflict.a.test(rules[i].rule)) matchesA.push(i);
      if (conflict.b.test(rules[i].rule)) matchesB.push(i);
    }

    // Conflict exists only when BOTH sides have matches
    if (matchesA.length === 0 || matchesB.length === 0) continue;

    // A rule matching BOTH patterns is not a conflict — it's a nuanced rule
    const pureA = matchesA.filter((i) => !matchesB.includes(i));
    const pureB = matchesB.filter((i) => !matchesA.includes(i));
    if (pureA.length === 0 || pureB.length === 0) continue;

    // Resolve: drop the lower-weight side
    if (conflict.resolution === "higher_weight") {
      const weightsA = pureA.map((i) => rules[i].weight);
      const weightsB = pureB.map((i) => rules[i].weight);
      const maxWeightA = weightsA.length > 0 ? Math.max(...weightsA) : 0;
      const maxWeightB = weightsB.length > 0 ? Math.max(...weightsB) : 0;

      const losers = maxWeightA >= maxWeightB ? pureB : pureA;
      for (const idx of losers) {
        toRemove.add(idx);
      }
    } else if (conflict.resolution === "keep_a") {
      for (const idx of pureB) toRemove.add(idx);
    } else {
      for (const idx of pureA) toRemove.add(idx);
    }
  }

  return rules.filter((_, i) => !toRemove.has(i));
}

// ─── Baseline Rules for Thin Profiles ──────────────────────

/**
 * Generate baseline rules when the profile has few explicit dimensions.
 * Non-technical users (florists, dentists, CEOs) often have sparse profiles
 * but still benefit from basic AI behavior tuning.
 *
 * Only emits rules that DON'T conflict with existing explicit rules.
 * Weight 3 — always lower than explicit (6-9) or scan (5) rules.
 */
function generateBaselineRules(
  profile: PersonaProfile,
  existingRuleCount: number
): ExportRule[] {
  // Only trigger when profile is thin (fewer than 5 rules collected so far)
  if (existingRuleCount >= 5) return [];

  const rules: ExportRule[] = [];
  const BASELINE_WEIGHT = 3;

  const expertise = getExplicitValue(profile, "expertise.level");
  const isNonTech = !profile.explicit["expertise.tech_stack"]?.value;
  const isBeginner = expertise === "beginner" || expertise === "novice" || !expertise;
  const occupation = getExplicitValue(profile, "context.occupation");
  const lang = getExplicitValue(profile, "identity.language");

  // For non-technical users: avoid jargon
  if (isNonTech || isBeginner) {
    rules.push({
      rule: "Use plain, everyday language. Avoid technical jargon. If a technical term is necessary, explain it briefly in parentheses.",
      source: "inferred",
      dimension: "baseline.plain_language",
      weight: BASELINE_WEIGHT + 1, // slightly higher — this is critical for non-tech users
      confidence: 0.7,
    });
  }

  // For beginners: step-by-step
  if (isBeginner) {
    rules.push({
      rule: "When explaining how to do something, give numbered step-by-step instructions. Don't assume I know where to find settings or options.",
      source: "inferred",
      dimension: "baseline.step_by_step",
      weight: BASELINE_WEIGHT,
      confidence: 0.7,
    });
  }

  // If occupation is known, add relevance rule
  if (occupation) {
    rules.push({
      rule: `I'm a ${occupation}. Frame advice and examples in terms of my profession. Don't give generic answers when a field-specific one exists.`,
      source: "inferred",
      dimension: "baseline.occupation_context",
      weight: BASELINE_WEIGHT + 1,
      confidence: 0.75,
    });
  }

  // Language baseline handled by FALLBACK_RULES["identity.language"] with IF/THEN pattern

  // Universal thin-profile safety nets
  rules.push({
    rule: "If you're unsure what I mean, ask one short clarifying question before giving a long answer.",
    source: "inferred",
    dimension: "baseline.clarification",
    weight: BASELINE_WEIGHT,
    confidence: 0.6,
  });

  // For business owners / professionals: practical over theoretical
  const lifeStage = getExplicitValue(profile, "context.life_stage");
  if (lifeStage === "founder" || lifeStage === "professional" || lifeStage === "business_owner") {
    rules.push({
      rule: "Give practical, actionable advice. I need things I can implement today, not theoretical frameworks.",
      source: "inferred",
      dimension: "baseline.practical",
      weight: BASELINE_WEIGHT + 1,
      confidence: 0.7,
    });
  }

  return rules;
}

// ─── Fallback Rule Generation ────────────────────────────────

/**
 * Map of dimension → value → rule template.
 * Used when questions don't have export_rule fields.
 * Each rule is a concrete, actionable instruction for AI.
 */
const FALLBACK_RULES: Record<string, Record<string, string> | ((value: string, profile: PersonaProfile) => string | null)> = {
  // Communication
  "communication.verbosity_preference": {
    concise: "Keep responses short and focused. Max 5 lines for simple questions. Skip filler.",
    minimal: "Ultra-short responses. 1-3 lines for simple things. Expand ONLY if I explicitly ask.",
    moderate: "Give enough detail to be useful but don't over-explain. Aim for medium-length responses.",
    detailed: "Provide thorough, detailed responses with full context and explanations.",
    adaptive: "Match response length to question complexity. Simple question = short answer. Complex = detailed.",
  },
  "communication.directness": {
    direct: "Be direct and blunt. Skip diplomatic hedging. Say what you mean.",
    diplomatic: "Frame suggestions diplomatically. Build context before delivering criticism.",
    context_dependent: "Adapt directness to the situation — direct for factual, diplomatic for sensitive topics.",
  },
  "communication.format_preference": {
    prose: "Use natural, flowing text. Avoid excessive bullet points and lists.",
    numbered: "Use numbered lists for instructions and multi-step explanations.",
    bullets: "Use bullet points for clarity. Make responses scannable.",
    headers: "Use headers and sections to organize longer responses.",
    mixed: "Use the format that best fits the content — lists for steps, prose for explanations.",
    structured: "Use structured formatting — headers, bullet points, code blocks. I scan better than I read.",
  },
  "communication.emoji_preference": {
    never: "NEVER use emojis in responses.",
    sparingly: "Use emojis sparingly — only when they genuinely add meaning.",
    moderate: "Use emojis naturally to add warmth and visual clarity.",
    liberally: "Feel free to use emojis to make responses more expressive.",
  },
  "communication.filler_tolerance": {
    zero: "NEVER use filler phrases like 'Let me know if you need anything else!' or 'Great question!' — just answer.",
    low: "Zero filler words. No 'Great question!', no 'Sure thing!', no 'Absolutely!'. Just answer.",
    medium: "Minimal acknowledgment phrases. Don't over-praise simple questions.",
    high: "Natural conversational flow is fine, including brief acknowledgments.",
  },
  "communication.depth_default": {
    brief_first: "Give the short answer first. Offer to elaborate only if the topic is complex.",
    full_upfront: "Give me the full breakdown immediately. I hate going back and forth.",
    comprehensive: "Default to comprehensive answers with full reasoning.",
    adaptive: "Match depth to the question. Simple = brief. Complex = comprehensive.",
    ask_first: "Ask about desired depth before giving long answers.",
  },
  "communication.feedback_style": {
    critical_first: "Lead with what's wrong or needs improvement. Don't sugarcoat. I want the truth, not comfort.",
    direct_balanced: "Honest and direct feedback — what's broken and how to fix it.",
    balanced: "Balance positive and negative feedback.",
    comprehensive: "Full picture — what works, what doesn't, and specific improvements.",
    positive_first: "Lead with what's good, then the improvements. Build on strengths.",
    encouraging: "Lead with what's good, then suggest improvements gently.",
  },
  "communication.humor": {
    none: "Keep responses strictly professional. No humor or jokes.",
    light: "Light wit is welcome — dry observations, subtle wordplay.",
    moderate: "Humor is appreciated. Mix insights with lightness.",
  },
  "communication.jargon_preference": {
    none: "Use plain language. Explain technical terms in parentheses.",
    "semi-expert": "Use domain terminology when appropriate but explain niche terms.",
    semi_expert: "Use domain terminology when appropriate but explain niche terms.",
    expert: "Use full technical vocabulary. Don't simplify — I know the jargon.",
  },
  "communication.reasoning_visibility": {
    show_all: "Show your full reasoning chain. I want to see how you got there.",
    conclusion_only: "Just give the answer. Skip the reasoning unless I ask.",
    key_steps: "Show key reasoning steps but don't narrate every thought.",
  },
  "communication.hedging_tolerance": {
    confident_preferred: "Be confident in your statements. Avoid 'I think', 'perhaps', 'it might be'.",
    balanced_caveats: "Add appropriate caveats but don't over-hedge.",
    thorough_uncertainty: "Flag uncertainty explicitly. I'd rather know the confidence level.",
  },
  // Work
  "work.energy_archetype": {
    sprinter: "I work in intense bursts (2-4 hours), then crash. Match this rhythm — don't suggest all-day work sessions.",
    steady: "I work at a consistent pace. Even workload distribution works best for me.",
    burst_rest: "I work in 60-90 minute focused blocks with breaks. Respect this cadence.",
    reactive: "I work reactively — incoming tasks drive my day. Help me prioritize in the moment.",
  },
  "work.peak_hours": {
    early_morning: "My peak hours are early morning (6-9). Schedule demanding tasks here.",
    late_morning: "My peak is mid-morning (9-12). I'm sharpest then.",
    early_afternoon: "I peak in early afternoon (12-15).",
    late_afternoon: "My best focus is late afternoon (15-18).",
    evening: "I'm most productive in the evening (18-21).",
    night: "I work best at night (21+). Don't assume a daytime schedule.",
  },
  "work.task_granularity": {
    detailed: "Break tasks into small, specific sub-tasks. I need clear next-steps.",
    moderate: "Give me moderate task breakdown — key milestones, not micro-steps.",
    high_level: "Give me the goal and let me figure out the steps.",
  },
  "work.deadline_behavior": {
    early: "I finish things early. Don't pad deadlines — give me the real one.",
    just_in_time: "I work best under deadline pressure. The last day is my most productive.",
    buffer: "I need buffer time for review. Add margin to deadlines.",
  },
  // Cognitive
  "cognitive.learning_style": {
    examples_first: "Teach me with examples first, then explain the theory.",
    experiential: "I learn by doing. Let me try first, explain when I get stuck.",
    theory_first: "Give me the conceptual framework first, then show examples.",
    hands_on: "Let me try it first. Explain when I get stuck.",
    overview_first: "Give me the overview first, then let me dive into what matters.",
    structured_first: "Walk me through things systematically. Step-by-step structure helps me absorb.",
    observational: "Show me visual walkthroughs and examples. I learn best by watching, then doing.",
    visual: "Use diagrams, tables, and visual representations when possible.",
  },
  "cognitive.decision_style": {
    data_driven: "I decide based on data. Show me numbers, comparisons, evidence.",
    intuitive: "I decide on gut feel. Give me brief context to validate or challenge my instinct.",
    analytical: "I decide analytically. Show me data, comparisons, and trade-offs.",
    collaborative: "I think out loud. Be my sounding board — reflect and challenge as I work through it.",
    incubation: "I need time to decide. Present options clearly so I can sleep on it.",
    systematic: "I use systematic analysis — pros/cons, weighted criteria.",
  },
  "cognitive.problem_solving": {
    analytical: "Approach problems analytically. Break them into components.",
    deductive: "I trace problems systematically. Help me narrow down by asking the right questions.",
    experimental: "I solve by trying things. Suggest quick experiments, not long analyses.",
    reframer: "I reframe problems. Challenge my framing — ask if I'm solving the right problem.",
    research_first: "I research before acting. Point me to relevant docs, examples, or precedents.",
    creative: "Think laterally. Suggest unconventional solutions.",
    practical: "Focus on what works NOW. Skip elegant-but-slow solutions.",
  },
  // Personality
  "personality.core_motivation": {
    mastery: "I'm driven by depth and mastery. Challenge me intellectually.",
    impact: "I'm motivated by impact. Show me how things matter.",
    autonomy: "I value autonomy. Give me options, not prescriptions.",
    recognition: "I value being recognized for good work. Acknowledge wins.",
    security: "I prioritize stability and reliability. Conservative suggestions preferred.",
    learning: "I'm driven by learning. Connect new concepts to broader knowledge.",
  },
  "personality.stress_response": {
    withdraw: "When stressed, I withdraw. Don't push — keep answers minimal.",
    power_through: "I power through stress. Give me the action plan.",
    seek_help: "I seek support when stressed. Be collaborative and reassuring.",
    avoidance: "I tend to avoid stress triggers. Help me face them gently.",
  },
  "personality.risk_tolerance": {
    conservative: "I'm risk-averse. Suggest proven, safe approaches first.",
    moderate: "I take calculated risks. Show me the trade-offs.",
    high: "I embrace risk. Don't hold back bold suggestions.",
    very_high: "I love high-risk/high-reward. Push me toward the ambitious option.",
  },
  // Identity
  "identity.language": (value: string) => {
    if (value === "en") return null; // English is default, no rule needed
    const langNames: Record<string, string> = {
      pl: "Polish", de: "German", es: "Spanish", fr: "French",
      pt: "Portuguese", it: "Italian", nl: "Dutch", ja: "Japanese",
      ko: "Korean", zh: "Chinese",
    };
    const langName = langNames[value] || value;
    return `IF I write in ${langName} THEN respond in ${langName}. IF I write in English THEN respond in English. Match my language.`;
  },
  "identity.tech_comfort": {
    "non-technical": "I'm not technical. Use plain language, step-by-step instructions, no jargon.",
    non_technical: "I'm not technical. Use plain language, step-by-step instructions, no jargon.",
    basic: "I have basic tech skills. Explain technical concepts simply.",
    intermediate: "I have intermediate tech skills. Some jargon is fine.",
    technical: "I'm technically skilled — I code and tinker. Use full technical vocabulary, skip hand-holding.",
    advanced: "I'm technically advanced. Use full technical vocabulary.",
    expert: "I'm a tech expert. Skip basic explanations — I know how things work.",
  },
  "identity.date_format": {
    dd_mm_yyyy: "Use European date format: DD/MM/YYYY. Use metric units and 24-hour time.",
    mm_dd_yyyy: "Use US date format: MM/DD/YYYY. Use imperial units and 12-hour time.",
  },
  "identity.primary_use_case": {
    writing: "I primarily use AI for writing — emails, documents, content.",
    dev_tools: "I primarily use AI for coding — code generation, debugging, architecture.",
    chat_ai: "I primarily use AI for conversations — research, brainstorming, problem-solving.",
    local_llm: "I run AI locally for privacy. Optimize for offline/local model constraints.",
    multi_platform: "I use AI everywhere — chat, coding, local, creative. Export to all platforms matters. Be versatile.",
    research: "I primarily use AI for research — analysis, learning, understanding topics.",
    creative: "I primarily use AI for creative work — brainstorming, design, ideation.",
    business: "I primarily use AI for business — strategy, planning, decision-making.",
    personal: "I primarily use AI for personal organization and daily questions.",
    learning: "I primarily use AI for learning — courses, new skills, explanations.",
  },
  "identity.professional_role": (value: string) => {
    const readable = value.replace(/_/g, " ");
    return `I work as a ${readable}. Tailor your advice to my professional context.`;
  },
  "identity.ai_frustration": {
    context_loss: "My #1 AI frustration: losing context. ALWAYS maintain continuity — reference what I said earlier, don't make me repeat myself.",
    verbosity: "My #1 AI frustration: overly long responses. ALWAYS lead with the answer, then explain only if needed. NEVER pad with filler.",
    generic_output: "My #1 AI frustration: generic answers that could be for anyone. ALWAYS be specific to MY context, MY role, MY situation.",
    format_mismatch: "My #1 AI frustration: wrong format. ALWAYS match format to the question — bullets for lists, prose for explanations, code for code.",
    platform_friction: "My #1 AI frustration: configuring every AI tool separately. ALWAYS maintain consistent behavior across all platforms.",
    hallucinations: "My #1 AI frustration: confident hallucinations. NEVER present uncertain information as fact. ALWAYS flag uncertainty.",
    generic: "My #1 AI frustration: generic answers. ALWAYS be specific to MY context, MY role, MY situation.",
    slow: "My #1 AI frustration: slow responses. ALWAYS lead with the answer. NEVER pad with preamble.",
  },
  // Neurodivergent
  "neurodivergent.hyperfocus": {
    frequent: "I experience hyperfocus. Don't interrupt my flow — batch related info together.",
    sometimes: "I sometimes hyperfocus. Group related content when possible.",
    rare: "Hyperfocus is rare for me.",
  },
  "neurodivergent.time_perception": {
    poor: "My time perception is unreliable. Give concrete time estimates and gentle reminders.",
    variable: "My sense of time varies. Include time anchors in your suggestions.",
  },
  "neurodivergent.task_initiation": {
    difficult: "Starting tasks is hard for me. Break the first step into something tiny and specific.",
    sometimes_hard: "I sometimes struggle to start. Give me a clear, small first step.",
  },
  "neurodivergent.working_memory": {
    limited: "My working memory is limited. Keep instructions short — max 3 items at once.",
    variable: "My working memory varies. Use numbered steps I can reference back to.",
  },
  // AI relationship
  "ai.proactivity": {
    proactive: "Be proactive — suggest improvements, flag issues, offer alternatives I didn't ask for.",
    reactive: "Only answer what I ask. Don't volunteer extra suggestions.",
    moderate: "Suggest improvements occasionally but don't overwhelm with unsolicited advice.",
  },
  "ai.correction_style": {
    direct: "When I'm wrong, tell me directly. No softening.",
    gentle: "Correct me gently — explain why, don't just say I'm wrong.",
    collaborative: "Frame corrections as 'another perspective' rather than 'you're wrong'.",
  },
  // ─── Inferred dimension templates ───
  "communication.response_length": {
    short: "ALWAYS keep responses short. If I need more detail, I'll ask.",
    comprehensive: "Give thorough responses — I prefer complete answers over brief ones.",
  },
  "communication.preamble": {
    never: "NEVER start with preamble ('Sure!', 'Of course!', 'Great question!'). Start with the answer.",
  },
  "communication.answer_first": {
    always: "ALWAYS lead with the answer. Explanation comes after, only if needed.",
  },
  "communication.jargon_level": {
    full_technical: "Use full technical jargon — I speak the language.",
    plain_language: "Use plain language. Explain any technical terms in parentheses.",
  },
  "communication.explanation_depth": {
    skip_basics: "Skip basic explanations — I already know how things work. Jump to the advanced/specific part.",
    step_by_step: "Explain step by step. Don't skip steps or assume I know the basics.",
    thorough_with_examples: "Explain thoroughly with examples. I'm learning, so concrete illustrations help.",
  },
  "communication.hedge_words": {
    avoid: "Avoid hedge words ('perhaps', 'maybe', 'it might be'). Be definitive or say you don't know.",
  },
  "communication.pleasantries": {
    skip: "Skip pleasantries. No 'Happy to help!' or 'Let me know if you need anything else!'",
  },
  "communication.list_format": {
    bullets_over_prose: "Use bullet points over paragraphs when listing things.",
  },
  "communication.structure_preference": {
    overview_then_details: "Start with the big picture, then drill into details. Overview → specifics → action items.",
    sequential_steps: "Give me sequential numbered steps. I follow best when it's step 1, step 2, step 3.",
  },
  "communication.code_preference": {
    code_over_prose: "Show code over explanations. I read code faster than prose.",
  },
  "communication.personalization": {
    always_use_context: "ALWAYS reference my specific context. Generic advice is useless to me.",
  },
  "communication.uncertainty_marking": {
    always_flag: "ALWAYS flag uncertainty. Say 'I'm not sure about this' rather than presenting guesses as facts.",
  },
  "work.decision_style": {
    autonomous: "I make my own decisions. Give me options and trade-offs, not prescriptions.",
  },
  "work.feedback_style": {
    direct_actionable: "Give me direct, actionable feedback. No sandwiching.",
  },
  // ─── New fallback rules for richer exports ───
  "communication.continuity": {
    reference_earlier: "ALWAYS reference earlier context in our conversation. Never ask me to repeat information I already provided.",
    reference_earlier_messages: "ALWAYS reference earlier context in our conversation. Never ask me to repeat information I already provided.",
  },
  "communication.source_citing": {
    when_factual: "Cite sources when making factual claims. Link to documentation, not just assertions.",
  },
  "communication.generic_avoidance": {
    reference_my_situation: "ALWAYS reference my specific situation, role, and context. Generic advice that could apply to anyone is useless.",
  },
  "communication.visual_aids": {
    prefer_screenshots: "Use diagrams, tables, and visual representations when explaining complex concepts.",
  },
  "communication.examples_preference": {
    include_examples: "Include concrete, specific examples. Abstract explanations without examples don't stick.",
  },
  "communication.formality": {
    casual: "Keep tone casual and conversational. No corporate formality.",
    professional_casual: "Keep tone professional but approachable. No stiff corporate language, but stay sharp.",
    formal: "Maintain professional, formal tone in responses.",
  },
  "communication.summary_preference": {
    executive_summary: "Start with an executive summary — the key takeaway in 1-2 sentences. Details below for those who want them.",
  },
  "work.context_switching": {
    frequent: "I context-switch frequently. Help me pick up where I left off. Include enough context to re-orient.",
  },
  "work.learning_style": {
    by_building: "I learn by doing. Show me working examples I can run and modify, not theoretical explanations.",
    guided_practice: "Guide me through hands-on practice. Explain concepts as we work through them together.",
  },
  "work.automation_preference": {
    automate_everything: "If something can be automated, suggest how. I prefer scripts and tools over manual repetition.",
  },
  "work.versatility": {
    cross_domain: "I work across multiple domains. Draw connections between fields when relevant.",
  },
  "work.planning_style": {
    top_down: "Start with strategy, then zoom into tactics. I think top-down.",
    bottom_up: "Start with concrete specifics, then build up to the big picture.",
    strategic: "Think strategically. Show me the forest before the trees. Lead with vision, follow with tactics.",
  },
  "work.delegation_style": {
    outcome_focused: "Focus on outcomes, not process. Tell me what success looks like, not every step to get there.",
  },
  "communication.inspiration_style": {
    examples_and_references: "Show examples and references when suggesting creative work. I need inspiration anchors.",
  },
  "work.iteration_preference": {
    rapid_drafts: "Give me rough drafts fast. I iterate quickly — perfection on first try is slower than rapid refinement.",
  },
  "communication.explanation_style": {
    comments_in_code: "Explain through code comments, not separate paragraphs. Keep explanations inline.",
  },
  "communication.praise_tolerance": {
    none: "NEVER use praise ('Great question!', 'You should be proud!'). Just give me the content.",
    neutral: "Neutral acknowledgment is fine. Skip excessive praise or cheerleading.",
  },
  "communication.difficult_message_delivery": {
    direct: "When delivering bad news, just say it. No padding, no build-up.",
    problem_plus_solution: "Lead with the problem and immediately give me a path forward.",
  },
  "communication.code_switching": {
    technical_only: "Keep technical terms in English even when responding in another language.",
    tech_and_business: "I switch between technical and business contexts. Match my register — code talk when coding, strategy talk when strategizing.",
  },
  "cognitive.attention_pattern": {
    hyperfocus_or_nothing: "I hyperfocus or lose interest. Keep tasks engaging and varied. Don't give me tedious busywork.",
    divergent_drift: "I drift off-topic easily. Keep me focused — one priority at a time, clear next steps.",
    near_completion_gap: "I get things to 70% then stall. Help me push through the last 30% with specific finishing steps.",
  },
  "cognitive.ai_role_in_thinking": {
    sounding_board: "Be my sounding board. Listen to my thinking, ask one probing question, don't jump to solutions.",
    devil_advocate: "Play devil's advocate. Challenge my assumptions and poke holes in my reasoning.",
    answer_machine: "Just give me the answer. I don't need to think out loud — I need solutions.",
    structured_guide: "Walk me through a structured thinking process. Help me think step by step.",
  },
};

/**
 * Generate a fallback rule from a dimension:value pair when no export_rule exists.
 * Has a catch-all that generates a readable rule from ANY dimension:value pair.
 */
function generateFallbackRule(dim: string, value: string, profile: PersonaProfile): string | null {
  // 1. Check curated templates first
  const template = FALLBACK_RULES[dim];
  if (template) {
    if (typeof template === "function") {
      return template(value, profile);
    }
    if (template[value]) return template[value];
  }

  // 2. Skip trivial/identity dimensions handled elsewhere
  if (dim === "identity.preferred_name" || dim === "identity.pronouns") return null;
  if (dim === "identity.timezone" || dim === "identity.timezone_region") return null;
  // Language is handled by generateConditionalRules → skip to avoid duplicate
  if (dim === "identity.language") return null;

  // 3. Catch-all: generate a human-readable rule from dimension name + value
  return generateCatchAllRule(dim, value);
}

/**
 * Generates a readable AI instruction from any dimension:value pair.
 * Converts dimension names like "work.energy_archetype" → "Work energy archetype"
 * and values like "burst_rest" → "burst rest".
 */
function generateCatchAllRule(dim: string, value: string): string | null {
  // Skip numeric-only values
  if (/^\d+(\.\d+)?$/.test(value)) return null;
  // Skip empty/trivial values
  if (/^(tak|nie|yes|no|none|brak|unknown|not detected|nie wykryto)$/i.test(value)) return null;
  // Skip very long prose with evidence markers (from AI scan)
  if (value.includes(" — na podstawie") || value.includes(" — źródło") || value.includes(" — evidence")) return null;

  // Template-based rules for known dimensions (USEFUL for quiz path without AI)
  const templates: Record<string, (v: string) => string> = {
    "context.occupation": (v) => `I work as ${v}. Keep this context in mind for work-related advice.`,
    "context.industry": (v) => `My industry: ${v}. Tailor recommendations to this domain.`,
    "context.location": (v) => `Based in ${v}. Use local context (currency, timezone, regulations) when relevant.`,
    "context.current_focus": (v) => `Currently focused on: ${v}. Prioritize this in suggestions.`,
    "personality.stress_response": (v) => `When I'm overwhelmed: ${v}.`,
    "personality.core_motivation": (v) => `What drives me: ${v}. Frame suggestions around this.`,
    "lifestyle.travel_style": (v) => `Travel style: ${v}.`,
    "lifestyle.dietary": (v) => `Dietary preference: ${v}.`,
    "cognitive.learning_style": (v) => `I learn best by: ${v}. Teach me this way.`,
    "cognitive.decision_style": (v) => `Decision style: ${v}.`,
    "ai.relationship_model": (v) => `I want AI to act as: ${v}.`,
    "ai.proactivity": (v) => `AI proactivity preference: ${v}.`,
    "life.location_type": (v) => `Location: ${v}. Use local context when relevant.`,
    "life.stage": (v) => `Life stage: ${v}. Calibrate advice accordingly.`,
    "life.financial_context": (v) => `Financial context: ${v}. Adjust recommendations.`,
    "life.priorities": (v) => `Current life priorities: ${v}.`,
    "life.health_context": (v) => `Health context: ${v}. Be mindful.`,
    "life.cultural_context": (v) => `Cultural background: ${v}.`,
    "life.family_context": (v) => `Family: ${v}. Consider this for personal advice.`,
    "life.relationship_status": (v) => `Relationship: ${v}.`,
    "lifestyle.hobbies": (v) => `Hobbies/interests: ${v}. Reference these for personal recommendations.`,
    "lifestyle.interests": (v) => `Interests: ${v}. Use these for personalized suggestions.`,
    "identity.age_range": (v) => `Age range: ${v}. Consider age-appropriate context.`,
  };

  const template = templates[dim];
  if (template) return template(value);

  // For remaining dimensions, generate only if short token-like value
  if (value.length > 80 && value.includes(" ")) return null;

  const category = dim.split(".")[0] || "";
  const trait = dim.split(".").slice(1).join(".");
  const readableTrait = humanizeValue(trait);
  const readableValue = humanizeValue(value);

  switch (category) {
    case "communication":
      return `Communication preference — ${readableTrait}: ${readableValue}.`;
    case "work":
      if (trait === "schedule" && /morning|afternoon|evening/i.test(value)) {
        const block = value.match(/(morning|afternoon|evening)/i)?.[1]?.toLowerCase();
        if (block === "morning") return "I'm most productive in the morning. Front-load important tasks.";
        if (block === "afternoon") return "I'm most productive in the afternoon. Don't schedule demanding work before noon.";
        if (block === "evening") return "I'm most productive in the evening. Keep mornings light.";
      }
      return `My work style — ${readableTrait}: ${readableValue}.`;
    case "ai":
      return `AI interaction preference — ${readableTrait}: ${readableValue}.`;
    case "context":
      return `Context — ${readableTrait}: ${readableValue}.`;
    case "expertise":
      return `Expertise — ${readableTrait}: ${readableValue}.`;
    default:
      return null;
  }
}

function humanizeDimension(dim: string): string {
  return dim
    .replace(/\./g, " — ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeValue(val: string): string {
  return val.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAi\b/g, "AI").replace(/\bAdhd\b/g, "ADHD");
}

// ─── Rule Collection ────────────────────────────────────────

/**
 * Collect all export rules from a profile.
 * Rules come from:
 * 1. Question options with export_rule field (explicit answers)
 * 1b. Fallback: dimension:value → rule templates (when no export_rule)
 * 2. Anti-pattern selections (direct negation rules)
 * 3. Compound signals with export_instruction
 * 4. Scan-detected dimensions
 */
/**
 * Validate that a profile has the minimum required structure.
 * Returns true if all required layers exist. Does NOT mutate the input.
 */
export function validateProfile(profile: PersonaProfile): boolean {
  if (!profile) return false;
  if (!profile.explicit || !profile.compound || !profile.inferred) return false;
  return true;
}

/**
 * Ensure a profile has all required layers, creating empty ones if missing.
 * NOTE: Mutates the profile in place for defensive safety — callers of
 * collectRules() may pass incomplete profiles during onboarding.
 */
function ensureProfileLayers(profile: PersonaProfile): void {
  if (!profile.explicit) (profile as any).explicit = {};
  if (!profile.compound) (profile as any).compound = {};
  if (!profile.inferred) (profile as any).inferred = {};
  if (!profile.emergent) (profile as any).emergent = [];
}

export function collectRules(
  profile: PersonaProfile,
  packExportRules?: Map<string, string | string[]> // dimension -> export_rule(s) from question JSON
): ExportRule[] {
  // Guard: ensure all layers exist
  ensureProfileLayers(profile);

  const rules: ExportRule[] = [];
  const seenDimensions = new Set<string>();

  // 0. AI-synthesized rules — highest quality, take priority
  if (packExportRules) {
    for (const [key, rule] of packExportRules) {
      if (key.startsWith("ai_synthesis_") && typeof rule === "string" && rule.length > 10) {
        rules.push({
          rule,
          source: "ai_synthesis",
          dimension: `_ai.${key}`,
          weight: 8, // high priority — AI saw the full picture
          confidence: 0.9,
        });
      }
    }
  }

  // If AI synthesis produced 10+ rules, skip template-based generation (it's inferior)
  if (rules.length >= 10) {
    // Still add anti-patterns (deterministic, ~95% compliance)
    const antiPatterns = profile.explicit["communication.anti_patterns"];
    const apList: string[] = Array.isArray(antiPatterns?.value)
      ? (antiPatterns.value as string[])
      : typeof antiPatterns?.value === "string" && antiPatterns.value.startsWith("[")
        ? (() => { try { return JSON.parse(antiPatterns.value as string); } catch { return []; } })()
        : typeof antiPatterns?.value === "string" ? (antiPatterns.value as string).split(/,\s*/).filter(Boolean) : [];
    for (const pattern of apList) {
      const apRule = ANTI_PATTERN_RULES[pattern];
      if (apRule) {
        rules.push({ rule: apRule, source: "anti_pattern", dimension: `anti_pattern.${pattern}`, weight: 9, confidence: 1.0 });
      }
    }

    // Add language rule
    const lang = profile.explicit["identity.language"]?.value;
    if (lang && typeof lang === "string" && lang !== "en") {
      rules.push({
        rule: "IF I write in Polish THEN respond in Polish. IF I write in English THEN respond in English. Match my language.",
        source: "conditional",
        dimension: "identity.language",
        weight: 10,
        confidence: 1.0,
      });
    }

    return deduplicateAndFilter(rules);
  }

  // 1. Explicit dimensions with export rules (fallback when no AI synthesis)
  for (const [dim, val] of Object.entries(profile.explicit)) {
    if (seenDimensions.has(dim)) continue;
    // Skip anti_patterns — handled separately below
    if (dim === "communication.anti_patterns") continue;
    // Skip name/pronouns — used in context section, not rules
    if (dim === "identity.preferred_name" || dim === "identity.pronouns") {
      seenDimensions.add(dim);
      continue;
    }
    seenDimensions.add(dim);

    // Look up export_rule(s) by dimension:value key
    const valStr = Array.isArray(val.value) ? val.value.join(",") : String(val.value);
    const exportRules = packExportRules?.get(`${dim}:${valStr}`);
    const exportRule = Array.isArray(exportRules) ? exportRules[0] : exportRules;

    if (exportRule) {
      rules.push({
        rule: exportRule,
        source: "explicit",
        dimension: dim,
        weight: getDimensionWeight(dim),
        confidence: val.confidence,
        sensitive: isSensitiveDimension(dim),
      });
      // Add additional rules from array beyond the first
      if (Array.isArray(exportRules) && exportRules.length > 1) {
        for (const rule of exportRules.slice(1)) {
          rules.push({
            rule,
            weight: getDimensionWeight(dim),
            confidence: val.confidence ?? 1.0,
            source: "explicit",
            dimension: dim,
            sensitive: isSensitiveDimension(dim),
          });
        }
      }
    } else {
      // Fallback: generate rule from dimension value using templates
      const fallbackRule = generateFallbackRule(dim, valStr, profile);
      if (fallbackRule) {
        rules.push({
          rule: fallbackRule,
          source: "explicit",
          dimension: dim,
          weight: getDimensionWeight(dim),
          confidence: val.confidence,
          sensitive: isSensitiveDimension(dim),
        });
      }
    }
  }

  // 2. Anti-patterns — each is a direct rule
  const antiPatterns = profile.explicit["communication.anti_patterns"];
  const antiPatternList: string[] = Array.isArray(antiPatterns?.value)
    ? (antiPatterns.value as string[])
    : typeof antiPatterns?.value === "string" && antiPatterns.value.startsWith("[")
      ? (() => { try { return JSON.parse(antiPatterns.value as string); } catch { return (antiPatterns.value as string).split(/,\s*/).filter(Boolean); } })()
      : typeof antiPatterns?.value === "string" && antiPatterns.value.length > 0
        ? (antiPatterns.value as string).split(/,\s*/).filter(Boolean)
        : [];
  if (antiPatterns && antiPatternList.length > 0) {
    for (const pattern of antiPatternList) {
      const rule = ANTI_PATTERN_RULES[pattern];
      if (rule) {
        rules.push({
          rule,
          source: "anti_pattern",
          dimension: `anti_pattern.${pattern}`,
          weight: 9, // anti-patterns are high priority — ~95% compliance
          confidence: 1.0,
        });
      }
    }
  }

  // 2b. Pet peeves — user-specified words/phrases to avoid
  const petPeeves = profile.explicit["communication.pet_peeves"];
  if (petPeeves && typeof petPeeves.value === "string" && petPeeves.value.trim()) {
    rules.push({
      rule: `Never use these words/phrases: ${petPeeves.value}`,
      source: "anti_pattern",
      dimension: "communication.pet_peeves",
      weight: 9,
      confidence: 1.0,
    });
  }

  // 2c. ADHD adaptations from inferred signals
  const adhdAdapt = profile.inferred["neurodivergent.adhd_adaptations"];
  if (adhdAdapt && adhdAdapt.value && typeof adhdAdapt.value === "string") {
    rules.push({
      rule: adhdAdapt.value,
      source: "inferred",
      dimension: "neurodivergent.adhd_adaptations",
      weight: 7,
      confidence: adhdAdapt.confidence,
    });
  }

  // 3. Compound signals with export instructions (skip if explicit rule already covers this dimension)
  for (const [dim, val] of Object.entries(profile.compound)) {
    if (val.export_instruction) {
      // Skip if an explicit rule already covers the base dimension
      // e.g., compound.directness → check if communication.directness has explicit rule
      const baseDim = dim.replace("compound.", "");
      const hasExplicit = rules.some(r =>
        r.source === "explicit" &&
        (r.dimension === baseDim || r.dimension.endsWith("." + baseDim))
      );
      if (hasExplicit) continue;

      rules.push({
        rule: val.export_instruction,
        source: "compound",
        dimension: dim,
        weight: getDimensionWeight(dim),
        confidence: val.confidence,
      });
    }
  }

  // 4. Inferred dimensions (secondary/primary only)
  for (const [dim, val] of Object.entries(profile.inferred)) {
    if (val.override === "flag_only") continue;
    if (seenDimensions.has(dim)) continue;
    seenDimensions.add(dim);

    // Try behavioral template first, then fallback/catch-all
    const ruleTemplate = INFERRED_RULE_TEMPLATES[val.value];
    const ruleText = ruleTemplate ?? generateFallbackRule(dim, val.value, profile);
    if (ruleText) {
      rules.push({
        rule: ruleText,
        source: "inferred",
        dimension: dim,
        weight: Math.max(1, getDimensionWeight(dim) - 2), // slightly lower than explicit
        confidence: val.confidence,
      });
    }
  }

  // 5. Custom corrections from pack export rules (keys starting with "custom")
  if (packExportRules) {
    for (const [key, ruleOrRules] of packExportRules) {
      if (!key.startsWith("custom")) continue;
      const customRules = Array.isArray(ruleOrRules) ? ruleOrRules : [ruleOrRules];
      for (const rule of customRules) {
        if (typeof rule === "string" && rule.trim()) {
          rules.push({
            rule,
            source: "explicit",
            dimension: `custom.${key}`,
            weight: 8,
            confidence: 1.0,
          });
        }
      }
    }
  }

  // 6. Scan-derived rules — generated from scan-inferred dimensions
  const scanRules = generateScanRules(profile);
  rules.push(...scanRules);

  // 7. Conditional rules — context-dependent behavior
  const conditionalRules = generateConditionalRules(profile);
  rules.push(...conditionalRules);

  // 8. Observed communication style rules (from AI interview observation)
  const observed = generateObservedStyleRules(profile);
  rules.push(...observed);

  // 9. Example-based rules (GOOD/BAD response examples)
  rules.push(...generateExampleRules(profile));

  // 10. Baseline rules for thin profiles (non-technical users, sparse dimensions)
  const baselineRules = generateBaselineRules(profile, rules.length);
  rules.push(...baselineRules);

  // 11. AI Synthesis rules — highest-quality, contextual rules from deep analysis
  if (profile.synthesis) {
    // 11a. Export rules from AI synthesis (weight 10 = highest priority)
    for (const rule of (profile.synthesis.exportRules ?? [])) {
      rules.push({
        rule,
        source: "ai_synthesis",
        dimension: "synthesis.export_rule",
        weight: 10,
        confidence: 0.85,
        sensitive: false,
      });
    }
    // 11b. Communication adaptations (weight 9 = very high priority)
    for (const adaptation of (profile.synthesis.communicationDNA?.adaptations ?? [])) {
      rules.push({
        rule: adaptation,
        source: "ai_synthesis",
        dimension: "synthesis.communication_adaptation",
        weight: 9,
        confidence: 0.80,
        sensitive: false,
      });
    }
  }

  // Sort: weight DESC, then confidence DESC
  // Critical rules first (anti-patterns, communication), then work, then life
  const sorted = rules.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.dimension.localeCompare(b.dimension);
  });

  // Final pass: remove generic rules, near-duplicates, and conflicting rules
  const deduplicated = deduplicateAndFilter(sorted);
  return resolveConflicts(deduplicated);
}

// ─── Rule Formatting ────────────────────────────────────────

/**
 * Format rules for ChatGPT Custom Instructions
 * Two fields: "About me" (context) + "How to respond" (rules)
 */
export function formatForChatGPT(
  profile: PersonaProfile,
  rules: ExportRule[],
  config: RuleCompilerConfig
): { aboutMe: string; howToRespond: string } {
  const name = getName(profile);

  // ABOUT ME — rich context section (~600 chars)
  const lang = getExplicitValue(profile, "identity.language");
  const isPl = lang && /^(pl|polish|polski)$/i.test(lang);
  const aboutParts: string[] = [];

  // Identity
  const roleType = getExplicitValue(profile, "context.role_type");
  const occupation = getExplicitValue(profile, "context.occupation");
  const role = roleType || occupation;
  if (role) {
    aboutParts.push(isPl ? `Jestem ${name}. Pracuję jako ${role}.` : `My name is ${name}. I work as ${role}.`);
  } else {
    aboutParts.push(isPl ? `Jestem ${name}.` : `My name is ${name}.`);
  }

  // Tech stack
  const techStack = getExplicitValue(profile, "expertise.tech_stack");
  if (techStack) aboutParts.push(`Tech: ${techStack}.`);

  // Industry/companies
  const industry = getExplicitValue(profile, "context.industry");
  if (industry) {
    // Filter garbage words (3 chars or less, known stop words)
    const cleaned = industry.split(",").map(s => s.trim()).filter(s => s.length > 3 && !/^(inne|com|docs|logo|pro|www|net|org)$/i.test(s));
    if (cleaned.length > 0) {
      aboutParts.push(isPl ? `Pracuję z: ${cleaned.join(", ")}.` : `I work with: ${cleaned.join(", ")}.`);
    }
  }

  // Self description / use case
  const selfDesc = getExplicitValue(profile, "identity.self_description");
  if (selfDesc) aboutParts.push(selfDesc);
  const useCase = getExplicitValue(profile, "primary_use_case");
  if (useCase) aboutParts.push(isPl ? `Używam AI do: ${useCase}.` : `I use AI for ${useCase}.`);

  // Vision / goals
  const vision = getExplicitValue(profile, "identity.vision");
  if (vision) aboutParts.push(isPl ? `Cel: ${vision}.` : `Goal: ${vision}.`);

  // Motivation
  const motivation = getExplicitValue(profile, "personality.core_motivation") || getExplicitValue(profile, "personality.motivation");
  if (motivation) aboutParts.push(isPl ? `Motywacja: ${motivation}.` : `Motivation: ${motivation}.`);

  // Location
  const location = getExplicitValue(profile, "life.location_type") || getExplicitValue(profile, "context.location");
  if (location) aboutParts.push(isPl ? `Lokalizacja: ${location}.` : `Location: ${location}.`);

  // Age
  const age = getExplicitValue(profile, "identity.age_range");
  if (age) aboutParts.push(isPl ? `Wiek: ${age.replace(/_/g, '-')}.` : `Age: ${age.replace(/_/g, '-')}.`);

  // Life stage
  const lifeStage = getExplicitValue(profile, "life.stage");
  if (lifeStage) aboutParts.push(isPl ? `Etap: ${lifeStage.replace(/_/g, ' ')}.` : `Stage: ${lifeStage.replace(/_/g, ' ')}.`);

  // Priorities
  const priorities = getExplicitValue(profile, "life.priorities");
  if (priorities) aboutParts.push(isPl ? `Priorytety: ${priorities}.` : `Priorities: ${priorities}.`);

  // Family
  const family = getExplicitValue(profile, "life.family_context");
  if (family) aboutParts.push(isPl ? `Rodzina: ${family}.` : `Family: ${family}.`);

  // Hobbies
  const hobbies = getExplicitValue(profile, "lifestyle.hobbies") || getExplicitValue(profile, "lifestyle.interests");
  if (hobbies) aboutParts.push(isPl ? `Hobby: ${hobbies}.` : `Hobbies: ${hobbies}.`);

  // Language
  if (lang && !/^(en|english)$/i.test(lang)) aboutParts.push(isPl ? `Język: ${lang}.` : `Language: ${lang}.`);

  let aboutMe = aboutParts.join(" ");

  // Enforce per-field limit (1500 chars each for ChatGPT)
  if (aboutMe.length > config.maxChars) {
    aboutMe = truncateAtWordBoundary(aboutMe, config.maxChars);
  }

  // HOW TO RESPOND — rules section (1500 chars max for its own field)
  // Sort by weight DESC so the highest-priority rules survive the char limit cut.
  const filteredRules = rules
    .filter((r) => !(r.sensitive && !config.includeSensitive))
    .sort((a, b) => b.weight - a.weight);

  const ruleLines: string[] = [];
  // Budget for the rules field itself (separate field, own 1500 char limit)
  let charBudget = config.maxChars - 8; // "RULES:\n" header

  for (const rule of filteredRules) {
    if (ruleLines.length >= config.maxRules) break;
    const line = `${ruleLines.length + 1}. ${rule.rule}`;
    // Skip entire rule rather than include a partial one
    if (line.length + 1 > charBudget) continue;
    ruleLines.push(line);
    charBudget -= line.length + 1;
  }

  // Lost in the Middle mitigation: add language reminder at end (different phrasing)
  // LLMs attend most to the start and end of instructions
  if (ruleLines.length >= 4) {
    const langVal = getExplicitValue(profile, "identity.language");
    if (langVal && !/^(en|english)$/i.test(langVal)) {
      const reminder = `${ruleLines.length + 1}. REMEMBER: Always match my language. If I write in ${langVal}, respond in ${langVal}.`;
      if (reminder.length + 1 <= charBudget) {
        ruleLines.push(reminder);
      }
    }
  }

  const howToRespond = "RULES:\n" + ruleLines.join("\n");

  return { aboutMe, howToRespond };
}

/**
 * Format rules for Claude (Projects/Preferences)
 * Rich markdown with XML tags for better compliance
 */
export function formatForClaude(
  profile: PersonaProfile,
  rules: ExportRule[],
  config: RuleCompilerConfig
): string {
  const name = getName(profile);
  const sections: string[] = [];

  sections.push(`# About ${name}\n`);

  // Context block
  if (config.includeContext) {
    sections.push("<user-context>");
    const contextLines = buildContextLines(profile);
    sections.push(contextLines.join("\n"));
    sections.push("</user-context>\n");
  }

  // Rules block — XML tags improve Claude compliance
  sections.push("<communication-rules>");
  const filteredRules = filterRules(rules, config);

  for (let i = 0; i < filteredRules.length; i++) {
    sections.push(`${i + 1}. ${filteredRules[i].rule}`);
  }
  sections.push("</communication-rules>");

  sections.push(
    "\n---\n*Generated by meport — portable AI profile*"
  );

  return sections.join("\n");
}

/**
 * Format rules for Claude Code (CLAUDE.md)
 * Compact, high-signal, placed before project instructions
 */
export function formatForClaudeCode(
  profile: PersonaProfile,
  rules: ExportRule[],
  config: RuleCompilerConfig
): string {
  const name = getName(profile);
  const sections: string[] = [];

  sections.push("# User Profile (meport)\n");

  // Compact rules
  sections.push("## Rules");
  const filteredRules = filterRules(rules, config);
  for (const rule of filteredRules) {
    sections.push(`- ${rule.rule}`);
  }

  // Tech context
  const techStack = getExplicitValue(profile, "expertise.tech_stack");
  if (techStack) {
    sections.push(`\n## Tech\n- ${techStack}`);
  }

  // Language
  const lang = getExplicitValue(profile, "identity.language");
  if (lang && lang !== "en") {
    sections.push(`\n## Language\n- ${lang} primary`);
  }

  return sections.join("\n");
}

/**
 * Format rules for Cursor (.cursor/rules/meport.mdc)
 * MDC frontmatter + coding-focused rules
 */
export function formatForCursor(
  profile: PersonaProfile,
  rules: ExportRule[],
  config: RuleCompilerConfig
): string {
  const sections: string[] = [];

  // MDC frontmatter (YAML-safe values)
  sections.push("---");
  sections.push("description: User profile and preferences (meport)");
  sections.push('globs: "**/*"');
  sections.push("alwaysApply: true");
  sections.push("---\n");

  // Filter to coding-relevant rules
  const codingRules = filterRules(rules, config).filter((r) => {
    // Skip lifestyle/health/finance for Cursor
    if (r.sensitive) return false;
    if (r.dimension.startsWith("lifestyle.")) return false;
    if (r.dimension.startsWith("health.")) return false;
    if (r.dimension.startsWith("finance.")) return false;
    return true;
  });

  for (const rule of codingRules) {
    sections.push(`- ${rule.rule}`);
  }

  // Tech context
  const techStack = getExplicitValue(profile, "expertise.tech_stack");
  if (techStack) {
    sections.push(`\n## Tech Stack\n- ${techStack}`);
  }

  return sections.join("\n");
}

/**
 * Format rules for Ollama Modelfile SYSTEM
 */
export function formatForOllama(
  profile: PersonaProfile,
  rules: ExportRule[],
  config: RuleCompilerConfig
): string {
  const name = getName(profile);
  const filteredRules = filterRules(rules, config);

  const lines: string[] = [];
  lines.push(`You are talking to ${name}.\n`);
  lines.push("Follow these rules strictly:\n");

  for (let i = 0; i < filteredRules.length; i++) {
    lines.push(`${i + 1}. ${filteredRules[i].rule}`);
  }

  return lines.join("\n");
}

// ─── Tech Stack Groups ──────────────────────────────────────

/**
 * Technology groupings for context detection.
 * Keys map to user-facing context names; values are dimension values
 * that activate that group.
 */
const TECH_GROUPS: Record<string, { label: string; stack: string[] }> = {
  modern_web: {
    label: "JavaScript/TypeScript/web",
    stack: ["js_ts", "react", "svelte", "vue"],
  },
  systems: {
    label: "Rust/Go/systems",
    stack: ["rust", "go"],
  },
  enterprise: {
    label: ".NET/Java",
    stack: ["dotnet", "jvm"],
  },
  python_data_ai: {
    label: "Python/data/AI-ML",
    stack: ["python", "ai_ml"],
  },
  mobile: {
    label: "mobile (iOS/React Native/Flutter)",
    stack: ["ios", "mobile"],
  },
  infra: {
    label: "infrastructure/databases",
    stack: ["cloud", "devops", "sql", "nosql"],
  },
};

/**
 * Maps human-readable tech string fragments (as they appear in comma-separated
 * tech_stack strings) to their canonical group token IDs.
 * Used when tech_stack arrives as a string instead of a pre-tokenised array.
 */
const TECH_STRING_TO_TOKEN: Array<{ patterns: RegExp[]; token: string }> = [
  {
    patterns: [/javascript/i, /typescript/i, /\bjs\b/i, /\bts\b/i, /js\/ts/i],
    token: "js_ts",
  },
  { patterns: [/\breact\b/i], token: "react" },
  { patterns: [/\bsvelte\b/i], token: "svelte" },
  { patterns: [/\bvue\b/i], token: "vue" },
  { patterns: [/\brust\b/i], token: "rust" },
  { patterns: [/\bgolang\b/i, /^go$/i], token: "go" },
  { patterns: [/\.net\b/i, /\bdotnet\b/i, /\bc#\b/i, /\bblazor\b/i], token: "dotnet" },
  { patterns: [/\bjava\b/i, /\bkotlin\b/i, /\bscala\b/i, /\bjvm\b/i], token: "jvm" },
  { patterns: [/\bpython\b/i], token: "python" },
  {
    patterns: [/ai\/ml/i, /\bai-ml\b/i, /machine learning/i, /\bpytorch\b/i, /\btensorflow\b/i],
    token: "ai_ml",
  },
  { patterns: [/\bios\b/i, /\bswift\b/i, /\bflutter\b/i, /react native/i], token: "ios" },
  { patterns: [/\bmobile\b/i, /\bandroid\b/i], token: "mobile" },
  {
    patterns: [/\baws\b/i, /\bgcp\b/i, /\bazure\b/i, /\bcloud\b/i, /\bkubernetes\b/i, /\bk8s\b/i],
    token: "cloud",
  },
  {
    patterns: [/\bdocker\b/i, /\bterraform\b/i, /\bdevops\b/i, /\bci\/cd\b/i],
    token: "devops",
  },
  {
    patterns: [
      /\bpostgresql\b/i,
      /\bpostgres\b/i,
      /\bmysql\b/i,
      /\bsqlite\b/i,
      /\bsupabase\b/i,
      /\bsql\b/i,
    ],
    token: "sql",
  },
  {
    patterns: [/\bmongodb\b/i, /\bredis\b/i, /\bnosql\b/i, /\bdynamodb\b/i],
    token: "nosql",
  },
];

/**
 * Normalises a human-readable tech label to its group token (e.g. "JavaScript/TypeScript" → "js_ts").
 * Returns undefined if no token matches.
 */
function normalizeTechLabel(label: string): string | undefined {
  for (const { patterns, token } of TECH_STRING_TO_TOKEN) {
    if (patterns.some((p) => p.test(label))) return token;
  }
  return undefined;
}

/** Occupation keywords → context type */
const OCCUPATION_ROLE_PATTERNS: Array<{
  keywords: string[];
  role: "technical" | "management" | "business" | "creative" | "support";
}> = [
  { keywords: ["architect", "engineer", "developer", "programmer", "coder", "dev", "devlead", "cto"], role: "technical" },
  { keywords: ["manager", "director", "head of", "vp", "ceo", "coo", "lead", "principal"], role: "management" },
  { keywords: ["founder", "freelance", "consultant", "solo", "independent", "self-employed"], role: "business" },
  { keywords: ["designer", "ux", "ui", "creative", "writer", "copywriter", "content"], role: "creative" },
  { keywords: ["support", "helpdesk", "analyst", "ops", "operations", "implementation", "erp"], role: "support" },
];

/** Secondary domain values that indicate business context */
const BUSINESS_SECONDARY_DOMAINS = new Set(["sales", "marketing", "operations", "finance", "legal"]);

/** Secondary domain values that indicate technical context */
const TECHNICAL_SECONDARY_DOMAINS = new Set(["software", "data", "hardware", "science"]);

// ─── Context Detection ──────────────────────────────────────

interface DetectedContext {
  techGroups: Array<{ groupId: string; label: string; stacks: string[] }>;
  hasMultipleTechContexts: boolean;
  roles: Array<"technical" | "management" | "business" | "creative" | "support">;
  isFounder: boolean;
  hasBusinessContext: boolean;
  hasTechnicalContext: boolean;
  hasWritingContext: boolean;
  primaryDomain: string | undefined;
  currentFocus: string | undefined;
  occupation: string | undefined;
  workMode: string | undefined;
  industries: string[];
}

/**
 * Detect which work contexts are active for this user.
 * Reads from multiple profile dimensions — NOT hardcoded for any specific user.
 */
function detectContexts(profile: PersonaProfile): DetectedContext {
  // 1. Tech stack — collect all selected values
  const techStackRaw = profile.explicit["expertise.tech_stack"]?.value;
  const rawItems: string[] = Array.isArray(techStackRaw)
    ? (techStackRaw as string[])
    : typeof techStackRaw === "string" && techStackRaw.length > 0
      ? techStackRaw.split(", ").flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean)
      : [];

  // Normalise each item: if it's already a token (e.g. "js_ts"), keep it;
  // otherwise attempt to map it from a human-readable label (e.g. "JavaScript/TypeScript").
  const techStackValues: string[] = rawItems.map((item) => {
    const normalized = normalizeTechLabel(item);
    return normalized ?? item; // fall back to raw value so existing token-based profiles still work
  });

  // Map each tech value to its group(s)
  const activeGroups: Array<{ groupId: string; label: string; stacks: string[] }> = [];
  for (const [groupId, group] of Object.entries(TECH_GROUPS)) {
    const matchingStacks = group.stack.filter((s) => techStackValues.includes(s));
    if (matchingStacks.length > 0) {
      activeGroups.push({ groupId, label: group.label, stacks: matchingStacks });
    }
  }

  // 2. Occupation roles — parse free text
  const occupation = getExplicitValue(profile, "context.occupation");
  const detectedRoles: Array<"technical" | "management" | "business" | "creative" | "support"> = [];
  if (occupation) {
    const lowerOcc = occupation.toLowerCase();
    for (const { keywords, role } of OCCUPATION_ROLE_PATTERNS) {
      if (keywords.some((kw) => lowerOcc.includes(kw))) {
        if (!detectedRoles.includes(role)) detectedRoles.push(role);
      }
    }
  }

  // 3. Life stage → founder detection
  const lifeStage = getExplicitValue(profile, "context.life_stage");
  const isFounder =
    lifeStage === "founder" ||
    (occupation !== undefined &&
      ["founder", "freelance", "independent"].some((kw) =>
        occupation.toLowerCase().includes(kw)
      ));

  // 4. Secondary domains
  const secondaryRaw = profile.explicit["expertise.secondary_domains"]?.value;
  const secondaryValues: string[] = Array.isArray(secondaryRaw)
    ? (secondaryRaw as string[])
    : typeof secondaryRaw === "string" && secondaryRaw.length > 0
      ? secondaryRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  const hasBusinessContext =
    isFounder ||
    detectedRoles.includes("business") ||
    detectedRoles.includes("management") ||
    secondaryValues.some((v) => BUSINESS_SECONDARY_DOMAINS.has(v));

  const hasTechnicalContext =
    activeGroups.length > 0 ||
    detectedRoles.includes("technical") ||
    secondaryValues.some((v) => TECHNICAL_SECONDARY_DOMAINS.has(v));

  // 5. Writing context — presence of observed style signals or creative/communicator work mode
  const workMode = getExplicitValue(profile, "expertise.work_mode");
  const hasWritingContext =
    workMode === "communicator" ||
    detectedRoles.includes("creative") ||
    profile.explicit["observed.formality"] !== undefined ||
    profile.explicit["observed.message_style"] !== undefined;

  // 6. Industries
  const industriesRaw = profile.explicit["expertise.industries"]?.value;
  const industries: string[] = Array.isArray(industriesRaw)
    ? (industriesRaw as string[])
    : typeof industriesRaw === "string" && industriesRaw.length > 0
      ? industriesRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  return {
    techGroups: activeGroups,
    hasMultipleTechContexts: activeGroups.length > 1,
    roles: detectedRoles,
    isFounder,
    hasBusinessContext,
    hasTechnicalContext,
    hasWritingContext,
    primaryDomain: getExplicitValue(profile, "expertise.primary_domain"),
    currentFocus: getExplicitValue(profile, "context.current_focus"),
    occupation,
    workMode,
    industries,
  };
}

// ─── Context Section Builders ────────────────────────────────

/**
 * Build tech stack context sections — one per language group when multiple are present.
 * When only one group exists, collapses into a single ## section.
 */
function buildTechContextSections(
  ctx: DetectedContext,
  profile: PersonaProfile,
  rules: ExportRule[]
): string[] {
  const sections: string[] = [];
  if (ctx.techGroups.length === 0) return sections;

  const expertiseLevel =
    getExplicitValue(profile, "expertise.primary_depth") ??
    getExplicitValue(profile, "expertise.level") ??
    getExplicitValue(profile, "work.expertise_level");

  const isExpert =
    expertiseLevel !== undefined &&
    ["4", "5", "6", "expert", "senior", "authority"].includes(expertiseLevel);

  const primaryDomain = ctx.primaryDomain;
  const currentFocus = ctx.currentFocus;

  // Collect expertise rules to inject
  const expertiseRules = rules.filter(
    (r) => r.dimension.startsWith("expertise.") || r.dimension.startsWith("work.")
  );

  if (!ctx.hasMultipleTechContexts) {
    // Single tech context — simple section
    const group = ctx.techGroups[0];
    sections.push(`\n## When helping with ${group.label}`);
    if (primaryDomain) sections.push(`- My primary domain: ${primaryDomain}`);
    if (currentFocus) sections.push(`- Current focus: ${currentFocus}`);
    if (isExpert) {
      sections.push("- Skip basics. Use technical terms. I know the fundamentals.");
      sections.push("- Show idiomatic patterns for my stack, not generic solutions.");
    } else {
      sections.push("- Brief explanation of non-obvious choices is welcome.");
    }
    for (const r of expertiseRules.slice(0, 3)) {
      sections.push(`- ${r.rule}`);
    }
    return sections;
  }

  // Multiple tech contexts — detect which groups map to which purpose.
  // Heuristic: systems/enterprise groups often mean "client/legacy work";
  // modern_web/python often mean "personal or greenfield projects".
  const personalGroupIds = new Set(["modern_web", "python_data_ai", "mobile"]);
  const enterpriseGroupIds = new Set(["enterprise", "infra"]);
  const systemsGroupIds = new Set(["systems"]);

  const personalTech = ctx.techGroups.filter((g) => personalGroupIds.has(g.groupId));
  const enterpriseTech = ctx.techGroups.filter((g) => enterpriseGroupIds.has(g.groupId));
  const systemsTech = ctx.techGroups.filter((g) => systemsGroupIds.has(g.groupId));

  // Merge systems with personal (e.g. Rust + TS for a native app is one context)
  const combinedPersonal = [...personalTech, ...systemsTech];

  if (combinedPersonal.length > 0) {
    const combinedLabel = combinedPersonal.map((g) => g.label).join(" + ");
    sections.push(`\n## When helping with ${combinedLabel}`);
    if (primaryDomain) sections.push(`- My main thing: ${primaryDomain}`);
    if (currentFocus) sections.push(`- Current project: ${currentFocus}`);
    if (isExpert) {
      sections.push("- Use advanced patterns. Skip fundamentals.");
      sections.push("- Suggest idiomatic solutions for this stack.");
    }
    for (const r of expertiseRules.slice(0, 2)) {
      sections.push(`- ${r.rule}`);
    }
  }

  if (enterpriseTech.length > 0) {
    const enterpriseLabel = enterpriseTech.map((g) => g.label).join(" + ");
    sections.push(`\n## When helping with ${enterpriseLabel}`);
    sections.push("- This is likely client/maintenance work, not a greenfield project.");
    sections.push("- Prioritize working solutions over elegant architecture.");
    sections.push("- Check backward compatibility. Don't assume latest versions.");
    if (
      ctx.industries.includes("manufacturing") ||
      ctx.industries.includes("ecommerce")
    ) {
      sections.push(
        "- Context: line-of-business systems (ERP/inventory/operations). Reliability > cleverness."
      );
    }
  }

  return sections;
}

/**
 * Build business/founder context section.
 */
function buildBusinessContextSection(
  ctx: DetectedContext,
  profile: PersonaProfile
): string[] {
  const sections: string[] = [];
  if (!ctx.hasBusinessContext) return sections;

  sections.push("\n## When helping with business/sales/strategy");

  if (ctx.isFounder) {
    const lifeStage = getExplicitValue(profile, "context.life_stage");
    if (lifeStage === "founder") {
      sections.push(
        "- I'm building my own business. Every recommendation affects my time and money directly."
      );
    } else {
      sections.push("- I own/run a business. Revenue, sustainability, and growth are the lens.");
    }
    sections.push("- Consider cost implications. I pay for everything myself.");
    sections.push("- I need practical steps I can execute, not frameworks that require a team.");
  } else if (ctx.roles.includes("management")) {
    sections.push(
      "- I manage people or a business unit. Recommendations must be implementable by a team."
    );
    sections.push("- I care about stakeholder buy-in, not just technical correctness.");
  }

  if (ctx.roles.includes("business") || ctx.isFounder) {
    sections.push(
      "- For sales/outreach: give me scripts I can use verbatim. I'm technical, not a natural salesperson."
    );
  }

  sections.push(
    "- Recommendations: show the trade-off, then give a clear verdict. Don't leave me hanging."
  );

  // Industry-specific context — first matching hint wins
  const industryHints: Record<string, string> = {
    startup: "Startup context: speed and learning matter more than perfection.",
    enterprise: "Enterprise context: politics and process are real constraints — factor them in.",
    consulting: "Consulting context: client communication and deliverable quality are the product.",
    manufacturing: "Manufacturing context: uptime and reliability matter more than features.",
  };
  for (const ind of ctx.industries) {
    if (industryHints[ind]) {
      sections.push(`- ${industryHints[ind]}`);
      break;
    }
  }

  return sections;
}

/**
 * Build writing/communication context section.
 */
function buildWritingContextSection(
  ctx: DetectedContext,
  profile: PersonaProfile
): string[] {
  const sections: string[] = [];
  if (!ctx.hasWritingContext) return sections;

  sections.push("\n## When helping with writing/emails/communication");

  const formality = getExplicitValue(profile, "observed.formality");
  if (formality) sections.push(`- Match my ${formality} tone.`);

  const lang = getExplicitValue(profile, "identity.language");
  if (lang && lang !== "en") {
    sections.push(`- Default to ${lang} unless I write in English. Match my language.`);
  }

  sections.push("- Mirror my vocabulary and sentence length — don't write longer than I do.");

  if (ctx.roles.includes("creative")) {
    sections.push("- For creative work: offer options, not a single answer. I'll choose and refine.");
  }

  return sections;
}

/**
 * Build research/analysis context section — only shown when work_mode=analyst
 * or user has science/data secondary domains.
 */
function buildAnalysisContextSection(
  ctx: DetectedContext,
  profile: PersonaProfile
): string[] {
  const sections: string[] = [];

  const secondaryRaw = profile.explicit["expertise.secondary_domains"]?.value;
  const secondaryValues: string[] = Array.isArray(secondaryRaw)
    ? (secondaryRaw as string[])
    : typeof secondaryRaw === "string" && secondaryRaw.length > 0
      ? secondaryRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  const hasAnalysisContext =
    ctx.workMode === "analyst" ||
    secondaryValues.some((v) => ["data", "science"].includes(v)) ||
    ctx.industries.some((i) => ["finance", "healthcare"].includes(i));

  if (!hasAnalysisContext) return sections;

  sections.push("\n## When helping with research/analysis");
  sections.push("- Show your reasoning, not just the conclusion.");
  sections.push("- If data is uncertain, say so explicitly. I can handle nuance.");
  sections.push("- Structured output preferred: tables, bullet comparisons, numbered steps.");

  return sections;
}

/**
 * Format rules with context-specific sections.
 * Auto-detects which contexts are active from profile dimensions —
 * NOT hardcoded for any specific user.
 *
 * Contexts detected:
 * - Per-technology-group sections (one per language cluster when multiple stacks present)
 * - Business/founder context (from life_stage + occupation + secondary domains)
 * - Writing/communication context (from work_mode + observed style)
 * - Analysis/research context (from work_mode + secondary domains + industries)
 *
 * Platform routing:
 * - CLAUDE.md / Cursor / Copilot: full context sections included
 * - ChatGPT: condensed (character limit respected)
 */
export function formatWithContexts(
  profile: PersonaProfile,
  rules: ExportRule[],
  config: RuleCompilerConfig
): string {
  const name = getName(profile);
  const sections: string[] = [];
  const ctx = detectContexts(profile);

  sections.push(`# ${name}'s AI Profile\n`);

  // ── Universal rules (always apply) ──────────────────────────
  const universalRules = rules.filter(
    (r) =>
      r.source === "anti_pattern" ||
      r.dimension.startsWith("communication.") ||
      r.dimension.startsWith("observed.") ||
      r.dimension.startsWith("example.") ||
      r.dimension.startsWith("conditional.")
  );

  if (universalRules.length > 0) {
    const filteredUniversal = universalRules
      .filter((r) => !(r.sensitive && !config.includeSensitive))
      .slice(0, config.maxRules);

    sections.push("## Always\n");
    for (const r of filteredUniversal) {
      sections.push(`- ${r.rule}`);
    }
  }

  // ── Compound signal sections ─────────────────────────────────
  // Group compound rules by category instead of silently dropping them
  const COGNITIVE_WORK_COMPOUNDS = new Set([
    "compound.adhd_pattern",
    "compound.cognitive_style",
    "compound.work_rhythm",
    "compound.anxiety_pattern",
    "compound.free_spirit",
    "compound.needs_guidance",
  ]);
  const AI_INTERACTION_COMPOUNDS = new Set([
    "compound.autonomy",
    "compound.power_user",
    "compound.directness",
  ]);

  const cogWorkRules = rules.filter(
    (r) => r.source === "compound" && COGNITIVE_WORK_COMPOUNDS.has(r.dimension)
  );
  const aiInteractionRules = rules.filter(
    (r) => r.source === "compound" && AI_INTERACTION_COMPOUNDS.has(r.dimension)
  );
  const otherCompoundRules = rules.filter(
    (r) =>
      r.source === "compound" &&
      !COGNITIVE_WORK_COMPOUNDS.has(r.dimension) &&
      !AI_INTERACTION_COMPOUNDS.has(r.dimension)
  );

  if (cogWorkRules.length > 0) {
    sections.push("\n## Cognitive & Work Style\n");
    for (const r of cogWorkRules) {
      sections.push(`- ${r.rule}`);
    }
  }

  if (aiInteractionRules.length > 0) {
    sections.push("\n## AI Interaction\n");
    for (const r of aiInteractionRules) {
      sections.push(`- ${r.rule}`);
    }
  }

  if (otherCompoundRules.length > 0) {
    sections.push("\n## Behavioral Patterns\n");
    for (const r of otherCompoundRules) {
      sections.push(`- ${r.rule}`);
    }
  }

  // ── Explicit dimension rules (non-communication, non-compound) ──
  // These are rules generated from explicit profile answers that don't fit
  // into the "Always" section (which only takes communication.* dimensions)
  const explicitNonComm = rules.filter(
    (r) =>
      r.source === "explicit" &&
      !r.dimension.startsWith("communication.") &&
      !r.dimension.startsWith("observed.") &&
      !r.dimension.startsWith("example.") &&
      !r.dimension.startsWith("conditional.")
  );

  if (explicitNonComm.length > 0) {
    // Group by category for clean output
    const categoryOrder = ["identity", "work", "cognitive", "personality", "neurodivergent", "expertise", "life", "ai"];
    const categoryLabels: Record<string, string> = {
      identity: "Identity & Context",
      work: "Work Style",
      cognitive: "Thinking & Learning",
      personality: "Personality",
      neurodivergent: "Neurodivergent Traits",
      expertise: "Expertise & Skills",
      life: "Life Context",
      ai: "AI Preferences",
    };

    for (const cat of categoryOrder) {
      const catRules = explicitNonComm.filter((r) => r.dimension.startsWith(`${cat}.`));
      if (catRules.length === 0) continue;

      const filteredCat = catRules.filter(
        (r) => !(r.sensitive && !config.includeSensitive)
      );
      if (filteredCat.length === 0) continue;

      sections.push(`\n## ${categoryLabels[cat] || cat}\n`);
      for (const r of filteredCat) {
        sections.push(`- ${r.rule}`);
      }
    }
  }

  // ── About section (always include — gives AI essential context) ──
  const aboutLines = buildContextLines(profile);
  if (aboutLines.length > 1) { // > 1 because name is always there
    sections.push("\n## About\n");
    for (const line of aboutLines) {
      sections.push(`- ${line}`);
    }
  }

  // ── Context sections (platform-dependent) ───────────────────
  if (config.includeContext) {
    if (config.platform === "chatgpt") {
      // ChatGPT: condensed single section — char budget is tight
      buildChatGPTContextSummary(ctx, profile, config, sections);
    } else {
      // Full context sections for Claude, Cursor, Copilot, Claude Code, etc.
      sections.push(...buildTechContextSections(ctx, profile, rules));
      sections.push(...buildBusinessContextSection(ctx, profile));
      sections.push(...buildWritingContextSection(ctx, profile));
      sections.push(...buildAnalysisContextSection(ctx, profile));
    }
  }

  // ── Enforce character limit ──────────────────────────────────
  if (config.maxChars > 0) {
    const footer = "\n---\n*Generated by meport — portable AI profile*";
    let output = sections.join("\n");

    if (output.length + footer.length > config.maxChars) {
      // Strategy: keep header + "## Always" rules (highest value),
      // then add sections until budget exhausted.
      // Drop lowest-value sections first: analysis > writing > business > tech > compound > always
      const sectionPriority = [
        "## When helping with research",
        "## When helping with writing",
        "## When helping with business",
        "## When helping with", // tech sections
        "## Behavioral Patterns",
        "## AI Interaction",
        "## Cognitive & Work Style",
        "## Context",
        "## Always", // highest priority, dropped last
      ];

      // Remove sections from lowest priority until within budget
      for (const sectionStart of sectionPriority) {
        if (output.length + footer.length <= config.maxChars) break;

        // Find and remove this section (from its header to next ## or end)
        const idx = output.indexOf(sectionStart);
        if (idx === -1) continue;

        const nextSection = output.indexOf("\n## ", idx + sectionStart.length);
        if (nextSection === -1) {
          output = output.slice(0, idx).trimEnd();
        } else {
          output = output.slice(0, idx) + output.slice(nextSection);
        }
      }

      // If STILL over budget (unlikely), truncate individual rules from "## Always" section
      if (output.length + footer.length > config.maxChars) {
        const lines = output.split("\n");
        let prevLength = lines.length + 1; // guard against infinite loop
        while (lines.length > 3 && output.length + footer.length > config.maxChars && lines.length < prevLength) {
          prevLength = lines.length;
          // Remove last bullet point line (lowest weight since rules are sorted by weight DESC)
          for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].startsWith("- ")) {
              lines.splice(i, 1);
              break;
            }
          }
          output = lines.join("\n");
        }
        // Final safety: word-boundary truncate if still over
        if (output.length + footer.length > config.maxChars) {
          output = truncateAtWordBoundary(output, config.maxChars - footer.length);
        }
      }

      // Replace sections array content
      sections.length = 0;
      sections.push(output);
    }
  }

  sections.push("\n---\n*Generated by meport — portable AI profile*");

  return sections.join("\n");
}

/**
 * Format rules for Windsurf (.windsurfrules)
 * Compact markdown — coding-focused rules only, no lifestyle/health/finance.
 * Target: ≤6000 chars (Windsurf 2026 limit per file).
 */
export function formatForWindsurf(
  profile: PersonaProfile,
  rules: ExportRule[],
  config: RuleCompilerConfig
): string {
  const sections: string[] = [];
  sections.push("# User Preferences\n");

  const codingRules = rules.filter(
    (r) =>
      !r.sensitive &&
      !r.dimension.startsWith("lifestyle") &&
      !r.dimension.startsWith("health") &&
      !r.dimension.startsWith("finance")
  );

  const filtered = filterRules(codingRules, config);
  for (const rule of filtered) {
    sections.push(`- ${rule.rule}`);
  }

  const techStack = getExplicitValue(profile, "expertise.tech_stack");
  if (techStack) {
    sections.push(`\n## Stack\n- ${techStack}`);
  }

  let output = sections.join("\n");
  if (output.length > config.maxChars) {
    output = truncateAtWordBoundary(output, config.maxChars);
  }
  return output;
}

/**
 * Format rules for AGENTS.md (OpenAI Codex)
 * Markdown with ## About section + rules. Coding-focused, no lifestyle/health/finance.
 * Target: ≤4000 chars.
 */
export function formatForAgentsMd(
  profile: PersonaProfile,
  rules: ExportRule[],
  config: RuleCompilerConfig
): string {
  const sections: string[] = [];

  sections.push("# User Preferences (meport)\n");
  sections.push("## About");

  const occupation = getExplicitValue(profile, "identity.professional_role") || getExplicitValue(profile, "context.occupation");
  if (occupation) sections.push(`- Role: ${occupation.replace(/_/g, " ")}`);

  const techStack = getExplicitValue(profile, "expertise.tech_stack");
  if (techStack) sections.push(`- Stack: ${techStack}`);

  const expertise = getExplicitValue(profile, "expertise.level");
  if (expertise) sections.push(`- Experience: ${expertise}`);

  sections.push("\n## Communication Rules");

  const codingRules = rules.filter(
    (r) =>
      !r.sensitive &&
      !r.dimension.startsWith("lifestyle") &&
      !r.dimension.startsWith("health") &&
      !r.dimension.startsWith("finance")
  );

  const filtered = filterRules(codingRules, config);
  for (const rule of filtered) {
    sections.push(`- ${rule.rule}`);
  }

  const lang = getExplicitValue(profile, "identity.language");
  if (lang && lang !== "en") {
    sections.push(`\n## Language\n- Respond in: ${lang}`);
  }

  let output = sections.join("\n");
  if (output.length > config.maxChars) {
    output = truncateAtWordBoundary(output, config.maxChars);
  }
  return output;
}

/**
 * Condensed context summary for ChatGPT (char-limited).
 * Emits a single "Context" section instead of per-domain sections.
 */
function buildChatGPTContextSummary(
  ctx: DetectedContext,
  profile: PersonaProfile,
  config: RuleCompilerConfig,
  sections: string[]
): void {
  const contextLines: string[] = [];

  if (ctx.primaryDomain) contextLines.push(`Primary domain: ${ctx.primaryDomain}.`);
  const role = ctx.occupation || getExplicitValue(profile, "identity.professional_role");
  if (role) contextLines.push(`Role: ${role.replace(/_/g, " ")}.`);
  if (ctx.currentFocus) contextLines.push(`Current focus: ${ctx.currentFocus}.`);

  if (ctx.techGroups.length > 0) {
    const stackLabel = ctx.techGroups.map((g) => g.label).join(", ");
    contextLines.push(`Tech: ${stackLabel}.`);
    if (ctx.hasMultipleTechContexts) {
      contextLines.push(
        "When helping with client/legacy work: prioritize working solutions over clean architecture."
      );
    }
  }

  if (ctx.isFounder) {
    contextLines.push("I run my own business. Factor in time and cost. Give me actionable steps.");
  } else if (ctx.hasBusinessContext) {
    contextLines.push("For business decisions: show trade-offs, then give a clear verdict.");
  }

  const lang = getExplicitValue(profile, "identity.language");
  if (lang && lang !== "en") {
    contextLines.push(`Respond in ${lang} by default.`);
  }

  if (contextLines.length === 0) return;

  // Enforce char budget — leave room for the universal rules section
  let budget = config.maxChars - 300;
  const fitted: string[] = [];
  for (const line of contextLines) {
    if (line.length > budget) break;
    fitted.push(line);
    budget -= line.length + 1;
  }

  if (fitted.length > 0) {
    sections.push("\n## Context\n");
    for (const line of fitted) {
      sections.push(`- ${line}`);
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────

function getName(profile: PersonaProfile): string {
  return String(
    profile.explicit["identity.preferred_name"]?.value
    ?? profile.explicit["identity.name"]?.value
    ?? "User"
  );
}

export function getExplicitValue(
  profile: PersonaProfile,
  dimension: string
): string | undefined {
  const val = profile.explicit[dimension]?.value;
  if (val === undefined || val === null) return undefined;
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function isSensitiveDimension(dim: string): boolean {
  return (
    dim.startsWith("health.") ||
    dim.startsWith("finance.")
  );
}

function filterRules(
  rules: ExportRule[],
  config: RuleCompilerConfig
): ExportRule[] {
  return rules
    .filter((r) => {
      if (r.sensitive && !config.includeSensitive) return false;
      return true;
    })
    .slice(0, config.maxRules);
}

function buildContextLines(profile: PersonaProfile): string[] {
  const lines: string[] = [];
  const name = getName(profile);
  lines.push(`Name: ${name}`);

  // Try both question-bank dimension names and legacy names
  const occupation = getExplicitValue(profile, "identity.professional_role") || getExplicitValue(profile, "context.occupation");
  if (occupation) {
    const readable = occupation.replace(/_/g, " ");
    lines.push(`Role: ${readable}`);
  }

  const useCase = getExplicitValue(profile, "identity.primary_use_case") || getExplicitValue(profile, "primary_use_case");
  if (useCase) {
    const readable = useCase.replace(/_/g, " ");
    lines.push(`Uses AI for: ${readable}`);
  }

  const lang = getExplicitValue(profile, "identity.language");
  if (lang && lang !== "en") {
    const langNames: Record<string, string> = {
      pl: "Polish", de: "German", es: "Spanish", fr: "French",
      pt: "Portuguese", it: "Italian", nl: "Dutch", ja: "Japanese",
    };
    lines.push(`Language: ${langNames[lang] || lang}`);
  }

  const techComfort = getExplicitValue(profile, "identity.tech_comfort");
  if (techComfort) {
    const readable = techComfort.replace(/_/g, " ");
    lines.push(`Tech comfort: ${readable}`);
  }

  const age = getExplicitValue(profile, "identity.age_range");
  if (age && age !== "unknown") lines.push(`Age: ${age}`);

  const pronouns = getExplicitValue(profile, "identity.pronouns");
  if (pronouns && pronouns !== "unknown" && pronouns !== "neutral") lines.push(`Pronouns: ${pronouns}`);

  const timezone = getExplicitValue(profile, "identity.timezone_region") || getExplicitValue(profile, "identity.timezone");
  if (timezone && timezone !== "other") lines.push(`Timezone: ${timezone}`);

  const techStack = getExplicitValue(profile, "expertise.tech_stack");
  if (techStack) lines.push(`Tech stack: ${techStack}`);

  const expertise = getExplicitValue(profile, "expertise.level");
  if (expertise) lines.push(`Experience: ${expertise}`);

  const secondary = getExplicitValue(profile, "expertise.secondary");
  if (secondary) lines.push(`Also knows: ${secondary}`);

  const selfDesc = getExplicitValue(profile, "identity.self_description");
  if (selfDesc) lines.push(`Self: ${selfDesc}`);

  const achievement = getExplicitValue(profile, "identity.key_achievement");
  if (achievement) lines.push(`Achievement: ${achievement}`);

  const vision = getExplicitValue(profile, "identity.vision");
  if (vision) lines.push(`Goal: ${vision}`);

  const energy = getExplicitValue(profile, "work.energy_archetype");
  if (energy) lines.push(`Energy: ${energy}`);

  const frustration = getExplicitValue(profile, "identity.ai_frustration");
  if (frustration) {
    const readable = frustration.replace(/_/g, " ");
    lines.push(`Top AI frustration: ${readable}`);
  }

  // Add synthesis-derived context (archetype, cognitive style, communication tone)
  if (profile.synthesis) {
    if (profile.synthesis.archetype) {
      lines.push(`Archetype: ${profile.synthesis.archetype}`);
    }
    if (profile.synthesis.cognitiveProfile?.thinkingStyle) {
      lines.push(`Thinking: ${profile.synthesis.cognitiveProfile.thinkingStyle}`);
    }
    if (profile.synthesis.communicationDNA?.tone) {
      lines.push(`Tone: ${profile.synthesis.communicationDNA.tone}`);
    }
    if (profile.synthesis.communicationDNA?.directness) {
      lines.push(`Directness: ${profile.synthesis.communicationDNA.directness}`);
    }
  }

  return lines;
}

// ─── Scan-Derived Rules ──────────────────────────────────────

/**
 * Generate actionable export rules from scan-inferred dimensions.
 *
 * The file scanner writes dimensions like `expertise.tech_stack`,
 * `context.occupation`, etc. into `profile.explicit`, but those entries have
 * no `export_rule` strings in the packExportRules map, so `collectRules` step 1
 * silently skips them.  This function closes that gap.
 *
 * Weight 5 — lower than pack-based rules (6-9) because scan values are
 * inferred, not explicitly confirmed.
 */
export function generateScanRules(profile: PersonaProfile): ExportRule[] {
  const rules: ExportRule[] = [];

  const SCAN_WEIGHT = 5;

  /** Return undefined if the value is empty, "unknown", or whitespace-only. */
  function scanVal(dim: string): string | undefined {
    const raw = profile.explicit[dim]?.value;
    if (raw === undefined || raw === null) return undefined;
    const s = Array.isArray(raw) ? raw.filter(Boolean).join(", ") : String(raw).trim();
    if (!s || s.toLowerCase() === "unknown") return undefined;
    return s;
  }

  // expertise.tech_stack
  const techStack = scanVal("expertise.tech_stack");
  if (techStack) {
    rules.push({
      rule: `When showing code examples, use ${techStack}. Don't suggest solutions in frameworks I don't use unless I ask.`,
      source: "scan",
      dimension: "expertise.tech_stack",
      weight: SCAN_WEIGHT,
      confidence: 0.8,
    });
  }

  // expertise.tools_ai
  const toolsAI = scanVal("expertise.tools_ai");
  if (toolsAI) {
    rules.push({
      rule: `I use ${toolsAI} — skip setup instructions for these. Jump to the advanced usage.`,
      source: "scan",
      dimension: "expertise.tools_ai",
      weight: SCAN_WEIGHT,
      confidence: 0.8,
    });
  }

  // expertise.tools_code
  const toolsCode = scanVal("expertise.tools_code");
  if (toolsCode) {
    rules.push({
      rule: `My editor/tools: ${toolsCode}. Format code snippets and configs for these tools specifically.`,
      source: "scan",
      dimension: "expertise.tools_code",
      weight: SCAN_WEIGHT,
      confidence: 0.8,
    });
  }

  // expertise.tools_design
  const toolsDesign = scanVal("expertise.tools_design");
  if (toolsDesign) {
    rules.push({
      rule: `Design tools: ${toolsDesign}. IF discussing design THEN reference these tools' capabilities and formats.`,
      source: "scan",
      dimension: "expertise.tools_design",
      weight: SCAN_WEIGHT,
      confidence: 0.75,
    });
  }

  // context.occupation — only if not already covered by explicit pack answer
  if (!profile.explicit["context.occupation"]) {
    const occupation = scanVal("context.occupation");
    if (occupation) {
      rules.push({
        rule: `I work as ${occupation}. Keep this context when giving career/work advice.`,
        source: "scan",
        dimension: "context.occupation",
        weight: SCAN_WEIGHT,
        confidence: 0.75,
      });
    }
  }

  // context.projects
  const projects = scanVal("context.projects");
  if (projects) {
    rules.push({
      rule: `Active projects: ${projects}. IF I mention a project name THEN assume this context.`,
      source: "scan",
      dimension: "context.projects",
      weight: SCAN_WEIGHT,
      confidence: 0.7,
    });
  }

  // context.industry
  const industry = scanVal("context.industry");
  if (industry) {
    rules.push({
      rule: `Industry: ${industry}. Use domain terminology. Don't explain industry basics.`,
      source: "scan",
      dimension: "context.industry",
      weight: SCAN_WEIGHT,
      confidence: 0.75,
    });
  }

  // context.location
  const location = scanVal("context.location");
  if (location) {
    rules.push({
      rule: `I'm based in ${location}. Localize recommendations (currency, services, regulations).`,
      source: "scan",
      dimension: "context.location",
      weight: SCAN_WEIGHT,
      confidence: 0.8,
    });
  }

  // identity.timezone
  const timezone = scanVal("identity.timezone");
  if (timezone) {
    rules.push({
      rule: `My timezone is ${timezone}. Adapt time references accordingly.`,
      source: "scan",
      dimension: "identity.timezone",
      weight: SCAN_WEIGHT,
      confidence: 0.9,
    });
  }

  // identity.language — skip if the conditional rule generator will emit it
  // (it already emits a language rule when lang !== "en"). Only add here if
  // not already handled to avoid a near-duplicate.
  const lang = scanVal("identity.language");
  if (lang && lang === "en") {
    // English is the default — no rule needed.
  }
  // Non-English is handled by generateConditionalRules → skip to avoid duplication.

  // context.current_obsession
  const obsession = scanVal("context.current_obsession");
  if (obsession) {
    rules.push({
      rule: `I'm currently focused on ${obsession}. Prioritize help in this area.`,
      source: "scan",
      dimension: "context.current_obsession",
      weight: SCAN_WEIGHT,
      confidence: 0.7,
    });
  }

  // context.role_type → role-specific rule
  const roleType = scanVal("context.role_type");
  if (roleType) {
    const roleRules: Record<string, string> = {
      founder:
        "I'm a founder. Frame every recommendation through a revenue and sustainability lens. I own the risk.",
      employee:
        "I'm an employee. Factor in career growth, stakeholder buy-in, and org constraints.",
      freelancer:
        "I'm a freelancer. Factor in client management, project scope, and billing when relevant.",
      consultant:
        "I'm a consultant. Deliverable quality and client communication are the product.",
      student:
        "I'm a student. Explain the reasoning behind solutions — I'm building mental models, not just shipping.",
    };
    // Extract first token — scan stores "freelancer — na podstawie..." but lookup needs "freelancer"
    const roleKey = roleType.toLowerCase().split(/[\s,—–\-]/)[0].trim();
    const ruleText = roleRules[roleKey] || roleRules[roleType.toLowerCase()];
    if (ruleText) {
      rules.push({
        rule: ruleText,
        source: "scan",
        dimension: "context.role_type",
        weight: SCAN_WEIGHT,
        confidence: 0.75,
      });
    }
  }

  // context.seniority → seniority-adapted rule
  const seniorityRaw = scanVal("context.seniority");
  const seniority = seniorityRaw?.toLowerCase().split(/[\s,—–\-]/)[0].trim();
  if (seniority) {
    const seniorityRules: Record<string, string> = {
      senior: "I'm a senior. Skip basics and introductory explanations — get to the advanced answer.",
      starszy: "I'm a senior. Skip basics and introductory explanations — get to the advanced answer.",
      lead: "I'm a tech lead. I care about trade-offs, team impact, and maintainability, not just solutions.",
      lider: "I'm a tech lead. I care about trade-offs, team impact, and maintainability, not just solutions.",
      principal:
        "I'm a principal/staff engineer. Focus on architectural impact, not implementation details.",
      junior: "I'm junior. Brief explanations of non-obvious choices help me build mental models.",
      młodszy: "I'm junior. Brief explanations of non-obvious choices help me build mental models.",
      mid: "I have a few years of experience. Skip fundamentals but a sentence of context on non-obvious choices is welcome.",
      średni: "I have a few years of experience. Skip fundamentals but a sentence of context on non-obvious choices is welcome.",
    };
    const ruleText = seniorityRules[seniority.toLowerCase()];
    if (ruleText) {
      rules.push({
        rule: ruleText,
        source: "scan",
        dimension: "context.seniority",
        weight: SCAN_WEIGHT,
        confidence: 0.75,
      });
    }
  }

  // personality.organization_level
  const orgLevel = scanVal("personality.organization_level");
  if (orgLevel) {
    const orgRules: Record<string, string> = {
      high:
        "I'm highly organized. Give me structured, step-by-step responses. I follow checklists and process.",
      low:
        "I'm not highly organized. Lead with the one most important action. Don't give me 10-step lists.",
      medium:
        "I'm moderately organized. A short numbered list is fine but don't over-structure.",
    };
    const ruleText = orgRules[orgLevel.toLowerCase()];
    if (ruleText) {
      rules.push({
        rule: ruleText,
        source: "scan",
        dimension: "personality.organization_level",
        weight: SCAN_WEIGHT,
        confidence: 0.7,
      });
    }
  }

  // ai.dream_interaction — meta-rule about ideal AI interaction style
  const dreamInteraction = scanVal("ai.dream_interaction");
  if (dreamInteraction) {
    rules.push({
      rule: dreamInteraction,
      source: "scan",
      dimension: "ai.dream_interaction",
      weight: SCAN_WEIGHT + 1, // slightly higher — user described their ideal explicitly
      confidence: 0.85,
    });
  }

  return rules;
}

// ─── Conditional Rules ──────────────────────────────────────

/**
 * Generate conditional (context-dependent) export rules.
 * These adapt AI behavior based on user signals like time, keywords, or mode.
 * ~2-3x more effective than static rules because they match context.
 */
function generateConditionalRules(profile: PersonaProfile): ExportRule[] {
  const rules: ExportRule[] = [];

  const verbosity = getExplicitValue(profile, "communication.verbosity_preference");
  const expertise = getExplicitValue(profile, "expertise.level") || getExplicitValue(profile, "work.expertise_level");
  const techStack = getExplicitValue(profile, "expertise.tech_stack");
  const lang = getExplicitValue(profile, "identity.language");
  const energy = getExplicitValue(profile, "work.energy_archetype");

  // ── SPECIFICITY BOOST ──────────────────────────────────────────────────────
  // Transform potentially generic signals into concrete, user-specific rules.
  // A rule like "be concise" is useless. The same intent expressed as
  // "Keep responses under 3 paragraphs unless I ask for detail" is actionable.

  // "be concise" → only emit when verbosity is explicitly minimal, AND make it concrete
  if (verbosity === "frustrated" || verbosity === "minimal") {
    rules.push({
      rule: "Keep responses under 3 paragraphs unless I ask for detail. Lead with the answer, not the context.",
      source: "conditional", dimension: "conditional.verbosity_boost", weight: 8, confidence: 1.0,
    });
    rules.push({
      rule: "IF I say 'quick', 'szybko', 'krótko', or 'tldr' THEN respond in max 3 lines. No preamble.",
      source: "conditional", dimension: "conditional.verbosity_trigger", weight: 8, confidence: 1.0,
    });
  }

  // "use examples" → only emit when user prefers hands-on/experiential learning AND has a tech stack
  const learningStyle = getExplicitValue(profile, "cognitive.learning_style");
  if (techStack && learningStyle && (learningStyle === "hands_on" || learningStyle === "experiential")) {
    const primaryStack = techStack.split(",")[0].trim();
    rules.push({
      rule: `Include code examples in ${primaryStack} when explaining concepts.`,
      source: "conditional", dimension: "conditional.examples_boost", weight: 6, confidence: 0.85,
    });
  }

  // ── CONDITIONAL RULES (context-dependent) ─────────────────────────────────

  // Energy-based conditional
  if (energy === "burst" || energy === "sprinter") {
    rules.push({
      rule: "IF I'm in a burst (rapid messages, short commands) THEN match my speed. Skip explanations. Action-first.",
      source: "conditional", dimension: "conditional.burst_mode", weight: 7, confidence: 0.9,
    });
  }

  // Expertise conditional
  if (expertise === "expert" || expertise === "senior") {
    const techContext = techStack ? ` (especially ${techStack.split(",")[0].trim()})` : "";
    rules.push({
      rule: `IF topic is in my expertise area${techContext} THEN skip basics, use technical terms, assume I know the fundamentals.`,
      source: "conditional", dimension: "conditional.expertise_context", weight: 7, confidence: 0.9,
    });
  }

  // Code vs writing conditional — specific enough to keep (has concrete action + domain split)
  if (techStack) {
    rules.push({
      rule: `IF helping with code THEN lead with the code snippet, explanation only if asked. IF helping with writing/email THEN adapt to my tone and style.`,
      source: "conditional", dimension: "conditional.domain_switch", weight: 6, confidence: 0.85,
    });
  }

  // Language conditional
  if (lang && lang !== "en") {
    rules.push({
      rule: `IF I write in ${lang} THEN respond in ${lang}. IF I write in English THEN respond in English. Match my language.`,
      source: "conditional", dimension: "conditional.language_match", weight: 8, confidence: 1.0,
    });
  }

  // ADHD conditional
  const adhd = profile.compound["compound.adhd_pattern"];
  if (adhd && (adhd.value === "strong" || adhd.value === "moderate")) {
    rules.push({
      rule: "IF presenting a task or plan THEN break into chunks of max 15-25 minutes. Lead with the interesting part, not the setup. One priority at a time.",
      source: "conditional", dimension: "conditional.adhd_adapt", weight: 7, confidence: adhd.confidence,
    });
  }

  return rules;
}

// ─── Observed Style Rules ───────────────────────────────────

/**
 * Generate rules from observed communication patterns.
 * These come from the AI interviewer silently observing the user's writing style.
 */
function generateObservedStyleRules(profile: PersonaProfile): ExportRule[] {
  const rules: ExportRule[] = [];

  const messageStyle = getExplicitValue(profile, "observed.message_style");
  if (messageStyle === "terse") {
    rules.push({
      rule: "Match my brevity. Max 3-5 sentences for simple questions. I keep things short — so should you.",
      source: "observed", dimension: "observed.message_style", weight: 7, confidence: 0.85,
    });
  } else if (messageStyle === "verbose") {
    rules.push({
      rule: "I write detailed messages. Read them fully. You can be thorough in return — I appreciate depth.",
      source: "observed", dimension: "observed.message_style", weight: 6, confidence: 0.8,
    });
  }

  const formality = getExplicitValue(profile, "observed.formality");
  if (formality === "casual") {
    rules.push({
      rule: "Use casual, friendly language. Skip formality. Talk to me like a colleague, not a client.",
      source: "observed", dimension: "observed.formality", weight: 6, confidence: 0.8,
    });
  } else if (formality === "formal") {
    rules.push({
      rule: "Maintain professional tone. Clear, structured, respectful language.",
      source: "observed", dimension: "observed.formality", weight: 6, confidence: 0.8,
    });
  }

  const emojiUsage = getExplicitValue(profile, "observed.emoji_usage");
  if (emojiUsage === "never") {
    rules.push({
      rule: "Don't use emoji. I don't use them — neither should you.",
      source: "observed", dimension: "observed.emoji_usage", weight: 8, confidence: 0.9,
    });
  }

  return rules;
}

// ─── Example-Based Rules ────────────────────────────────────

/**
 * Generate concrete GOOD/BAD response examples from profile.
 * Example-based rules are 2-3x more effective than abstract instructions
 * because they show the AI exactly what to aim for.
 */
function generateExampleRules(profile: PersonaProfile): ExportRule[] {
  const rules: ExportRule[] = [];

  // Build a GOOD example based on communication preferences
  const verbosity = getExplicitValue(profile, "communication.verbosity_preference");
  const directness = getExplicitValue(profile, "communication.directness");
  const antiPatterns = profile.explicit["communication.anti_patterns"];
  const antiList: string[] = Array.isArray(antiPatterns?.value)
    ? (antiPatterns.value as string[])
    : typeof antiPatterns?.value === "string" ? antiPatterns.value.split(",").map(s => s.trim().replace(/[\[\]"]/g, "")).filter(Boolean) : [];

  const hasPraise = antiList.includes("no_praise");
  const hasHedging = antiList.includes("no_hedging");
  const hasEmoji = antiList.includes("no_emoji");
  const hasOverwriting = antiList.includes("no_overwriting");

  // Construct BAD example (everything they hate)
  const badParts: string[] = [];
  if (hasPraise) badParts.push("Great question!");
  if (hasHedging) badParts.push("I think maybe");
  if (hasEmoji) badParts.push("🚀");
  badParts.push("you could potentially consider");
  if (hasOverwriting) badParts.push("Also, here are 5 other things you didn't ask about...");

  // Construct GOOD example
  const goodParts: string[] = [];
  if (verbosity === "frustrated" || verbosity === "minimal") {
    goodParts.push("Yes. Use `X`. Here's why: [1 sentence].");
  } else if (directness === "blunt" || directness === "direct") {
    goodParts.push("`X` is better than `Y` because Z. Done.");
  } else {
    goodParts.push("Here's the answer: [direct response]. Background: [brief context].");
  }

  if (badParts.length >= 2 && goodParts.length > 0) {
    rules.push({
      rule: `BAD response to me: "${badParts.join(" ")}" — GOOD response to me: "${goodParts.join(" ")}"`,
      source: "example",
      dimension: "example.response_style",
      weight: 9,
      confidence: 1.0,
    });
  }

  // Technical context example if they're technical
  const techStack = getExplicitValue(profile, "expertise.tech_stack");
  const expertise = getExplicitValue(profile, "expertise.level") || getExplicitValue(profile, "work.expertise_level");
  if (techStack && (expertise === "expert" || expertise === "senior")) {
    rules.push({
      rule: `When I ask about ${techStack.split(",")[0].trim()}: skip "what is X" explanations. Jump to the advanced answer. I'll ask if I need basics.`,
      source: "example",
      dimension: "example.technical_level",
      weight: 7,
      confidence: 0.9,
    });
  }

  return rules;
}

// ─── Anti-Pattern Rule Map ──────────────────────────────────

const ANTI_PATTERN_RULES: Record<string, string> = {
  no_emoji: "Never use emoji.",
  no_praise:
    "Never start with praise like 'Great question!' — go straight to the answer.",
  no_unsolicited_advice: "Don't give advice I didn't ask for.",
  no_hedging:
    "Give confident, direct answers. Don't hedge with 'I think maybe...' or excessive caveats.",
  no_handholding:
    "Don't over-explain basics. I'll ask if I need clarification.",
  no_overwriting: "Answer exactly what was asked, no more.",
  no_corporate:
    "Use plain language. No corporate jargon like 'leverage', 'synergy', 'stakeholder'.",
  no_apologies:
    "Don't apologize excessively. Acknowledge mistakes briefly and fix them.",
};

// ─── Inferred Rule Templates ────────────────────────────────

const INFERRED_RULE_TEMPLATES: Record<string, string> = {
  // Behavioral signals → rules
  quick_responder: "I respond fast — match my pace. Keep things moving.",
  deliberate_responder:
    "I take time to think. Don't rush me with rapid-fire options.",
  verbose_writer:
    "I write long messages — read them fully before responding.",
  terse_writer:
    "I keep messages short. Match my brevity in responses.",
  skip_heavy:
    "I skip questions I find irrelevant. Respect that — don't repeat them.",
};
