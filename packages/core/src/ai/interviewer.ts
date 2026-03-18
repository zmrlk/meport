/**
 * AI Interviewer v2 — bOS-style conversational profiling
 *
 * Based on bOS 0.9.0 /setup design:
 * - Welcome first, scan later
 * - Conversational hooks after every answer (react, then ask)
 * - Extract, don't interrogate ("you mentioned X — tell me more")
 * - Multi-pass: broad → deep → verify → synthesize
 * - Progress visible throughout
 * - Adapt to user's energy and response length
 *
 * The interviewer is NOT a quiz. It's a smart friend who learns
 * about you through natural conversation.
 */

import type { PersonaProfile, DimensionValue, InferredValue } from "../schema/types.js";
import type { AIClientFull } from "../ai/client.js";

// Backward compat — accept both old AIClient and new AIClientFull
type AIClient = {
  generate(prompt: string): Promise<string>;
  chat?(messages: any[], options?: any): Promise<string>;
  chatStream?(messages: any[], onChunk: (text: string) => void): Promise<string>;
};

// ─── Types ──────────────────────────────────────────────

export interface InterviewConfig {
  client: AIClient;
  locale: "en" | "pl";
  knownDimensions: Record<string, string | { value: string; confidence: number }>;
  maxRounds?: number;
  /** Called with partial text chunks during streaming (for live UI updates) */
  onStreamChunk?: (chunk: string) => void;
}

export interface InterviewRound {
  aiMessage: string;
  options: string[]; // Clickable options for the user
  dimensions: Record<string, ExtractedDimension>;
  complete: boolean;
  phase: number; // 1-5
  phaseLabel: string;
  depth: number; // 0-100
  suggestedTopics?: string[];
}

export interface ExtractedDimension {
  value: string;
  confidence: number;
  source: "interview" | "file_scan" | "system_scan";
  evidence: string;
  export_rule?: string;
}

// ─── System Prompt (bOS-style) ──────────────────────────

const SYSTEM_PROMPT = `You are meport — an AI that learns about people through natural conversation.

## YOUR PERSONALITY
- You're a smart, curious friend — NOT a quiz, NOT a form, NOT an interviewer
- You REACT to what people say before asking the next thing
- You're warm but efficient. No filler. No corporate speak.
- You match the user's language (Polish → Polish, English → English)
- You notice interesting things and comment on them

## HOW YOU WORK

### Phase 1: "Cześć!" (2-3 exchanges)
- Start with ONE simple question: "Czym się zajmujesz?" / "What do you do?"
- REACT to their answer with a genuine comment, then ask a follow-up
- Extract: name, occupation, industry from their response
- DON'T ask broad questions like "tell me about yourself" — too vague

### Phase 2: "Your story" (3-4 exchanges)
- Based on what they said, dig into their BACKGROUND naturally:
  "How did you end up doing [what they do]?" or "You mentioned [X] — what was before that?"
- Let them talk. A career path in 3 sentences = 10+ dimensions
- Extract: background, education hints, career transitions, skills, passions, frustrations
- Store the FULL narrative as identity.background, not just keywords
- CONVERSATIONAL HOOKS: React to specifics ("You went from X to Y — bold move! What drove that?")

### Phase 3: "How you work" (3-4 exchanges)
- Now transition to HOW they work, not WHAT they do
- Use SCENARIOS, not direct questions:
  ✓ "Imagine AI gives you a 6-paragraph answer to a simple question. What's your reaction?"
  ✗ "Do you prefer short or long AI responses?"
- Cover: communication preferences, AI relationship, energy patterns, work style
- Generate EXPORT RULES from their answers: "Max 5 lines for simple questions" NOT "User prefers brevity"

### Phase 4: "Life context" (2-3 exchanges)
- Life situation (single/partner/kids), primary need, goals, fears
- Use what they already said: "You mentioned wanting [X] — where does that come from?"
- This is SENSITIVE — be warm, give options if they're brief
- NEVER interrogate: "What's your biggest fear?" → BAD
- Instead: "What keeps you up at night — workwise?" → GOOD

### Phase 5: "Wrap up" (1-2 exchanges)
- Summarize EVERYTHING you know in a clean, organized way
- Ask: "Anything important I missed? Anything you'd change?"
- If they add something → extract it
- Signal complete

## EXTRACTION RULES
1. Extract dimensions from EVERY answer — even casual remarks reveal things
2. React FIRST, then extract, then ask next question
3. Short answers → offer options: "Are you more (a) or (b)?"
4. Long answers → extract MORE, ask FEWER questions
5. NEVER ask something the user already told you
6. Generate export_rules as ACTION RULES: "Do X when Y", not descriptions
7. Confidence: 0.5-0.95 based on how explicit the user was
8. Store full narratives for background, not just keywords

## SILENT OBSERVATION (extract WITHOUT asking)
Observe the user's OWN messages and extract:
- **Message length**: consistently short (<20 words) = terse writer. Long (>100 words) = verbose/detailed
- **Formality**: slang/casual vs proper grammar vs formal
- **Language mixing**: If they mix Polish/English = bilingual professional
- **Punctuation**: lots of "..." = thoughtful/hesitant. "!" = enthusiastic. None = casual
- **Response style**: answering directly vs elaborating vs going off on tangents
- **Emoji usage**: uses emoji = casual. No emoji = professional/direct

Generate export rules from observations WITHOUT asking:
- Short messages → export_rule: "Match my brevity. Max 3-5 sentences unless I ask for detail."
- Casual tone → export_rule: "Use casual, friendly language. Skip formality."
- No emoji → export_rule: "Don't use emoji unless I do."
- Direct answers → export_rule: "Be direct. Lead with the answer, then context."

Store these as:
"observed.message_style": "terse/moderate/verbose"
"observed.formality": "casual/neutral/formal"
"observed.emoji_usage": "uses/never"

## CONVERSATIONAL HOOKS (use after EVERY answer)
After user responds, ALWAYS:
1. React genuinely to something specific they said
2. Optionally share a brief insight ("Classic burst worker — AI should give you small tasks, not plans")
3. Ask your next question, connected to what they just said

EXAMPLES:
- User: "I'm a freelance developer"
  YOU: "Cool, going solo! How long have you been freelancing? What made you leave employment?"
  (NOT: "Interesting. Next question: what's your communication style?")

- User: "I procrastinate then do everything in one night"
  YOU: "Ha, the classic burst mode! That's actually a superpower when managed right. Does that apply to everything or just work?"

- User: "I studied computer science but dropped out"
  YOU: "Respect — that takes guts to admit. What pulled you away? And where did you end up instead?"

## CLICK-FIRST UX (CRITICAL)
The user interacts by CLICKING options, not typing. You MUST provide clickable options with EVERY question.

Rules:
- ALWAYS include 3-5 "options" — short, clickable answers the user can tap
- Options should cover the most likely answers for your question
- Make options SPECIFIC and personal, not generic
- Last option can be exploratory: "Something else..." or "It's complicated..."
- If the user clicked an option, REACT to it and ask a follow-up with NEW options
- Only ask for free-text when you genuinely need a name, title, or specific detail that can't be optionized
- Options should feel like a friend suggesting answers, not a form

Good options: ["Developer", "Designer", "Manager", "Freelancer", "Student"]
Bad options: ["Option A", "Option B", "Other"]

Good options: ["Short and direct", "Detailed with examples", "Casual, like a friend", "Depends on the topic"]
Bad options: ["Yes", "No", "Maybe"]

## OUTPUT FORMAT (STRICT JSON)
{
  "message": "Your reaction + question to the user",
  "options": ["Option 1", "Option 2", "Option 3", "Something else..."],
  "extracted": {
    "dimension.key": {
      "value": "extracted value",
      "confidence": 0.8,
      "evidence": "what the user said that led to this",
      "export_rule": "actionable rule (optional, only for communication/work dims)"
    }
  },
  "phase": 2,
  "phase_label": "Your story",
  "complete": false,
  "depth": 35
}

IMPORTANT: "options" array is REQUIRED in every response (except when complete: true).

DEPTH GUIDE: 0-20 = barely know them, 20-40 = basics, 40-60 = good profile, 60-80 = thorough, 80-100 = comprehensive. Aim for 70+ before completing.

## CRITICAL RULES
1. NEVER repeat a question you already asked in a different form
2. NEVER ask vague questions like "How do you feel about..." or "What motivates you?"
3. ALWAYS ask CONCRETE questions: "When you get stuck on a bug at 11pm, do you push through or sleep on it?"
4. If user gives a short answer, DON'T ask them to elaborate — OFFER OPTIONS instead
5. If user says "nie rozumiem" / "don't understand" — rephrase as a SCENARIO with 3-4 concrete options
6. Each question must target a DIFFERENT dimension — never circle back to the same topic
7. After 8 exchanges, WRAP UP. Don't keep asking. 8 good questions > 15 mediocre ones.

## WHAT MAKES A GREAT PROFILE (your quality bar)
A great profile lets ANY AI understand this person in 30 seconds:
- WHO they are (background, occupation, life stage)
- HOW they communicate (direct? detailed? casual?)
- WHAT they need from AI (tool? partner? expert?)
- Their QUIRKS (anti-patterns, pet peeves, ADHD adaptations)
- Their STORY (what drives them, what they've accomplished, what they fear)
- Actionable RULES that change AI behavior ("Max 5 lines" not "prefers brevity")
- Their OBSERVED communication (not self-reported — what YOU see from how they write)`;

const FILE_ANALYSIS_PROMPT = `Analyze these files to learn about this person. Extract everything useful for building their AI profile.

Look for:
- WHO they are (occupation, industry, skills, location, education)
- HOW they communicate (formal/informal, verbose/concise)
- WHAT they care about (projects, goals, interests)
- Their TOOLS and WORKFLOW

Output JSON:
{
  "message": "A friendly 2-sentence summary of what you found — address the person directly, mention something specific and interesting",
  "extracted": {
    "dimension.key": {
      "value": "extracted value",
      "confidence": 0.7,
      "evidence": "from [filename]: specific detail",
      "export_rule": "optional actionable rule"
    }
  }
}

Files:
{FILES_CONTENT}`;

// ─── Interview Engine ───────────────────────────────────

export class AIInterviewer {
  private client: AIClient;
  private locale: "en" | "pl";
  private dimensions: Record<string, ExtractedDimension> = {};
  private history: { role: "user" | "assistant"; content: string }[] = [];
  private roundCount = 0;
  private maxRounds: number;
  private exportRules: Map<string, string[]> = new Map();
  private unconfirmedRules: Map<string, string[]> = new Map();
  private currentPhase = 1;
  private onStreamChunk?: (chunk: string) => void;

  constructor(config: InterviewConfig) {
    this.client = config.client;
    this.locale = config.locale;
    this.maxRounds = config.maxRounds ?? 15;
    this.onStreamChunk = config.onStreamChunk;

    for (const [key, data] of Object.entries(config.knownDimensions)) {
      const conf = typeof data === "string" ? 0.6 : data.confidence;
      const val = typeof data === "string" ? data : data.value;
      this.dimensions[key] = {
        value: val,
        confidence: Math.min(conf, 0.7), // cap: auto-detected is never high-confidence
        source: "system_scan",
        evidence: "auto-detected",
      };
    }
  }

  async analyzeFiles(files: { name: string; content: string }[]): Promise<{
    message: string;
    extracted: Record<string, ExtractedDimension>;
  }> {
    const filesContent = files
      .map((f) => `### ${f.name}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``)
      .join("\n\n");

    const prompt = FILE_ANALYSIS_PROMPT.replace("{FILES_CONTENT}", filesContent);
    const response = await this.client.generate(prompt);
    const parsed = this.parseResponse(response);

    for (const [key, dim] of Object.entries(parsed.extracted)) {
      const existing = this.dimensions[key];
      if (!existing || dim.confidence > existing.confidence) {
        this.dimensions[key] = { ...dim, source: "file_scan" };
      }
      if (dim.export_rule) {
        const existing = this.exportRules.get(key) ?? [];
        if (!existing.includes(dim.export_rule)) {
          existing.push(dim.export_rule);
        }
        this.exportRules.set(key, existing);
      }
    }

    return { message: parsed.message, extracted: parsed.extracted };
  }

  async start(): Promise<InterviewRound> {
    const knownCtx = Object.entries(this.dimensions)
      .filter(([k]) => !k.startsWith("_"))
      .map(([k, v]) => `${k}: ${v.value}`)
      .join("\n");

    const highConfCount = Object.entries(this.dimensions)
      .filter(([k, d]) => !k.startsWith("_") && d.confidence >= 0.7).length;
    const knowsALot = highConfCount > 5;

    let startPrompt: string;
    if (this.locale === "pl") {
      startPrompt = knowsALot
        ? `ODPOWIEDZ PO POLSKU. Każde słowo po polsku.\n\nJuż DUŻO wiesz o tej osobie (z przeskanowania komputera):\n${knownCtx}\n\nTwoja PIERWSZA wiadomość:\n1. Powiedz CO już wiesz (2-3 zdania, konkretnie)\n2. Zapytaj czy się zgadza\n3. Zapytaj o JEDNO czego NIE wiesz — np. jak lubi pracować z AI, co ją motywuje, jaka jest jej historia\n\nNIE pytaj o imię, zawód, narzędzia, lokalizację — to JUŻ WIESZ. Pytaj TYLKO o rzeczy których NIE MA powyżej.`
        : `ODPOWIEDZ PO POLSKU. Każde słowo po polsku.\n\nWiesz niewiele:\n${knownCtx || "nic"}\n\nZacznij: "Cześć [imię]! Czym się zajmujesz na co dzień?" — proste, konkretne.`;
    } else {
      startPrompt = knowsALot
        ? `RESPOND IN ENGLISH ONLY.\n\nYou already know A LOT (from scanning their computer):\n${knownCtx}\n\nYour FIRST message:\n1. State what you know (2-3 sentences, specific)\n2. Ask if correct\n3. Ask about ONE thing you DON'T know — e.g. how they like AI to communicate, their story, what motivates them\n\nDO NOT ask about name, occupation, tools, location — you already KNOW. Ask ONLY about gaps.`
        : `RESPOND IN ENGLISH ONLY.\n\nYou know very little:\n${knownCtx || "nothing"}\n\nStart: "Hey [name]! What do you do for work?" — simple, concrete.`;
    }

    this.history.push({ role: "user", content: startPrompt });
    const response = await this.callAI();
    return this.processResponse(response);
  }

  async respond(userMessage: string): Promise<InterviewRound> {
    this.roundCount++;

    // Build phase hints
    const depth = this.getDepth();
    const hints: string[] = [];

    if (this.roundCount >= 3 && this.currentPhase === 1) {
      hints.push("[Move to Phase 2 — background/story]");
    }
    if (this.roundCount >= 6 && this.currentPhase <= 2) {
      hints.push("[Move to Phase 3 — how they work, use scenarios]");
    }
    if (this.roundCount >= 9 && this.currentPhase <= 3) {
      hints.push("[Move to Phase 4 — motivation, fears, goals]");
    }
    if (this.roundCount >= 11 || depth >= 65) {
      hints.push("[Phase 5 — summarize everything, ask what's missing]");
    }
    if (this.roundCount >= this.maxRounds - 1) {
      hints.push("[LAST QUESTION — summarize and set complete: true]");
    }

    const missing = this.getMissing();
    if (missing.length > 0 && this.roundCount > 4) {
      hints.push(`[Unexplored: ${missing.join(", ")}]`);
    }

    // Append hints TO the user message (not as separate entry — avoids consecutive user messages)
    const fullMessage = hints.length > 0
      ? `${userMessage}\n\n${hints.join(" ")}`
      : userMessage;

    this.history.push({ role: "user", content: fullMessage });

    const response = await this.callAI();
    return this.processResponse(response);
  }

  getDimensions(): Record<string, ExtractedDimension> {
    return { ...this.dimensions };
  }

  getExportRules(): Map<string, string[]> {
    return new Map(this.exportRules);
  }

  getUnconfirmedRules(): Map<string, string[]> {
    return new Map(this.unconfirmedRules);
  }

  /**
   * Get conversation transcript for logging/debugging.
   */
  getTranscript(): { role: string; content: string }[] {
    return this.history.map((m) => ({
      role: m.role,
      content: m.content.replace(/\[.*?\]/g, "").trim(), // strip system hints
    }));
  }

  buildProfile(): PersonaProfile {
    const explicit: Record<string, DimensionValue> = {};
    const inferred: Record<string, InferredValue> = {};

    for (const [key, dim] of Object.entries(this.dimensions)) {
      if (dim.source === "interview" && dim.confidence >= 0.85) {
        // User-confirmed via conversation — high confidence
        explicit[key] = {
          dimension: key,
          value: dim.value,
          confidence: 1.0 as const,
          source: "explicit" as const,
          question_id: `interview_${key}`,
        };
      } else {
        // File scan, system scan, or low-confidence interview answer
        inferred[key] = {
          dimension: key,
          value: dim.value,
          confidence: dim.confidence,
          source: "behavioral",
          signal_id: `${dim.source}_${key}`,
          override: dim.confidence >= 0.7 ? "primary" : "secondary",
        };
      }
    }

    return {
      schema_version: "1.0",
      profile_type: "personal",
      profile_id: crypto.randomUUID?.() ?? `meport-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completeness: Math.min(100, this.getDepth()),
      explicit,
      inferred,
      compound: {},
      contradictions: [],
      emergent: [],
      meta: {
        tiers_completed: [],
        tiers_skipped: [],
        total_questions_answered: this.roundCount,
        total_questions_skipped: 0,
        avg_response_time_ms: 0,
        profiling_duration_ms: 0,
        profiling_method: "interactive",
        layer3_available: true,
      },
    };
  }

  // ─── Private ──────────────────────────────────────────

  private async callAI(): Promise<string> {
    // Build message array
    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...this.history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    // Merge consecutive same-role messages (Claude requirement)
    const merged: typeof messages = [];
    for (const msg of messages) {
      if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
        merged[merged.length - 1].content += "\n\n" + msg.content;
      } else {
        merged.push({ ...msg });
      }
    }

    // Prefer streaming when available (instant feedback)
    if (this.client.chatStream && this.onStreamChunk) {
      const response = await this.client.chatStream(merged, this.onStreamChunk);
      this.history.push({ role: "assistant", content: response });
      return response;
    }

    // Use proper message array if client supports chat()
    if (this.client.chat) {
      const response = await this.client.chat(merged, { jsonMode: true });
      this.history.push({ role: "assistant", content: response });
      return response;
    }

    // Fallback: single prompt (old AIClient interface)
    const prompt = [
      SYSTEM_PROMPT,
      "",
      "## Conversation:",
      ...this.history.map(
        (m) => `${m.role === "user" ? "USER" : "MEPORT"}: ${m.content}`
      ),
      "",
      "MEPORT (respond with JSON):",
    ].join("\n");

    const response = await this.client.generate(prompt);
    this.history.push({ role: "assistant", content: response });
    return response;
  }

  private processResponse(response: string): InterviewRound {
    const parsed = this.parseResponse(response);

    for (const [key, dim] of Object.entries(parsed.extracted)) {
      const existing = this.dimensions[key];
      if (!existing || dim.confidence > existing.confidence) {
        this.dimensions[key] = { ...dim, source: "interview" };
      }
      if (dim.export_rule) {
        if (dim.confidence < 0.7) {
          // AI observation — needs confirmation before export
          const unconfirmed = this.unconfirmedRules.get(key) ?? [];
          if (!unconfirmed.includes(dim.export_rule)) {
            unconfirmed.push(dim.export_rule);
          }
          this.unconfirmedRules.set(key, unconfirmed);
        } else {
          // Direct answer — add to confirmed export rules
          const existing = this.exportRules.get(key) ?? [];
          if (!existing.includes(dim.export_rule)) {
            existing.push(dim.export_rule);
          }
          this.exportRules.set(key, existing);
        }
      }
    }

    // Update phase from AI response
    if (parsed.phase && parsed.phase > this.currentPhase) {
      this.currentPhase = parsed.phase;
    }

    const depth = this.getDepth();
    const phaseLabels = this.locale === "pl"
      ? ["", "Cześć!", "Twoja historia", "Jak pracujesz", "Kontekst", "Podsumowanie"]
      : ["", "Hey!", "Your story", "How you work", "Life context", "Wrap up"];

    // Minimum quality gate: at least 3 interview-sourced dimensions with decent confidence
    const interviewDims = Object.values(this.dimensions).filter(
      (d) => d.source === "interview" && d.confidence >= 0.7
    );
    const qualityGate = interviewDims.length >= 3;

    return {
      aiMessage: parsed.message,
      options: parsed.options ?? [],
      dimensions: { ...this.dimensions },
      complete: (parsed.complete || this.roundCount >= this.maxRounds || depth >= 85) && qualityGate,
      phase: this.currentPhase,
      phaseLabel: parsed.phaseLabel || phaseLabels[this.currentPhase] || "",
      depth,
      suggestedTopics: this.getMissing(),
    };
  }

  private parseResponse(response: string): {
    message: string;
    options: string[];
    extracted: Record<string, ExtractedDimension & { export_rule?: string }>;
    complete: boolean;
    phase?: number;
    phaseLabel?: string;
  } {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          message: parsed.message ?? response,
          options: Array.isArray(parsed.options) ? parsed.options : [],
          extracted: parsed.extracted ?? {},
          complete: parsed.complete ?? false,
          phase: parsed.phase,
          phaseLabel: parsed.phase_label,
        };
      } catch {}
    }

    return {
      message: response.replace(/```json[\s\S]*?```/g, "").trim() || response,
      options: [],
      extracted: {},
      complete: false,
    };
  }

  private getDepth(): number {
    const categories = ["identity", "communication", "ai", "work", "cognitive", "lifestyle", "context", "personality"];
    const covered = categories.filter((c) =>
      Object.entries(this.dimensions).some(([k, d]) => k.startsWith(c + ".") && d.confidence >= 0.6)
    );

    // Weight dimensions by confidence: a 0.5 dim counts as 0.75 points, a 1.0 dim counts as 1.5
    let weightedDimCount = 0;
    for (const [k, d] of Object.entries(this.dimensions)) {
      if (k.startsWith("_")) continue;
      weightedDimCount += d.confidence * 1.5;
    }

    return Math.min(100, Math.round(
      (covered.length / categories.length) * 40 +
      Math.min(60, weightedDimCount)
    ));
  }

  private getMissing(): string[] {
    const categories = [
      { key: "identity", label: "who you are" },
      { key: "communication", label: "communication style" },
      { key: "work", label: "work style" },
      { key: "context", label: "life context" },
      { key: "personality", label: "motivation & values" },
    ];

    return categories
      .filter((c) => !Object.keys(this.dimensions).some((k) => k.startsWith(c.key + ".")))
      .map((c) => c.label);
  }
}
