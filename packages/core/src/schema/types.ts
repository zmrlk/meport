/**
 * Meport Schema v1.0 — TypeScript type definitions
 * The vCard for AI — portable profiles across 20+ platforms
 */

// ─── Profile ───────────────────────────────────────────────

export interface PersonaProfile {
  schema_version: "1.0";
  profile_type: "personal" | "business";
  profile_id: string;
  created_at: string;
  updated_at: string;
  completeness: number; // 0-100

  // Layer 1: Explicit (from answers)
  explicit: Record<string, DimensionValue>;

  // Layer 2: Inferred (rules + signals)
  inferred: Record<string, InferredValue>;

  // Layer 2B: Compound signals
  compound: Record<string, CompoundValue>;

  // Layer 2C: Contradictions
  contradictions: Contradiction[];

  // Layer 3: Emergent (AI-generated, user-reviewed)
  emergent: EmergentObservation[];

  // Layer 4: AI Synthesis (rich analysis for export)
  synthesis?: ProfileSynthesis;

  // Layer 5: AI refinement history (export chat sessions)
  refinements?: RefinementSession[];

  // Behavioral meta
  meta: ProfileMeta;
}

export interface DimensionValue {
  dimension: string;
  value: string | number | string[];
  confidence: 1.0;
  source: "explicit";
  question_id: string;
}

export interface InferredValue {
  dimension: string;
  value: string;
  confidence: number; // 0.5-0.95
  source: "behavioral" | "compound" | "contradiction";
  signal_id: string;
  override: "secondary" | "primary" | "flag_only";
}

export interface CompoundValue {
  dimension: string;
  value: string;
  confidence: number;
  rule_id: string;
  inputs: string[]; // question_ids used
  export_instruction: string;
}

export interface Contradiction {
  rule_id: string;
  dimensions: [string, string];
  description: string;
  resolution: "flag_both" | "nuance_both" | "flag_for_reveal";
  note: string;
  confidence_impact: string;
}

export interface EmergentObservation {
  observation_id: string;
  category:
    | "personality_pattern"
    | "cognitive_pattern"
    | "behavioral_pattern"
    | "compound_signal"
    | "contradiction"
    | "hidden_strength"
    | "risk_flag";
  title: string;
  observation: string;
  evidence: string[]; // "question_id:value"
  confidence: number; // 0.3-0.7
  export_instruction: string;
  status: "pending_review" | "accepted" | "edited" | "removed";
  user_edit?: string;
}

export interface ProfileSynthesis {
  narrative: string;
  archetype?: string;
  archetypeDescription?: string;
  exportRules: string[];
  cognitiveProfile?: {
    thinkingStyle: string;
    learningMode: string;
    decisionPattern: string;
    attentionType: string;
  };
  communicationDNA?: {
    tone: string;
    formality: string;
    directness: string;
    adaptations: string[];
  };
  contradictions?: { area: string; observation: string; resolution: string }[];
  predictions?: { context: string; prediction: string; confidence: number }[];
  strengths?: string[];
  blindSpots?: string[];
}

export interface RefinementMessage {
  role: "user" | "ai";
  text: string;
  timestamp: string;
}

export interface RefinementSession {
  id: string;
  platform: string; // e.g. "chatgpt", "claude-code"
  created_at: string;
  messages: RefinementMessage[];
  dimensions_added: string[]; // dimensions extracted and added to profile
  content_before: string; // compiled text before AI changes
  content_after: string; // final text after AI changes
}

export interface ProfileMeta {
  tiers_completed: number[];
  tiers_skipped: number[];
  total_questions_answered: number;
  total_questions_skipped: number;
  avg_response_time_ms: number;
  profiling_duration_ms: number;
  profiling_method: "interactive" | "file_scan" | "hybrid";
  layer3_available: boolean;
  session_count?: number;
  last_session_date?: string;
  depth_per_category?: Record<string, number>; // 0-100 per category
  unexplored_topics?: string[]; // topics to probe next session
  feedback_scores?: { date: string; score: number; note?: string }[];
}

// ─── Questions ─────────────────────────────────────────────

export interface QuestionTier {
  tier: number;
  tier_name: string;
  tier_intro: string;
  tier_complete: {
    headline: string;
    body: string;
  };
  questions: Question[];
}

export type QuestionType =
  | "select"
  | "scenario"
  | "spectrum"
  | "ranking"
  | "multi_select"
  | "scale"
  | "open_text"
  | "matrix";

export interface Question {
  id: string;
  tier: number;
  tier_name: string;
  question: string;
  type: QuestionType;
  dimension: string;
  skippable: boolean;
  meta_profiling: string | null;
  why_this_matters: string | null;

  // Type-specific
  options?: QuestionOption[];
  placeholder?: string;
  scale_min?: number;
  scale_max?: number;
  scale_labels?: Record<string, string>;
  rows?: MatrixRow[];
  columns?: MatrixColumn[];

  // Follow-up
  is_followup?: boolean;
  parent_question?: string;
}

export interface QuestionOption {
  value: string;
  label: string;
  maps_to: { dimension: string; value: string };
  also_maps_to?: { dimension: string; value: string };
  triggers?: string[];
}

export interface MatrixRow {
  id: string;
  label: string;
  dimension: string;
}

export interface MatrixColumn {
  value: string;
  label: string;
}

// ─── Answers ───────────────────────────────────────────────

export interface Answer {
  question_id: string;
  value: string | string[] | number | Record<string, string>;
  timestamp: number; // ms since profiling start
  response_time_ms: number;
  skipped: boolean;
}

// ─── Inference ─────────────────────────────────────────────

export interface BehavioralSignal {
  signal_id: string;
  capture_method: "timer" | "text_analysis" | "pattern_match" | "count";
  input: string;
  condition: string;
  output: {
    dimension: string;
    value: string;
    confidence: number;
  };
  override: "secondary" | "primary" | "flag_only";
}

export interface CompoundSignalRule {
  rule_id: string;
  name: string;
  inputs: string[]; // "question_id.value" references
  condition: string;
  output: {
    dimension: string;
    value: string;
    confidence: number;
    export_instruction: string;
  };
  description: string;
}

export interface ContradictionRule {
  rule_id: string;
  check: [string, string];
  contradiction: string;
  resolution: "flag_both" | "nuance_both" | "flag_for_reveal";
  note: string;
  confidence_impact: string;
}

// ─── Export ────────────────────────────────────────────────

export interface ExportCompilerConfig {
  platform: string;
  format: "text" | "markdown" | "json" | "modelfile" | "mdc" | "pdf";
  charLimit: number | null;
  tokenLimit: number | null;
  priority: "P0" | "P1" | "P2";
}

export interface ExportResult {
  content: string;
  filename: string;
  instructions: string;
  charCount: number;
  dimensionsCovered: number;
  dimensionsOmitted: number;
  confidence_floor: number;
}

// ─── Dimension Weights ─────────────────────────────────────

export interface ExportableDimension {
  dimension: string;
  value: string;
  confidence: number;
  weight: number; // 1-10
  source: "explicit" | "inferred" | "compound" | "emergent";
  export_instruction?: string;
}

export const DIMENSION_WEIGHTS: Record<string, number> = {
  // Weight 10 — always include
  "identity.preferred_name": 10,
  "identity.language": 10,
  "identity.pronouns": 10,

  // Weight 9 — core communication
  "communication.verbosity_preference": 9,
  "communication.directness": 9,
  "communication.format_preference": 9,
  "communication.feedback_style": 9,
  "communication.correction_receptivity": 9,

  // Weight 8 — AI relationship
  "ai.relationship_model": 8,
  "ai.correction_style": 8,
  "ai.proactivity": 8,
  "ai.memory_preference": 8,

  // Weight 7 — compound signals
  "compound.directness": 7,
  "compound.cognitive_style": 7,
  "compound.adhd_pattern": 7,
  "compound.work_rhythm": 7,
  "compound.autonomy": 7,
  "compound.anxiety_pattern": 7,

  // Weight 6 — work patterns
  "work.energy_archetype": 6,
  "work.peak_hours": 6,
  "work.task_granularity": 6,
  "work.deadline_behavior": 6,

  // Weight 5 — cognitive
  "cognitive.learning_style": 5,
  "cognitive.decision_style": 5,
  "cognitive.abstraction_preference": 5,
  "cognitive.mental_model": 5,

  // Weight 4 — personality
  "personality.core_motivation": 4,
  "personality.stress_response": 4,
  "personality.perfectionism": 4,

  // Weight 3 — neurodivergent
  "neurodivergent.adhd_adaptations": 3,
  "neurodivergent.time_perception": 3,
  "neurodivergent.hyperfocus": 3,

  // Weight 2 — life context
  "life.life_stage": 2,
  "life.financial_context": 2,
  "life.priorities": 2,

  // Weight 1 — expertise details
  "expertise.tech_stack": 1,
  "expertise.industries": 1,
  "expertise.secondary_domains": 1,
};

export function getDimensionWeight(dimension: string): number {
  // Exact match first
  if (DIMENSION_WEIGHTS[dimension] !== undefined) {
    return DIMENSION_WEIGHTS[dimension];
  }
  // Category match (e.g., "communication.*" → 9)
  const category = dimension.split(".")[0];
  const categoryDefaults: Record<string, number> = {
    identity: 10,
    communication: 9,
    ai: 8,
    compound: 7,
    work: 6,
    cognitive: 5,
    personality: 4,
    neurodivergent: 3,
    life: 2,
    expertise: 1,
    meta: 1,
  };
  return categoryDefaults[category] ?? 3;
}
