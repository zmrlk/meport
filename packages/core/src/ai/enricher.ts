/**
 * AI Enricher — deep personality analysis engine.
 * Runs in background during profiling. Produces multi-layer personality synthesis.
 *
 * Accepts both AIClientFull and the simpler legacy AIClient shape.
 */

// Compatible with AIClientFull from ./client.js and legacy generate-only clients
type AIClient = {
  generate(prompt: string): Promise<string>;
  chat?(messages: any[], options?: any): Promise<string>;
};

export interface EnrichmentResult {
  inferred: Record<string, { value: string; confidence: number; evidence: string }>;
  exportRules: string[];
  patterns: string[]; // cross-dimensional patterns detected
}

export interface CognitiveProfile {
  thinkingStyle: string;
  learningMode: string;
  decisionPattern: string;
  attentionType: string;
}

export interface CommunicationDNA {
  tone: string;
  formality: string;
  directness: string;
  adaptations: string[];
}

export interface Contradiction {
  area: string;
  observation: string;
  resolution: string;
}

export interface Prediction {
  context: string;
  prediction: string;
  confidence: number;
}

export interface SynthesisResult {
  narrative: string;
  additionalInferred: Record<string, { value: string; confidence: number; evidence: string }>;
  exportRules: string[];
  emergent: { title: string; observation: string }[];
  archetype?: string;
  // Rich synthesis fields
  archetypeDescription?: string;
  cognitiveProfile?: CognitiveProfile;
  communicationDNA?: CommunicationDNA;
  contradictions?: Contradiction[];
  predictions?: Prediction[];
  strengths?: string[];
  blindSpots?: string[];
}

export interface FollowUpQuestion {
  id: string;
  question: string;
  options: string[];
  dimension: string;
  why: string;
}

// ─── MegaSynthesis Types ────────────────────────────────

export interface MicroQuestion {
  id: string;
  question: string;
  why: string;
  dimension: string;
  options?: string[];
  type?: "preference" | "scenario" | "disambiguation" | "depth" | "comparison";
  /** For "comparison" type: two AI response examples to choose between */
  compareA?: string;
  compareB?: string;
}

/** A single import source with type metadata */
export interface ImportSource {
  type: "instructions" | "conversation" | "file";
  platform?: string;
  content: string;
  filename?: string;
}

/** Behavioral signals captured during the import & micro question phases */
export interface BehavioralSignals {
  /** Total keystrokes in the paste textarea */
  keystrokeCount?: number;
  /** Seconds spent on the import screen before submitting */
  importDwellTimeSec?: number;
  /** Milliseconds hovering over each platform pill before selecting */
  platformHoverMs?: Record<string, number>;
  /** Time-to-first-keystroke in paste area (ms) */
  timeToFirstKeystrokeMs?: number;
  /** How many times user switched between tabs before submitting */
  tabSwitchCount?: number;
}

export interface MegaSynthesisInput {
  browserContext: Record<string, string>;
  /** Legacy single-source fields (still supported for backward compat) */
  pastedText?: string;
  pastedPlatform?: string;
  uploadedFileContents?: string[];
  /** Multi-source import — each tagged by type */
  sources?: ImportSource[];
  /** Behavioral signals from the UI */
  behavioralSignals?: BehavioralSignals;
  locale: string;
}

/** Behavioral signals captured from micro question interactions */
export interface MicroAnswerMeta {
  /** Milliseconds the user spent before answering */
  responseTimeMs: number;
  /** Whether the user changed their selection before confirming */
  changedMind: boolean;
}

export interface MegaSynthesisResult {
  dimensions: Record<string, { value: string; confidence: number; evidence: string; weight?: number }>;
  exportRules: string[];
  microQuestions: MicroQuestion[];
  narrative: string;
  archetype: string;
  archetypeDescription: string;
  cognitiveProfile: string;
  communicationDNA: string;
  contradictions: string[];
  predictions: string[];
  strengths: string[];
  blindSpots: string[];
  emergent: string[];
}

// ─── System Prompts ──────────────────────────────────────

const ENRICHMENT_SYSTEM_PROMPT = `You are a world-class personality analyst. You don't just fill in blanks — you connect dots, find patterns, and make bold inferences.

Given a user's profile dimensions, browser signals, and optionally file system data, perform CROSS-DIMENSIONAL ANALYSIS:

1. **Connect dimensions** — How does their work style relate to communication? How does personality affect learning? What does their tech stack reveal about their thinking style?
2. **Read between the lines** — A developer who uses Vim AND values brevity AND works late? That's a pattern. Name it.
3. **Infer from combinations** — Single dimensions are boring. The magic is in intersections.
4. **Browser/file signals matter** — timezone+locale = lifestyle clues. File types = interests. Project names = priorities.

Return ONLY valid JSON:
{
  "inferred": {
    "dimension.name": { "value": "specific, not generic", "confidence": 0.75, "evidence": "Because X combined with Y suggests..." }
  },
  "exportRules": [
    "When [specific context], do [specific behavior] because [this person's trait]"
  ],
  "patterns": [
    "Short description of cross-dimensional pattern found"
  ]
}

Rules:
- Infer 5-12 dimensions. Be BOLD — confidence 0.5 is fine for speculative but interesting inferences
- Export rules must be SPECIFIC and CONTEXTUAL: "When this user asks for code review, prioritize logic over style — they catch their own typos" NOT "Be helpful"
- Patterns: 2-4 cross-dimensional connections you noticed
- Reference ACTUAL data in evidence. "You said X and Y, which together suggest Z"
- Write in the user's locale language
- Be a brilliant analyst, not a form filler`;

const FOLLOWUP_SYSTEM_PROMPT = `You are a masterful interviewer who asks the ONE question that changes everything about understanding someone.

You already know some things about this person. Your job: find the HIGHEST-INFORMATION questions — the ones where the answer dramatically changes the profile.

Three types of powerful questions:
1. **Disambiguation** — You detected a tension ("values efficiency but chose a slow creative process"). Ask about it.
2. **Depth probes** — You know WHAT but not WHY. Go deeper on personality-revealing dimensions.
3. **Cross-domain bridges** — "You're analytical at work — does that extend to personal decisions, or do you switch off?"

Return ONLY valid JSON:
{
  "questions": [
    {
      "id": "followup_1",
      "question": "Natural, conversational, references what you already know",
      "options": ["Specific option A", "Specific option B", "Specific option C", "It depends..."],
      "dimension": "target.dimension.key",
      "why": "This matters because knowing X would let AI adapt Y"
    }
  ]
}

Rules:
- 3-5 options per question. Options must be SPECIFIC and PERSONAL, not generic
- Reference what you know: "You mentioned you're a developer who values brevity..."
- Questions should feel like a brilliant friend noticing something about you, not a survey
- Max 4 questions. Each one should be a revelation moment.
- Last option can be "It depends..." or "Something else..."
- Write in the user's locale language`;

const INTERMEDIATE_SYNTHESIS_PROMPT = `You are presenting your initial read on someone's personality. This is a DRAFT — the person will review and correct it.

Your job: Show what you've understood so far. Be specific enough that the person can say "yes, that's me" or "no, that's wrong". Generic summaries are useless.

Return ONLY valid JSON:
{
  "narrative": "5-8 sentences. Personal, specific. Reference actual answers. Make bold claims. 'You're the type who...' not 'You seem to...' Write like a friend who just figured something out about you.",
  "emergent": [
    { "title": "Bold pattern name", "observation": "What you noticed and WHY it matters for AI interaction" }
  ],
  "archetype": "Evocative label — not generic. 'The Midnight Architect' not 'The Thinker'",
  "exportRules": [
    "Specific AI adaptation rule with context"
  ],
  "additionalInferred": {}
}

Rules:
- Narrative: PERSONAL and SPECIFIC. "You process information in bursts — deep dive then surface for air. Your natural rhythm is sprint-rest-sprint, and AI that interrupts a sprint with clarifying questions will frustrate you." NOT "You're a hard worker."
- Emergent patterns: 3-5 interesting observations. Include at least one TENSION or CONTRADICTION you noticed.
- Archetype: compound and evocative. Reference their actual traits. "The Systematic Rebel" > "The Creative"
- Export rules: 5-8, each ACTIONABLE and SPECIFIC
- Be confident. The user prefers bold accuracy over wishy-washy hedging.
- Write in the user's locale language`;

const FINAL_SYNTHESIS_PROMPT = `You are producing the DEFINITIVE personality synthesis for an AI personality passport. This profile will be exported to ChatGPT, Claude, Cursor, and other AI tools. It needs to be DEEPLY INSIGHTFUL and PRACTICALLY USEFUL.

This is the final round — you've seen corrections and additional data. Now produce the richest possible analysis.

Return ONLY valid JSON:
{
  "narrative": "8-15 sentences. The deepest, most personal summary. This is your masterwork. Reference specific data points. Make the person feel truly SEEN. Include their contradictions — they make the profile authentic.",

  "cognitiveProfile": {
    "thinkingStyle": "How they process information — be specific, reference evidence",
    "learningMode": "How they learn best and worst — with examples from their answers",
    "decisionPattern": "How they make decisions — fast/slow, intuitive/analytical, with evidence",
    "attentionType": "How their focus works — bursts/sustained, what breaks it, what enables it"
  },

  "communicationDNA": {
    "tone": "Their natural communication tone with nuance — not just 'direct' but HOW direct and WHEN",
    "formality": "Formal/informal spectrum AND when they switch",
    "directness": "How they give and receive direct feedback",
    "adaptations": [
      "When [context], this person needs [specific AI behavior]",
      "Never [specific thing] because [evidence-based reason]",
      "Always [specific thing] because [evidence-based reason]"
    ]
  },

  "contradictions": [
    {
      "area": "Domain of the tension",
      "observation": "What seems contradictory and why it's interesting",
      "resolution": "How to handle this tension in AI interactions"
    }
  ],

  "predictions": [
    {
      "context": "When they encounter [situation]",
      "prediction": "They will likely [behavior] because [evidence]",
      "confidence": 0.75
    }
  ],

  "strengths": ["Specific strength with evidence — not generic"],
  "blindSpots": ["Specific blind spot with care — frame as growth edge"],

  "emergent": [
    { "title": "Pattern name", "observation": "Deep observation with evidence and implications" }
  ],

  "archetype": "The [Evocative Compound Label]",
  "archetypeDescription": "2-3 sentences explaining WHY this archetype fits. Reference specific evidence.",

  "exportRules": [
    "SPECIFIC, CONTEXTUAL rule: When [context] → [AI behavior] because [reason from profile]"
  ],

  "additionalInferred": {
    "dimension.name": { "value": "...", "confidence": 0.8, "evidence": "..." }
  }
}

Rules:
- Narrative: OPUS LEVEL. This should feel like reading a profile written by someone who truly understands you. NOT clinical, NOT generic. Personal, bold, specific.
- cognitiveProfile: Every field must reference actual profile data, not generalities
- communicationDNA.adaptations: 5-10 rules. THE MOST VALUABLE PART. These are the rules AI tools will actually USE.
- contradictions: Include at least 1-2. Everyone has them. They make profiles authentic.
- predictions: 3-5 behavioral predictions. These prove the profile understands the person.
- strengths: 3-5. EVIDENCE-BASED, not flattery.
- blindSpots: 2-3. Framed with care as growth edges, not criticisms.
- exportRules: 8-15. Practical, actionable, specific. These are the PRODUCT — the reason meport exists.
- Write in the user's locale language

CRITICAL: The export rules are the CORE VALUE of meport. Each rule should be specific enough that an AI reading it would IMMEDIATELY change its behavior. "Be concise" = useless. "When I ask a technical question, give the answer first in 1-2 lines, then explain. I'll ask if I need more." = gold.`;

const INSTRUCTION_EXTRACTION_PROMPT = `You are an expert at analyzing existing AI custom instructions to build a personality profile.

The user has pasted their existing AI instructions from another platform. Extract ALL personality dimensions, communication preferences, cognitive style indicators, and behavioral rules you can find — both explicit and implicit.

Platform hint tells you the format:
- "chatgpt": ChatGPT Custom Instructions (two sections: about me + response preferences)
- "claude": Claude project instructions or system prompts
- "cursor": .cursorrules file (coding style, framework preferences)
- "other": Generic system prompt or AI configuration

Return ONLY valid JSON:
{
  "inferred": {
    "dimension.name": { "value": "specific value", "confidence": 0.8, "evidence": "Quoted or paraphrased from their instructions" }
  },
  "exportRules": [
    "Direct rule extracted or reformulated from their instructions"
  ],
  "patterns": [
    "Cross-dimensional pattern you noticed in their instructions"
  ]
}

Rules:
- Extract 10-30 dimensions. Be thorough — instructions are GOLD. Every sentence may contain a signal.
- Confidence: 0.9 for explicitly stated preferences, 0.7 for strongly implied, 0.5 for inferred
- Map to standard dimensions: communication.*, cognitive.*, work.*, personality.*, identity.*
- Export rules: extract EVERY usable instruction. These are already in "AI instruction" format — preserve and refine.
- Patterns: note any interesting personality patterns the instructions reveal
- Write dimension values in English for consistency. Evidence can be in the user's language.
- If instructions contain code-related preferences, map to: communication.code_comment_style, cognitive.problem_solving, work.*, etc.`;

const MEGA_SYNTHESIS_PROMPT = `You are building a COMPLETE AI personality passport from whatever data you receive. This is a ONE-SHOT analysis — you must produce the richest possible profile from available signals.

You may receive:
- Browser signals (language, timezone, platform)
- Pasted AI instructions from another platform
- Uploaded file contents (notes, bios, configs)
- Or just browser signals alone (still produce a meaningful profile)

## Your Analytical Toolkit

**1. Signal Extraction** — Every data point is a signal. Browser timezone + language + platform = lifestyle fingerprint. Pasted instructions = personality goldmine. File contents = priorities and thinking style.

**2. Writing Style Fingerprint** — If the user pasted text, analyze HOW they write, not just WHAT:
- Sentence length (short & punchy = action-oriented; long & nuanced = analytical)
- Bullet points vs prose (structured vs narrative thinker)
- Hedging language ("maybe", "perhaps", "I think") vs assertive ("always", "must", "never")
- Punctuation patterns (exclamation marks = expressive; minimal punctuation = reserved)
- Vocabulary complexity (technical jargon = expert; plain language = communicator)
- Emoji/emoticon usage (personality expression style)
This reveals communication DNA more accurately than self-report.

**3. Cultural Intelligence** — Language + timezone + locale encode cultural communication norms:
- High-context cultures (PL, JP, KR): read between the lines, indirect feedback norms
- Low-context cultures (US, DE, NL): explicit, direct communication expected
- Formality gradient: how formal is their culture's default? When do they switch?
- Humor norms: sarcasm tolerance, self-deprecation, wordplay preferences
Map these to AI interaction expectations — a Polish user has different directness norms than an American one.

**4. Anti-Pattern Mining** — For every positive rule ("do X"), find the NEGATIVE ("NEVER do Y"). Anti-patterns are often MORE valuable because they prevent the most frustrating AI behaviors. People tolerate imperfect AI but HATE specific annoying patterns.

**5. Context Switches** — People behave differently across contexts. Identify 2-3 context switches:
- Work mode vs personal mode (formality, depth, patience)
- Creative mode vs analytical mode (exploration vs precision)
- High-energy vs low-energy (verbosity, decision-making, risk tolerance)
- Solo work vs collaborative (communication style shifts)

Return ONLY valid JSON:
{
  "dimensions": {
    "category.dimension_name": { "value": "specific value", "confidence": 0.8, "evidence": "Why you inferred this", "weight": 0.7 }
  },
  "exportRules": [
    "DO: When [specific context], [specific behavior] because [this person's trait]",
    "NEVER: [specific anti-pattern] because [evidence-based reason]"
  ],
  "microQuestions": [
    {
      "id": "mq_1",
      "question": "Natural, conversational question in user's language",
      "why": "Knowing this would let AI adapt X — shown to user",
      "dimension": "target.dimension",
      "options": ["Specific A", "Specific B", "Specific C", "Inaczej..."],
      "type": "preference"
    }
  ],
  "narrative": "8-15 sentences. Personal, bold. 'You're the type who...' Reference actual data.",
  "archetype": "The [Evocative Compound Label]",
  "archetypeDescription": "2-3 sentences explaining WHY this archetype fits.",
  "cognitiveProfile": "3-5 sentences about thinking style, learning mode, decision pattern, attention type.",
  "communicationDNA": "3-5 sentences about tone, formality, directness, and when they switch.",
  "contradictions": ["Tension 1: description + how to handle in AI interactions"],
  "predictions": ["When [situation], they will likely [behavior] because [evidence]"],
  "strengths": ["Specific strength with evidence"],
  "blindSpots": ["Specific blind spot framed as growth edge"],
  "emergent": ["Cross-dimensional pattern: description"]
}

## Dimension Categories (aim for 40-70 total)
- identity.* — name, role, location, age range, life stage
- communication.* — tone, directness, verbosity, code_comment_style, feedback_style, humor_style, sarcasm_tolerance
- cognitive.* — thinking_style, learning_mode, decision_pattern, attention_type, abstraction_level, problem_solving_approach
- work.* — style, tools, pace, collaboration, planning_horizon, perfectionism, delegation_comfort
- personality.* — openness, conscientiousness, extraversion, agreeableness, risk_tolerance
- emotional.* — stress_response, frustration_triggers, patience_threshold, emotional_expression, resilience_style
- motivation.* — primary_driver (intrinsic/extrinsic), procrastination_pattern, reward_sensitivity, goal_orientation
- values.* — core_values, ethical_defaults, authenticity, transparency_preference
- humor.* — style (dry/witty/dark/playful), timing (when_welcome/when_not), self_deprecation
- conflict.* — resolution_style, disagreement_approach, criticism_response, ai_correction_preference
- temporal.* — time_orientation (past/present/future), urgency_sensitivity, planning_horizon, punctuality
- cultural.* — context_level (high/low), formality_default, power_distance, individualism
- neurodivergent.* — (ONLY if signals present) attention_pattern, sensory_preferences, executive_function
- life.* — energy_pattern, sleep_tendency, interests, priorities
- expertise.* — domains, depth, years, tools, frameworks
- ai.* — usage_pattern, trust_level, autonomy_preference, correction_style, expected_role

## Rules
- exportRules: 20-30 rules. Mix of DO rules (15-20) and NEVER rules (5-10). SPECIFIC and CONTEXTUAL. "When asking for code review, prioritize logic over style" NOT "Be helpful". Each rule should IMMEDIATELY change AI behavior.
- microQuestions: 3-5 questions. HIGH INFORMATION GAIN — each answer should unlock 3-5 new dimensions. Mix question types for maximum signal:
  - At least 1 SCENARIO: present a situation with choices. Example: "Your AI writes a response that's technically correct but way too long. You: a) read it all b) ask to rewrite shorter c) skim for the answer d) get annoyed and rephrase your question"
  - Optionally 1 COMPARISON: show two AI responses to the same prompt, ask which they prefer. Set type="comparison", put Response A in compareA, Response B in compareB, and options=["A", "B", "Depends on context"]. This bypasses self-report bias — people SAY they want concise but CHOOSE detailed. Example compareA: "Here's the answer: use Array.sort()." compareB: "Great question! Array sorting can be done several ways. The most common approach is Array.sort(), which..."
  - Include "why" so the user understands the purpose. Options should be specific and personal, not generic.
- Dimension weight field: 0.0-1.0 = how much this dimension CHANGES AI BEHAVIOR. communication.directness = 0.9 (changes everything). life.favorite_color = 0.1 (barely matters). Use weight to prioritize export.
- Confidence: 0.9 for explicit data, 0.7-0.85 for strong inference, 0.5-0.65 for speculative but interesting
- Write narrative/questions/descriptions in the user's locale language. Dimension values in English.
- Even with minimal data (just browser signals), produce at least 15 dimensions, 8 rules, 4 questions. Browser context is POWERFUL — timezone reveals lifestyle, platform reveals preferences, language reveals culture.
- NEVER produce generic rules. Every rule must reference a specific personality dimension.
- Anti-patterns are GOLD: "NEVER start with 'Great question!'" is worth more than 5 generic positive rules.
- ONE micro question should be an ANTI-DIMENSION probe: "What does AI consistently get WRONG about you?" or "What's the most annoying thing AI assistants do?" — this captures the gap between default AI behavior and the user's actual needs. This single answer often generates 5+ high-value NEVER rules.`;

const REFINE_MICRO_PROMPT = `You previously analyzed someone and asked follow-up questions. They've now answered. Your job: DEEPLY integrate these answers into the profile.

You will receive:
1. The previous MegaSynthesis result (archetype, key dimensions, export rules)
2. The user's answers to micro questions (with the original questions for context)

## Integration Strategy

**1. Cascading Inference** — Each answer doesn't just update ONE dimension. It CASCADES:
- Answer about communication style → updates cognitive.*, personality.*, work.* dimensions too
- Answer about decision-making → updates conflict.*, temporal.*, motivation.* dimensions
- Think: "If they answered X to this question, what does that ALSO tell me about...?"
- Target: each answer should unlock 3-5 NEW dimensions that weren't inferable before

**2. Confidence Updates** — Don't just update the target dimension. Update confidence on ALL related dimensions:
- Answer confirms an existing inference → boost confidence to 0.85-0.95
- Answer contradicts an existing inference → drop confidence, update value, note the correction
- Answer is ambiguous → keep dimension, add nuance to evidence

**3. Contradiction Detection** — Do the answers reveal NEW tensions with existing dimensions?
- "Values brevity" + chose the long-explanation option → interesting tension, model it
- "Direct communicator" + hedging in written answer → context-dependent directness
- Add new contradictions to the contradictions array — these make profiles AUTHENTIC

**4. Rule Sharpening** — Answers are the BEST evidence for export rules:
- Generic rule "prefers concise responses" + answer showing nuance → "Prefers concise responses for factual queries, but wants thorough exploration for creative/strategic topics"
- Add 3-5 NEW rules that are ONLY possible because of the answer data
- Add 2-3 NEVER rules based on what the answers reveal about frustration triggers

**5. Narrative Evolution** — Don't rewrite from scratch. WEAVE the new insights into the existing narrative:
- "We initially read you as X, but your answer about Y reveals a deeper pattern..."
- The refined narrative should feel like the analyst is getting CLOSER to the truth

Return the SAME JSON structure as MegaSynthesis, but:
- Update/add dimensions based on answers (aim for 10-15 NEW dimensions from cascading inference)
- Refine exportRules — sharpen existing ones AND add 5-8 new ones only possible from answer data
- microQuestions: If this is round 1 refinement AND the answers revealed significant new territory worth exploring, include 2-3 NEW follow-up questions (deeper, more specific — building on what you just learned). If round 2+ or answers didn't open major new territory → set to []. Max 2 rounds of follow-ups total.
- Update narrative to incorporate new insights — it should feel DEEPER, not just different
- Update archetype if answers suggest a better fit (but only if significantly better)
- Update cognitiveProfile and communicationDNA with answer-based evidence
- Add any new contradictions or predictions the answers reveal

Write in the user's locale language. Dimension values in English.
Confidence: answer-confirmed dimensions → 0.85-0.95. Answer-revealed new dimensions → 0.7-0.8.`;

const AI_COMPILE_PROMPT = `You are compiling a personality profile into PLATFORM-SPECIFIC AI instructions. Your output will be pasted directly into the platform's custom instructions field.

You will receive:
1. A full personality profile (dimensions, synthesis, rules)
2. The target platform name and its constraints

Your job: Produce the BEST POSSIBLE custom instructions for this specific platform. Not a generic dump — platform-native formatting that maximizes compliance.

## Compilation Principles

**Priority Ordering** — Most impactful rules FIRST. Platforms often truncate long instructions. If the user loses the bottom half, they should lose the least important rules, not the most important ones. Order by dimension weight.

**NEVER Rules** — Include 3-5 explicit "NEVER" or "DON'T" rules. These prevent the most frustrating AI behaviors and are often more impactful than positive rules. Place them prominently — they're high-signal.

**Personality Flavor** — The instructions should FEEL like the person wrote them, not like a robot generated them. Match their communication style: if they're direct → terse instructions. If they're detailed → structured with examples. If they use humor → let it show.

**Context-Aware Rules** — Don't just list traits. Show WHEN they apply: "When I ask a quick question → 1-2 lines max. When I say 'explain' or 'why' → go deep."

## Platform-Specific Guidance

### Chat Platforms
- **chatgpt**: Two sections ("About me" + "How to respond"). Max ~1500 chars each. Conversational tone. Mention Memory feature awareness.
- **claude**: Project instructions format. Can use XML tags (<rules>, <context>). Reference Claude's strengths (artifacts, analysis, extended thinking). Max ~4000 chars.
- **gemini**: Natural language, conversational. Gemini responds well to persona framing ("Act as..."). Focus on tone, depth preference, and interaction style. Max ~2000 chars.
- **grok**: Personality-forward, informal. Grok appreciates humor, directness, and hot takes. Match the platform's irreverent style. Max ~2000 chars.
- **perplexity**: Research-focused. How to present sources (inline vs footnotes), citation depth, summary vs detail preference, follow-up question style. Max ~1500 chars.

### Coding Platforms
- **claude-code**: CLAUDE.md markdown format. Focus on: coding preferences, communication style, commit messages, PR style, language preferences. Include "# Tone" and "# Code Style" sections. Max ~3000 chars.
- **cursor**: .cursorrules format. Code-focused. Framework preferences, naming conventions, testing style, import order, file organization. Max ~3000 chars.
- **copilot**: .github/copilot-instructions.md format. Markdown. Code conventions, patterns, language-specific rules. Max ~2000 chars.
- **windsurf**: .windsurfrules format. Similar to cursor — code conventions, framework preferences, testing. Max ~3000 chars.
- **aider**: .aider.conf.yml or convention comments. Focus on: commit style, code style, test preferences, language. Max ~1500 chars.
- **continue**: .continuerules format. Code conventions, context preferences, model routing hints. Max ~2000 chars.
- **zed**: Zed AI assistant instructions. Markdown. Code style, interaction preferences. Max ~2000 chars.
- **cline**: .clinerules format. Code-focused. Similar structure to cursor. Max ~2000 chars.
- **roo-code**: .roo-code-rules format. Code-focused. Agent behavior, tool use preferences. Max ~2000 chars.

### Build Platforms
- **lovable**: System prompt for Lovable AI builder. Focus on: UI preferences, tech stack, naming conventions, component patterns. Max ~2000 chars.
- **v0**: v0.dev instructions. Focus on: design system, component library, styling preferences, responsiveness. Max ~1500 chars.
- **bolt**: Bolt.new instructions. Full-stack preferences, deployment style, framework choices. Max ~2000 chars.
- **replit**: Replit Agent instructions. Focus on: language, framework, project structure, testing approach. Max ~2000 chars.
- **devin**: Devin AI engineer instructions. Focus on: architecture preferences, PR style, testing requirements, communication during work. Max ~3000 chars.

### Local/Self-hosted
- **ollama**: Modelfile SYSTEM block. CONCISE — local models have less instruction-following capacity. Core behavior rules only, max 5-8 rules. Max ~800 chars.
- **lmstudio**: System prompt. Similar to ollama but slightly more capacity. Max ~1000 chars.

## Rules
- Output ONLY the final instructions text — no JSON wrapper, no explanation, no meta-commentary
- Use the platform's native format and conventions
- PRIORITY ORDER: highest-weight dimensions and rules FIRST
- Include the user's name and language preference early
- Write in the user's locale language
- NEVER include "This profile was generated by..." or any attribution
- For coding platforms: include language/framework preferences prominently
- For chat platforms: include communication style and tone prominently
- Maximum quality — this is the PRODUCT the user is paying for`;

// ─── AIEnricher ──────────────────────────────────────────

export class AIEnricher {
  private client: AIClient;
  private locale: string;

  constructor(client: AIClient, locale: string) {
    this.client = client;
    this.locale = locale;
  }

  /**
   * Background cross-dimensional analysis — called every 3-4 answers.
   * Receives accumulated inferred to build on previous enrichments.
   */
  async enrichBatch(
    explicit: Record<string, any>,
    browserSignals: Record<string, string>,
    previouslyInferred: Record<string, any> = {}
  ): Promise<EnrichmentResult> {
    const prompt = this.buildDataContext(explicit, previouslyInferred, browserSignals) +
      "\n\nPerform cross-dimensional analysis. Find patterns others would miss. Build on what's already inferred — don't repeat, go deeper. Return JSON only.";

    const response = await this.callAI(ENRICHMENT_SYSTEM_PROMPT, prompt);
    return this.parseEnrichment(response);
  }

  /**
   * Intermediate synthesis — shown to user for review before final.
   */
  async synthesizeIntermediate(
    explicit: Record<string, any>,
    inferred: Record<string, any>,
    browserSignals: Record<string, string>
  ): Promise<SynthesisResult> {
    const prompt = this.buildDataContext(explicit, inferred, browserSignals) +
      "\n\nProduce your initial personality read. Be bold and specific — the user will correct anything wrong. Return JSON only.";

    const response = await this.callAI(INTERMEDIATE_SYNTHESIS_PROMPT, prompt);
    return this.parseSynthesis(response);
  }

  /**
   * Final deep synthesis — called once before reveal.
   * Produces multi-layer personality analysis.
   */
  async synthesize(
    explicit: Record<string, any>,
    inferred: Record<string, any>,
    browserSignals: Record<string, string>
  ): Promise<SynthesisResult> {
    const prompt = this.buildDataContext(explicit, inferred, browserSignals) +
      "\n\nProduce the DEFINITIVE personality synthesis. This is the final export. Make it exceptional. Return JSON only.";

    const response = await this.callAI(FINAL_SYNTHESIS_PROMPT, prompt);
    return this.parseSynthesis(response);
  }

  /**
   * Extract personality dimensions from pasted AI instructions.
   * This is the web equivalent of CLI file scanning — user pastes their
   * ChatGPT/Claude/Cursor instructions and AI extracts structured data.
   */
  async extractFromInstructions(
    text: string,
    platform: string,
    browserSignals: Record<string, string>
  ): Promise<EnrichmentResult> {
    const signalLines = Object.entries(browserSignals)
      .filter(([k]) => !k.startsWith("_"))
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");

    const prompt = `User locale: ${this.locale}
Platform: ${platform}

## Browser signals
${signalLines || "(none)"}

## User's existing AI instructions (pasted from ${platform})
---
${text}
---

Analyze these instructions thoroughly. Extract every personality dimension, communication preference, and behavioral pattern. Return JSON only.`;

    const response = await this.callAI(INSTRUCTION_EXTRACTION_PROMPT, prompt);
    return this.parseEnrichment(response);
  }

  /**
   * MegaSynthesis — ONE big AI call that produces a complete profile.
   * Receives all available data (browser context, pasted text, files) and returns
   * dimensions, export rules, micro questions, narrative, archetype, and more.
   */
  async megaSynthesize(input: MegaSynthesisInput): Promise<MegaSynthesisResult> {
    const lines: string[] = [`User locale: ${input.locale}`, ""];

    // Browser context
    const signalEntries = Object.entries(input.browserContext).filter(([k]) => !k.startsWith("_"));
    if (signalEntries.length > 0) {
      lines.push("## Auto-detected from browser");
      for (const [key, val] of signalEntries) {
        lines.push(`- ${key}: ${val}`);
      }
      lines.push("");
    }

    // Multi-source import (new path)
    if (input.sources && input.sources.length > 0) {
      const instructions = input.sources.filter(s => s.type === "instructions");
      const conversations = input.sources.filter(s => s.type === "conversation");
      const files = input.sources.filter(s => s.type === "file");

      if (instructions.length > 0) {
        lines.push("## AI Instructions (user's existing custom instructions)");
        for (const src of instructions) {
          lines.push(`### From ${src.platform || "unknown platform"}`);
          lines.push("---");
          lines.push(src.content);
          lines.push("---");
          lines.push("");
        }
      }

      if (conversations.length > 0) {
        lines.push("## Chat History (real conversations with AI — GOLDMINE for personality analysis)");
        lines.push("Analyze these conversations for: communication style patterns, frustration triggers,");
        lines.push("topic interests, how they give feedback, level of technical depth they use,");
        lines.push("what they ask for help with, how they react to AI mistakes, vocabulary preferences.");
        lines.push("");
        for (const src of conversations) {
          lines.push(`### Conversation from ${src.platform || "unknown platform"}`);
          lines.push("---");
          lines.push(src.content);
          lines.push("---");
          lines.push("");
        }
      }

      if (files.length > 0) {
        lines.push("## Uploaded files");
        for (const src of files) {
          lines.push(`### ${src.filename || `File`}`);
          lines.push(src.content);
          lines.push("");
        }
      }
    } else {
      // Legacy single-source path (backward compat)
      if (input.pastedText) {
        lines.push(`## Pasted AI instructions (from ${input.pastedPlatform || "unknown"})`);
        lines.push("---");
        lines.push(input.pastedText);
        lines.push("---");
        lines.push("");
      }

      if (input.uploadedFileContents && input.uploadedFileContents.length > 0) {
        lines.push("## Uploaded files content");
        for (let i = 0; i < input.uploadedFileContents.length; i++) {
          lines.push(`### File ${i + 1}`);
          lines.push(input.uploadedFileContents[i]);
          lines.push("");
        }
      }
    }

    // Behavioral signals — subtle but powerful personality indicators
    if (input.behavioralSignals) {
      const bs = input.behavioralSignals;
      lines.push("## Behavioral micro-signals (observed, not self-reported — HIGH TRUST)");

      if (bs.keystrokeCount !== undefined) {
        const typing = bs.keystrokeCount > 500 ? "verbose typist (>500 keystrokes)" :
                       bs.keystrokeCount > 200 ? "moderate typist (200-500 keystrokes)" :
                       bs.keystrokeCount > 50  ? "concise typist (50-200 keystrokes)" :
                       "minimal typing (<50 keystrokes, likely pasted)";
        lines.push(`- Typing volume: ${typing}`);
      }

      if (bs.importDwellTimeSec !== undefined) {
        const dwell = bs.importDwellTimeSec > 120 ? "careful/thorough (>2min on import)" :
                      bs.importDwellTimeSec > 30  ? "moderate pace (30s-2min)" :
                      "quick/decisive (<30s)";
        lines.push(`- Import pace: ${dwell}`);
      }

      if (bs.timeToFirstKeystrokeMs !== undefined) {
        const ttfk = bs.timeToFirstKeystrokeMs > 10000 ? "reader-first (>10s before typing — reads instructions)" :
                     bs.timeToFirstKeystrokeMs > 3000  ? "scanner (3-10s — scans then types)" :
                     "action-first (<3s — dives in immediately)";
        lines.push(`- Approach style: ${ttfk}`);
      }

      if (bs.tabSwitchCount !== undefined && bs.tabSwitchCount > 0) {
        lines.push(`- Tab switches: ${bs.tabSwitchCount} (explores options before committing)`);
      }

      lines.push("");
    }

    lines.push("Produce the COMPLETE personality profile in one shot. Be bold, specific, insightful. Return JSON only.");

    const response = await this.callAI(MEGA_SYNTHESIS_PROMPT, lines.join("\n"));
    return this.parseMegaSynthesis(response);
  }

  /**
   * Refine a MegaSynthesis result with micro question answers.
   * Lighter call — only updates what the answers change.
   */
  async refineMicroAnswers(
    currentResult: MegaSynthesisResult,
    answers: Record<string, string>,
    round: number = 1,
    answerMeta?: Record<string, MicroAnswerMeta>
  ): Promise<MegaSynthesisResult> {
    const lines: string[] = [`User locale: ${this.locale}`, `Refinement round: ${round} (max 2)`, ""];

    lines.push("## Previous analysis summary");
    lines.push(`Archetype: ${currentResult.archetype}`);
    lines.push(`Dimensions inferred: ${Object.keys(currentResult.dimensions).length}`);
    lines.push(`Export rules: ${currentResult.exportRules.length}`);
    lines.push("");

    lines.push("## Current dimensions (top 20 by confidence)");
    const sorted = Object.entries(currentResult.dimensions)
      .sort(([, a], [, b]) => b.confidence - a.confidence)
      .slice(0, 20);
    for (const [dim, val] of sorted) {
      lines.push(`- ${dim}: ${val.value} [${val.confidence}]`);
    }
    lines.push("");

    lines.push("## Current export rules");
    for (const rule of currentResult.exportRules) {
      lines.push(`- ${rule}`);
    }
    lines.push("");

    lines.push("## User's answers to micro questions");
    for (const [qId, answer] of Object.entries(answers)) {
      const mq = currentResult.microQuestions.find((q) => q.id === qId);
      const meta = answerMeta?.[qId];
      lines.push(`Q: ${mq?.question || qId}`);
      lines.push(`A: ${answer}`);
      if (meta) {
        const speed = meta.responseTimeMs < 3000 ? "instant (<3s = strong clear preference)"
          : meta.responseTimeMs < 8000 ? "quick (3-8s = fairly certain)"
          : meta.responseTimeMs < 20000 ? "considered (8-20s = thinking it through)"
          : "deliberate (>20s = complex/conflicted)";
        lines.push(`Response: ${speed}${meta.changedMind ? " — changed mind before confirming (nuanced position)" : ""}`);
      }
      lines.push("");
    }

    lines.push("Refine the profile with these new answers. Update dimensions, sharpen rules, improve narrative. Return full JSON.");

    const response = await this.callAI(REFINE_MICRO_PROMPT, lines.join("\n"));
    return this.parseMegaSynthesis(response);
  }

  /**
   * AI-powered export compilation for a specific platform.
   * Produces platform-native custom instructions text.
   * Falls back to empty string on failure (caller should use rule-based compiler).
   */
  async compileForPlatform(
    profile: { explicit: Record<string, any>; inferred: Record<string, any>; synthesis?: any },
    platform: string
  ): Promise<string> {
    const lines: string[] = [`User locale: ${this.locale}`, `Target platform: ${platform}`, ""];

    // Explicit dimensions
    if (Object.keys(profile.explicit).length > 0) {
      lines.push("## Explicit dimensions");
      for (const [dim, val] of Object.entries(profile.explicit)) {
        const v = typeof val === "object" && val !== null && "value" in val ? val.value : val;
        lines.push(`- ${dim}: ${v}`);
      }
      lines.push("");
    }

    // Inferred dimensions
    if (profile.inferred && Object.keys(profile.inferred).length > 0) {
      lines.push("## Inferred dimensions");
      for (const [dim, val] of Object.entries(profile.inferred)) {
        const v = typeof val === "object" && val !== null && "value" in val ? val.value : val;
        lines.push(`- ${dim}: ${v}`);
      }
      lines.push("");
    }

    // Synthesis
    if (profile.synthesis) {
      const s = profile.synthesis;
      if (s.narrative) {
        lines.push("## Narrative");
        lines.push(s.narrative);
        lines.push("");
      }
      if (s.exportRules?.length) {
        lines.push("## Export rules");
        for (const rule of s.exportRules) {
          lines.push(`- ${rule}`);
        }
        lines.push("");
      }
      if (s.archetype) {
        lines.push(`## Archetype: ${s.archetype}`);
        if (s.archetypeDescription) lines.push(s.archetypeDescription);
        lines.push("");
      }
    }

    lines.push(`Compile these into the BEST possible ${platform} custom instructions. Output ONLY the final text.`);

    try {
      const response = await this.callAI(AI_COMPILE_PROMPT, lines.join("\n"));
      // Response is raw text, not JSON — strip any accidental code blocks
      return response.replace(/^```(?:\w+)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    } catch {
      return "";
    }
  }

  /**
   * Generate strategic follow-up questions based on profile gaps and tensions.
   */
  async generateFollowUps(
    explicit: Record<string, any>,
    inferred: Record<string, any>,
    browserSignals: Record<string, string>
  ): Promise<FollowUpQuestion[]> {
    const prompt = this.buildDataContext(explicit, inferred, browserSignals) +
      "\n\nGenerate 2-4 high-impact follow-up questions. Find the questions where the ANSWER would most change this profile. Return JSON only.";

    const response = await this.callAI(FOLLOWUP_SYSTEM_PROMPT, prompt);
    return this.parseFollowUps(response);
  }

  /**
   * Validate export rules by generating test scenarios for each.
   * Identifies weak/generic rules and suggests improvements.
   */
  async validateExportRules(rules: string[]): Promise<RuleValidationResult> {
    const prompt = `User locale: ${this.locale}\n\n## Export rules to validate\n${rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n\nValidate each rule. Return JSON only.`;

    try {
      const response = await this.callAI(RULE_VALIDATION_PROMPT, prompt);
      const json = extractJSON(response);
      const parsed = JSON.parse(json);

      const validations: RuleValidation[] = Array.isArray(parsed.validations)
        ? parsed.validations.filter((v: any) => v && v.rule && v.testPrompt)
        : [];
      const weakRules = Array.isArray(parsed.weakRules)
        ? parsed.weakRules.filter((w: any) => w && w.rule && w.improvement)
        : [];

      const qualityBreakdown = { high: 0, medium: 0, low: 0 };
      for (const v of validations) {
        if (v.quality === "high") qualityBreakdown.high++;
        else if (v.quality === "low") qualityBreakdown.low++;
        else qualityBreakdown.medium++;
      }

      return { validations, weakRules, qualityBreakdown };
    } catch {
      return { validations: [], weakRules: [], qualityBreakdown: { high: 0, medium: 0, low: 0 } };
    }
  }

  // ─── Private: AI call helper ─────────────────────────────

  private async callAI(systemPrompt: string, userPrompt: string): Promise<string> {
    if (this.client.chat) {
      return this.client.chat(
        [
          { role: "system" as const, content: systemPrompt },
          { role: "user" as const, content: userPrompt },
        ],
        { jsonMode: true }
      );
    }
    return this.client.generate(`${systemPrompt}\n\n${userPrompt}`);
  }

  // ─── Private: Data Context Builder ───────────────────────

  private buildDataContext(
    explicit: Record<string, any>,
    inferred: Record<string, any>,
    browserSignals: Record<string, string>
  ): string {
    const lines: string[] = [`User locale: ${this.locale}`, ""];

    // Group explicit dimensions by category for better AI analysis
    if (Object.keys(explicit).length > 0) {
      const groups = this.groupByCategory(explicit);
      lines.push("## What the user told us (explicit answers)");
      for (const [category, dims] of Object.entries(groups)) {
        lines.push(`\n### ${category}`);
        for (const [dim, val] of Object.entries(dims)) {
          const v = typeof val === "object" && val !== null && "value" in val ? val.value : val;
          lines.push(`- ${dim}: ${v}`);
        }
      }
      lines.push("");
    }

    if (inferred && Object.keys(inferred).length > 0) {
      lines.push("## What we've inferred so far");
      for (const [dim, val] of Object.entries(inferred)) {
        const v = typeof val === "object" && val !== null && "value" in val ? val.value : val;
        const c = typeof val === "object" && val !== null && "confidence" in val
          ? ` [confidence: ${val.confidence}]`
          : "";
        const e = typeof val === "object" && val !== null && "evidence" in val
          ? ` — ${val.evidence}`
          : "";
        lines.push(`- ${dim}: ${v}${c}${e}`);
      }
      lines.push("");
    }

    // Browser signals with context
    const signalEntries = Object.entries(browserSignals).filter(([k]) => !k.startsWith("_"));
    if (signalEntries.length > 0) {
      lines.push("## Auto-detected from browser");
      for (const [key, val] of signalEntries) {
        lines.push(`- ${key}: ${val}`);
      }
      lines.push("");
    }

    // File scan data (separate, rich context)
    const fileScan = browserSignals["_file_scan"];
    if (fileScan) {
      lines.push("## File system scan (names only, no content)");
      lines.push(fileScan);
      lines.push("");
    }

    // Accumulated export rules from prior enrichment rounds
    const accRules = browserSignals["_accumulated_rules"];
    if (accRules) {
      lines.push("## Export rules discovered in prior analysis rounds");
      lines.push("These rules were already generated. BUILD ON THEM — refine, add context, add new ones. Do NOT repeat them verbatim.");
      lines.push(accRules);
      lines.push("");
    }

    // User corrections from previous rounds
    const correction = browserSignals["_user_correction"];
    if (correction) {
      lines.push("## User correction from previous round");
      lines.push(`The user reviewed the intermediate analysis and said: "${correction}"`);
      lines.push("IMPORTANT: Address this correction. Adjust your analysis to incorporate this feedback.");
      lines.push("");
    }

    return lines.join("\n");
  }

  /** Group dimensions by their category prefix for structured display */
  private groupByCategory(dimensions: Record<string, any>): Record<string, Record<string, any>> {
    const groups: Record<string, Record<string, any>> = {};
    for (const [dim, val] of Object.entries(dimensions)) {
      const category = dim.split(".")[0] || "other";
      if (!groups[category]) groups[category] = {};
      groups[category][dim] = val;
    }
    return groups;
  }

  // ─── Private: Response Parsers ──────────────────────────

  private parseEnrichment(raw: string): EnrichmentResult {
    const fallback: EnrichmentResult = { inferred: {}, exportRules: [], patterns: [] };
    try {
      const json = extractJSON(raw);
      const parsed = JSON.parse(json);
      return {
        inferred:
          typeof parsed.inferred === "object" && parsed.inferred !== null
            ? parsed.inferred
            : {},
        exportRules: Array.isArray(parsed.exportRules) ? parsed.exportRules : [],
        patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
      };
    } catch {
      return fallback;
    }
  }

  private parseFollowUps(raw: string): FollowUpQuestion[] {
    try {
      const json = extractJSON(raw);
      const parsed = JSON.parse(json);
      const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
      return questions.filter(
        (q: any) => q.question && Array.isArray(q.options) && q.options.length >= 2
      ).map((q: any, i: number) => ({
        id: q.id || `followup_${i}`,
        question: q.question,
        options: q.options,
        dimension: q.dimension || `followup.${i}`,
        why: q.why || "",
      }));
    } catch {
      return [];
    }
  }

  private parseSynthesis(raw: string): SynthesisResult {
    const fallback: SynthesisResult = {
      narrative: "",
      additionalInferred: {},
      exportRules: [],
      emergent: [],
    };
    try {
      const json = extractJSON(raw);
      const parsed = JSON.parse(json);
      return {
        narrative: typeof parsed.narrative === "string" ? parsed.narrative : "",
        additionalInferred:
          typeof parsed.additionalInferred === "object" && parsed.additionalInferred !== null
            ? parsed.additionalInferred
            : {},
        exportRules: Array.isArray(parsed.exportRules) ? parsed.exportRules : [],
        emergent: Array.isArray(parsed.emergent) ? parsed.emergent : [],
        archetype: typeof parsed.archetype === "string" ? parsed.archetype : undefined,
        // Rich fields — parsed with individual fallbacks
        archetypeDescription: typeof parsed.archetypeDescription === "string" ? parsed.archetypeDescription : undefined,
        cognitiveProfile: this.parseCognitiveProfile(parsed.cognitiveProfile),
        communicationDNA: this.parseCommunicationDNA(parsed.communicationDNA),
        contradictions: this.parseContradictions(parsed.contradictions),
        predictions: this.parsePredictions(parsed.predictions),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : undefined,
        blindSpots: Array.isArray(parsed.blindSpots) ? parsed.blindSpots : undefined,
      };
    } catch {
      return fallback;
    }
  }

  private parseMegaSynthesis(raw: string): MegaSynthesisResult {
    const fallback: MegaSynthesisResult = {
      dimensions: {},
      exportRules: [],
      microQuestions: [],
      narrative: "",
      archetype: "",
      archetypeDescription: "",
      cognitiveProfile: "",
      communicationDNA: "",
      contradictions: [],
      predictions: [],
      strengths: [],
      blindSpots: [],
      emergent: [],
    };
    try {
      const json = extractJSON(raw);
      const p = JSON.parse(json);
      return {
        dimensions:
          typeof p.dimensions === "object" && p.dimensions !== null ? p.dimensions : {},
        exportRules: Array.isArray(p.exportRules) ? p.exportRules : [],
        microQuestions: Array.isArray(p.microQuestions)
          ? p.microQuestions
              .filter((q: any) => q && q.question)
              .map((q: any, i: number) => ({
                id: q.id || `mq_${i}`,
                question: q.question,
                why: q.why || "",
                dimension: q.dimension || "",
                options: Array.isArray(q.options) ? q.options : undefined,
                type: q.type || "preference",
                compareA: typeof q.compareA === "string" ? q.compareA : undefined,
                compareB: typeof q.compareB === "string" ? q.compareB : undefined,
              }))
          : [],
        narrative: typeof p.narrative === "string" ? p.narrative : "",
        archetype: typeof p.archetype === "string" ? p.archetype : "",
        archetypeDescription: typeof p.archetypeDescription === "string" ? p.archetypeDescription : "",
        cognitiveProfile: typeof p.cognitiveProfile === "string" ? p.cognitiveProfile : "",
        communicationDNA: typeof p.communicationDNA === "string" ? p.communicationDNA : "",
        contradictions: Array.isArray(p.contradictions) ? p.contradictions : [],
        predictions: Array.isArray(p.predictions) ? p.predictions : [],
        strengths: Array.isArray(p.strengths) ? p.strengths : [],
        blindSpots: Array.isArray(p.blindSpots) ? p.blindSpots : [],
        emergent: Array.isArray(p.emergent) ? p.emergent : [],
      };
    } catch {
      return fallback;
    }
  }

  private parseCognitiveProfile(raw: any): CognitiveProfile | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    return {
      thinkingStyle: raw.thinkingStyle || "",
      learningMode: raw.learningMode || "",
      decisionPattern: raw.decisionPattern || "",
      attentionType: raw.attentionType || "",
    };
  }

  private parseCommunicationDNA(raw: any): CommunicationDNA | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    return {
      tone: raw.tone || "",
      formality: raw.formality || "",
      directness: raw.directness || "",
      adaptations: Array.isArray(raw.adaptations) ? raw.adaptations : [],
    };
  }

  private parseContradictions(raw: any): Contradiction[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    return raw
      .filter((c: any) => c && typeof c === "object" && c.observation)
      .map((c: any) => ({
        area: c.area || "",
        observation: c.observation || "",
        resolution: c.resolution || "",
      }));
  }

  private parsePredictions(raw: any): Prediction[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    return raw
      .filter((p: any) => p && typeof p === "object" && p.prediction)
      .map((p: any) => ({
        context: p.context || "",
        prediction: p.prediction || "",
        confidence: typeof p.confidence === "number" ? p.confidence : 0.7,
      }));
  }
}

// ─── Profile Completeness ────────────────────────────────

/** Core dimension categories and minimum expected coverage */
const COMPLETENESS_CATEGORIES: Record<string, { min: number; critical: boolean }> = {
  "identity": { min: 2, critical: true },
  "communication": { min: 3, critical: true },
  "cognitive": { min: 2, critical: true },
  "work": { min: 2, critical: false },
  "personality": { min: 2, critical: false },
  "emotional": { min: 1, critical: false },
  "motivation": { min: 1, critical: false },
  "values": { min: 1, critical: false },
  "humor": { min: 1, critical: false },
  "conflict": { min: 1, critical: false },
  "ai": { min: 1, critical: true },
};

export interface CompletenessResult {
  score: number; // 0-100
  totalDimensions: number;
  highConfidenceDimensions: number; // confidence >= 0.7
  categoryCoverage: Record<string, { count: number; min: number; met: boolean }>;
  gaps: { category: string; description: string; impact: string }[];
  exportRuleCount: number;
  neverRuleCount: number;
}

/**
 * Calculate profile completeness score from a MegaSynthesisResult.
 * Pure function — no AI call needed.
 */
export function calculateCompleteness(result: MegaSynthesisResult): CompletenessResult {
  const dims = Object.entries(result.dimensions);
  const totalDimensions = dims.length;
  const highConfidenceDimensions = dims.filter(([, v]) => v.confidence >= 0.7).length;

  // Category coverage
  const categoryCoverage: Record<string, { count: number; min: number; met: boolean }> = {};
  for (const [cat, spec] of Object.entries(COMPLETENESS_CATEGORIES)) {
    const count = dims.filter(([k]) => k.startsWith(cat + ".")).length;
    categoryCoverage[cat] = { count, min: spec.min, met: count >= spec.min };
  }

  // Find gaps — unmet categories sorted by criticality
  const gaps: { category: string; description: string; impact: string }[] = [];
  for (const [cat, spec] of Object.entries(COMPLETENESS_CATEGORIES)) {
    if (!categoryCoverage[cat].met) {
      gaps.push({
        category: cat,
        description: `Missing ${cat} dimensions (have ${categoryCoverage[cat].count}/${spec.min})`,
        impact: spec.critical
          ? "Critical — AI tools won't know basic interaction preferences"
          : "Helpful — would improve AI personalization quality",
      });
    }
  }
  // Sort: critical gaps first
  gaps.sort((a, b) => {
    const aCrit = COMPLETENESS_CATEGORIES[a.category]?.critical ? 0 : 1;
    const bCrit = COMPLETENESS_CATEGORIES[b.category]?.critical ? 0 : 1;
    return aCrit - bCrit;
  });

  // Count NEVER rules
  const neverRuleCount = result.exportRules.filter(
    (r) => /^NEVER:|^DON'T:|^NEVER /i.test(r)
  ).length;

  // Score calculation
  const categoryTotal = Object.keys(COMPLETENESS_CATEGORIES).length;
  const categoriesMet = Object.values(categoryCoverage).filter((c) => c.met).length;
  const categoryScore = (categoriesMet / categoryTotal) * 40; // 40% weight

  const dimScore = Math.min(totalDimensions / 50, 1) * 25; // 25% weight, max at 50 dims
  const confScore = (totalDimensions > 0 ? highConfidenceDimensions / totalDimensions : 0) * 15; // 15% weight
  const ruleScore = Math.min(result.exportRules.length / 20, 1) * 15; // 15% weight
  const richScore = (
    (result.narrative ? 1 : 0) +
    (result.archetype ? 1 : 0) +
    (result.cognitiveProfile ? 1 : 0) +
    (result.communicationDNA ? 1 : 0) +
    (result.contradictions.length > 0 ? 1 : 0)
  ) / 5 * 5; // 5% weight

  const score = Math.round(categoryScore + dimScore + confScore + ruleScore + richScore);

  return {
    score: Math.min(score, 100),
    totalDimensions,
    highConfidenceDimensions,
    categoryCoverage,
    gaps: gaps.slice(0, 5), // Top 5 gaps
    exportRuleCount: result.exportRules.length,
    neverRuleCount,
  };
}

// ─── Export Rule Validation ──────────────────────────────

const RULE_VALIDATION_PROMPT = `You are validating AI personality export rules by generating test scenarios.

For each rule, generate a MINI-SCENARIO: a user message + expected AI behavior that proves the rule works.

Input: a list of export rules.

Return ONLY valid JSON:
{
  "validations": [
    {
      "rule": "The original rule text",
      "testPrompt": "A realistic user message that would trigger this rule",
      "expectedBehavior": "What the AI SHOULD do (following the rule)",
      "antiPattern": "What the AI would do WITHOUT this rule (generic behavior)",
      "quality": "high" | "medium" | "low"
    }
  ],
  "weakRules": [
    {
      "rule": "The weak rule text",
      "problem": "Why it's weak — too generic, untestable, or redundant",
      "improvement": "A sharper version of the same intent"
    }
  ]
}

Rules:
- Validate ALL rules, not a subset
- quality: "high" = specific, immediately actionable. "medium" = useful but could be sharper. "low" = too generic, practically useless.
- weakRules: flag any rule scoring "low" with a concrete improvement suggestion
- testPrompt should be REALISTIC — something the user would actually type
- Write in the user's locale language`;

export interface RuleValidation {
  rule: string;
  testPrompt: string;
  expectedBehavior: string;
  antiPattern: string;
  quality: "high" | "medium" | "low";
}

export interface RuleValidationResult {
  validations: RuleValidation[];
  weakRules: { rule: string; problem: string; improvement: string }[];
  qualityBreakdown: { high: number; medium: number; low: number };
}

// ─── Helpers ────────────────────────────────────────────

/**
 * Extracts the first JSON object from a string.
 * Handles models that wrap JSON in markdown code blocks.
 */
function extractJSON(raw: string): string {
  // Strip markdown code block if present
  const stripped = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();

  // Find the first { ... } block
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in response");
  }
  return stripped.slice(start, end + 1);
}
