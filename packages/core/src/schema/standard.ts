/**
 * Meport Standard Format v1.0
 * "The vCard for AI" — portable persona profiles across AI platforms
 *
 * Progressive levels:
 *   Level 0: Identity only (4 fields, any tool can generate)
 *   Level 1: + Communication & AI preferences (~15 fields)
 *   Level 2: + Behavioral profile (~35 fields, full Meport interview)
 *   Level 3: + Intelligence layer (inferred, compounds, contradictions, emergent, synthesis)
 *
 * Design principles:
 *   - Source-agnostic: no question_ids, no tool-specific references
 *   - Self-describing: $schema + @context for validation and linked data
 *   - Progressive: every level is independently valid and useful
 *   - Interoperable: identity maps to Schema.org Person, instructions map to system prompts
 *
 * File convention: .meport.json
 * MIME type: application/vnd.meport.persona+json
 */

// ─── Root ────────────────────────────────────────────────

export interface MeportProfile {
  /** JSON Schema URL for validation */
  $schema: "https://meport.app/schema/v1.json";

  /** JSON-LD context for linked data interop */
  "@context": "https://meport.app/context/v1";

  /** Profile type identifier */
  "@type": "MeportProfile";

  /** Schema version */
  version: "1.0";

  /** Unique profile identifier (UUID v4) */
  id: string;

  /** Profile category */
  profileType: "personal" | "professional" | "creative";

  /** ISO-8601 timestamps */
  created: string;
  updated: string;

  /**
   * Computed from which sections are populated:
   *   0 = identity only
   *   1 = + communication/aiPreferences
   *   2 = + cognitive/work/personality
   *   3 = + intelligence layer
   */
  level: 0 | 1 | 2 | 3;

  /** Profile completeness within current level (0.0-1.0) */
  completeness: number;

  // ── Level 0 (REQUIRED) ──────────────────────────────

  identity: MeportIdentity;

  // ── Level 1 (optional) ──────────────────────────────

  communication?: MeportCommunication;
  aiPreferences?: MeportAIPreferences;

  // ── Level 2 (optional) ──────────────────────────────

  cognitive?: MeportCognitive;
  work?: MeportWork;
  personality?: MeportPersonality;
  neurodivergent?: MeportNeurodivergent;
  expertise?: MeportExpertise;
  lifeContext?: MeportLifeContext;
  financial?: MeportFinancial;
  goals?: string[];
  antiGoals?: string[];

  // ── Any level (POLICY) ─────────────────────────────

  /** Behavioral instructions for AI systems — "how to treat me" rules */
  instructions?: MeportInstruction[];

  /** Hard prohibitions — things AI must NEVER do */
  never?: MeportNeverRule[];

  /** Privacy controls — which sections can be shared */
  sharing?: MeportSharing;

  // ── Level 3 (optional) ──────────────────────────────

  intelligence?: MeportIntelligence;

  // ── Meta ────────────────────────────────────────────

  provenance: MeportProvenance;
}

// ─── Level 0: Identity ───────────────────────────────────

export interface MeportIdentity {
  /** Full name */
  name: string;

  /** How the person prefers to be addressed */
  preferredName?: string;

  /** BCP-47 language tag (e.g. "pl", "en-US") */
  language: string;

  /** Preferred pronouns */
  pronouns?: string;

  /** IANA timezone (e.g. "Europe/Warsaw") */
  timezone?: string;

  /** General location (city/country, not address) */
  location?: string;
}

// ─── Level 1: Communication ──────────────────────────────

export interface MeportCommunication {
  /** How direct should communication be? */
  directness?: "very_direct" | "direct" | "balanced" | "indirect" | "very_indirect";

  /** Preferred response length */
  verbosity?: "minimal" | "concise" | "balanced" | "detailed" | "comprehensive";

  /** Tone and register */
  formality?: "casual" | "semiformal" | "formal" | "adaptive";

  /** How to deliver feedback */
  feedbackStyle?: "blunt" | "direct" | "constructive" | "gentle";

  /** Response to being corrected */
  correctionReceptivity?: "welcome" | "accept" | "sensitive" | "resistant";

  /** Preferred content format */
  formatPreference?: "prose" | "bullets" | "structured" | "code_first" | "mixed";

  /** Humor tolerance */
  humor?: "none" | "occasional" | "frequent" | "dry" | "playful";
}

// ─── Level 1: AI Preferences ────────────────────────────

export interface MeportAIPreferences {
  /** How the person views AI */
  relationshipModel?: "tool" | "collaborator" | "mentor" | "peer" | "coach" | "assistant";

  /** Should AI act without being asked? */
  proactivity?: "reactive" | "balanced" | "proactive" | "autonomous";

  /** How AI should correct mistakes */
  correctionStyle?: "direct" | "explain_then_correct" | "ask_first" | "suggest";

  /** How much AI should remember */
  memoryScope?: "minimal" | "session" | "essential" | "comprehensive";

  /** How deep explanations should go */
  explanationDepth?: "surface" | "practical" | "thorough" | "deep";
}

// ─── Level 2: Cognitive ─────────────────────────────────

export interface MeportCognitive {
  /** Primary thinking approach */
  thinkingStyle?: "analytical" | "creative" | "practical" | "systematic" | "holistic";

  /** How the person learns best */
  learningMode?: "visual" | "textual" | "hands_on" | "conceptual" | "example_based";

  /** How decisions are made */
  decisionPattern?: "data_driven" | "intuitive" | "consultative" | "rapid" | "deliberate";

  /** Comfort with abstract concepts */
  abstractionLevel?: "concrete" | "balanced" | "abstract";

  /** Preferred mental model (free text) */
  mentalModel?: string;
}

// ─── Level 2: Work ──────────────────────────────────────

export interface MeportWork {
  /** Energy distribution pattern */
  energyPattern?: "steady" | "burst" | "nocturnal" | "early_bird" | "variable";

  /** Best hours for focused work (HH:MM-HH:MM) */
  peakHours?: string;

  /** Preferred task size */
  taskSize?: "micro" | "small" | "medium" | "large" | "epic";

  /** Relationship with deadlines */
  deadlineStyle?: "early" | "steady" | "pressure_driven" | "last_minute";

  /** Collaboration preference */
  collaboration?: "solo" | "pair" | "small_team" | "flexible";

  /** Context switching tolerance */
  contextSwitching?: "avoid" | "tolerate" | "embrace";
}

// ─── Level 2: Personality ───────────────────────────────

export interface MeportPersonality {
  /** What drives this person */
  motivation?: "freedom" | "achievement" | "connection" | "mastery" | "impact" | "security";

  /** Behavior under stress */
  stressResponse?: "withdraw" | "push_through" | "seek_help" | "distract" | "analyze";

  /** Relationship with perfection */
  perfectionism?: "low" | "moderate" | "high" | "situational";

  /** Comfort with uncertainty */
  riskTolerance?: "averse" | "cautious" | "moderate" | "high" | "thrill_seeking";

  /** Response to ambiguity */
  ambiguityTolerance?: "low" | "moderate" | "high";
}

// ─── Level 2: Neurodivergent (optional) ─────────────────

export interface MeportNeurodivergent {
  /** Self-identified traits */
  traits?: ("adhd" | "autism" | "dyslexia" | "dyspraxia" | "ocd" | "anxiety" | "other")[];

  /** Helpful adaptations (free text list) */
  adaptations?: string[];

  /** Accuracy of time estimation */
  timeAwareness?: "accurate" | "variable" | "poor";

  /** Frequency of hyperfocus states */
  hyperfocus?: "rare" | "occasional" | "frequent";

  /** Sensory considerations */
  sensoryNotes?: string[];
}

// ─── Level 2: Expertise (optional) ──────────────────────

export interface MeportExpertise {
  /** Primary knowledge domains */
  domains?: string[];

  /** Technical tools and languages */
  techStack?: string[];

  /** Years of professional experience */
  experienceYears?: number;

  /** Industry sectors */
  industries?: string[];

  /** Self-assessed overall level */
  level?: "beginner" | "intermediate" | "advanced" | "expert";
}

// ─── Level 2: Life Context (optional) ───────────────────

export interface MeportLifeContext {
  /** Current life stage */
  stage?: "student" | "early_career" | "mid_career" | "senior" | "founder" | "retired" | "transitioning";

  /** Current priorities (ordered by importance) */
  priorities?: string[];

  /** Known constraints or limitations */
  constraints?: string[];

  /** Family situation (kids, partner, pets — free text) */
  family?: string;

  /** Hobbies and interests */
  hobbies?: string[];

  /** General location preference or cultural context */
  locationContext?: string;

  /** Health context (voluntary, sensitive) */
  healthContext?: string;

  /** Dietary preferences */
  dietary?: string;
}

// ─── Level 2: Financial (optional, sensitive) ───────────

export interface MeportFinancial {
  /** Financial mindset */
  mindset?: "scarcity" | "cautious" | "balanced" | "abundant";

  /** Price sensitivity level */
  priceSensitivity?: "low" | "medium" | "high";

  /** Income stability */
  incomeStability?: "stable" | "variable" | "project_based" | "uncertain";

  /** Financial stress level */
  stressLevel?: "none" | "mild" | "moderate" | "severe";

  /** Section metadata */
  _meta?: SectionMeta;
}

// ─── Instructions (POLICY) ──────────────────────────────

export interface MeportInstruction {
  /** The behavioral rule (e.g. "Always respond in Polish") */
  rule: string;

  /** Instruction type for categorization */
  type?: "behavior" | "format" | "language" | "decision" | "safety" | "workflow";

  /** When this rule applies */
  context?: "always" | "work" | "casual" | "writing" | "coding" | "learning";

  /** Importance (1 = nice-to-have, 10 = critical) */
  priority?: number;
}

// ─── Never Rules (POLICY, hard prohibitions) ────────────

export interface MeportNeverRule {
  /** What AI must never do */
  rule: string;

  /** Priority level */
  priority?: "critical" | "high" | "medium";
}

// ─── Section Metadata ───────────────────────────────────

export interface SectionMeta {
  /** Data sensitivity level */
  sensitive?: boolean;

  /** Default sharing scope */
  defaultScope?: "public" | "trusted" | "private";

  /** Data stability */
  stability?: "stable" | "evolving" | "temporary";
}

// ─── Sharing / Privacy ──────────────────────────────────

export interface MeportSharing {
  /** Sections visible to any consumer */
  public?: MeportSection[];

  /** Sections only for trusted consumers */
  trusted?: MeportSection[];

  /** Sections never shared (kept local) */
  private?: MeportSection[];
}

export type MeportSection =
  | "identity"
  | "communication"
  | "aiPreferences"
  | "cognitive"
  | "work"
  | "personality"
  | "neurodivergent"
  | "expertise"
  | "lifeContext"
  | "financial"
  | "instructions"
  | "never"
  | "intelligence";

// ─── Level 3: Intelligence ──────────────────────────────

export interface MeportIntelligence {
  /** Values inferred by AI from behavioral signals */
  inferred?: MeportInferredValue[];

  /** Cross-dimensional compound signals */
  compounds?: MeportCompoundValue[];

  /** Detected contradictions between stated preferences */
  contradictions?: MeportContradiction[];

  /** AI-generated observations, user-reviewable */
  emergent?: MeportEmergentObservation[];

  /** Rich narrative synthesis */
  synthesis?: MeportSynthesis;
}

export interface MeportInferredValue {
  /** Target dimension path (e.g. "communication.directness") */
  dimension: string;

  /** Inferred value */
  value: string;

  /** Confidence level (0.0-1.0) */
  confidence: number;

  /** What type of signal produced this */
  source: "behavioral" | "pattern" | "contextual";

  /** Human-readable explanation */
  reasoning?: string;
}

export interface MeportCompoundValue {
  /** Derived dimension name */
  dimension: string;

  /** Compound value */
  value: string;

  /** Confidence level (0.0-1.0) */
  confidence: number;

  /** Which dimensions contributed */
  inputs: string[];

  /** How this should be presented to AI consumers */
  exportInstruction?: string;
}

export interface MeportContradiction {
  /** The two dimensions that contradict */
  dimensions: [string, string];

  /** What the contradiction is */
  description: string;

  /** How to handle it */
  resolution: "flag_both" | "nuance_both" | "context_dependent";

  /** Additional context */
  note?: string;
}

export interface MeportEmergentObservation {
  /** Unique observation ID */
  id: string;

  /** Category of observation */
  category:
    | "personality_pattern"
    | "cognitive_pattern"
    | "behavioral_pattern"
    | "hidden_strength"
    | "risk_flag"
    | "insight";

  /** Short title */
  title: string;

  /** Full observation text */
  observation: string;

  /** Evidence references */
  evidence?: string[];

  /** Confidence level (0.0-1.0) */
  confidence: number;

  /** User's review status */
  status: "pending" | "accepted" | "edited" | "rejected";

  /** User's edit if they modified the observation */
  userEdit?: string;
}

export interface MeportSynthesis {
  /** Prose summary of the person */
  narrative: string;

  /** Archetype label (e.g. "The Pragmatic Builder") */
  archetype?: string;

  /** Archetype description */
  archetypeDescription?: string;

  /** Cognitive profile summary */
  cognitiveProfile?: {
    thinkingStyle: string;
    learningMode: string;
    decisionPattern: string;
    attentionType: string;
  };

  /** Communication DNA */
  communicationDNA?: {
    tone: string;
    formality: string;
    directness: string;
    adaptations: string[];
  };

  /** Key contradictions summary */
  contradictions?: {
    area: string;
    observation: string;
    resolution: string;
  }[];

  /** Behavioral predictions */
  predictions?: {
    context: string;
    prediction: string;
    confidence: number;
  }[];

  /** Key strengths */
  strengths?: string[];

  /** Blind spots */
  blindSpots?: string[];
}

// ─── Provenance ─────────────────────────────────────────

export interface MeportProvenance {
  /** What generated this profile */
  source: "meport" | "manual" | "import:chatgpt" | "import:claude" | "import:gemini" | "import:custom" | string;

  /** How the data was collected */
  method: "interview" | "file_scan" | "self_report" | "behavioral" | "hybrid";

  /** Tool version that generated this */
  toolVersion?: string;

  /** When the profile was last verified by the user */
  lastVerified?: string;
}

// ─── Utilities ──────────────────────────────────────────

/** Compute profile level from populated sections */
export function computeLevel(profile: Partial<MeportProfile>): 0 | 1 | 2 | 3 {
  if (profile.intelligence) return 3;
  if (profile.cognitive || profile.work || profile.personality || profile.neurodivergent || profile.expertise || profile.lifeContext) return 2;
  if (profile.communication || profile.aiPreferences) return 1;
  return 0;
}

/** Validate a minimal Level 0 profile */
export function isValidLevel0(profile: unknown): profile is MeportProfile {
  if (!profile || typeof profile !== "object") return false;
  const p = profile as Record<string, unknown>;
  if (p.version !== "1.0") return false;
  if (!p.identity || typeof p.identity !== "object") return false;
  const id = p.identity as Record<string, unknown>;
  return typeof id.name === "string" && id.name.length > 0 && typeof id.language === "string";
}

/** Section weight map for export priority */
export const SECTION_WEIGHTS: Record<MeportSection, number> = {
  identity: 10,
  communication: 9,
  aiPreferences: 8,
  cognitive: 5,
  work: 6,
  personality: 4,
  neurodivergent: 3,
  expertise: 2,
  lifeContext: 2,
  financial: 3,
  instructions: 9,
  never: 10,
  intelligence: 1,
};
