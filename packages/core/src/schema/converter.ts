/**
 * Meport v1 → v2 Standard Converter
 *
 * Transforms internal PersonaProfile (v1, flat dimension keys)
 * into MeportProfile (v2 standard, nested structure).
 *
 * This is one-way: v1 → v2. The standard format is for export/portability.
 * Internal Meport operations can continue using v1 format.
 */

import { v4 as uuid } from "uuid";
import type { PersonaProfile, DimensionValue, EmergentObservation, ProfileSynthesis } from "./types";
import type {
  MeportProfile,
  MeportIdentity,
  MeportCommunication,
  MeportAIPreferences,
  MeportCognitive,
  MeportWork,
  MeportPersonality,
  MeportNeurodivergent,
  MeportExpertise,
  MeportLifeContext,
  MeportFinancial,
  MeportInstruction,
  MeportNeverRule,
  MeportIntelligence,
  MeportInferredValue,
  MeportCompoundValue,
  MeportContradiction,
  MeportEmergentObservation,
  MeportSynthesis,
} from "./standard";
import { computeLevel } from "./standard";

// ─── Dimension → Section mapping ────────────────────────

const DIMENSION_TO_SECTION: Record<string, string> = {
  // Identity
  "identity.preferred_name": "identity.preferredName",
  "identity.language": "identity.language",
  "identity.pronouns": "identity.pronouns",
  "identity.timezone": "identity.timezone",
  "identity.location": "identity.location",

  // Communication
  "communication.directness": "communication.directness",
  "communication.verbosity_preference": "communication.verbosity",
  "communication.format_preference": "communication.formatPreference",
  "communication.feedback_style": "communication.feedbackStyle",
  "communication.correction_receptivity": "communication.correctionReceptivity",
  "communication.humor": "communication.humor",
  "communication.formality": "communication.formality",

  // AI Preferences
  "ai.relationship_model": "aiPreferences.relationshipModel",
  "ai.proactivity": "aiPreferences.proactivity",
  "ai.correction_style": "aiPreferences.correctionStyle",
  "ai.memory_preference": "aiPreferences.memoryScope",
  "ai.explanation_depth": "aiPreferences.explanationDepth",

  // Cognitive
  "cognitive.learning_style": "cognitive.learningMode",
  "cognitive.decision_style": "cognitive.decisionPattern",
  "cognitive.abstraction_preference": "cognitive.abstractionLevel",
  "cognitive.mental_model": "cognitive.mentalModel",
  "cognitive.thinking_style": "cognitive.thinkingStyle",

  // Work
  "work.energy_archetype": "work.energyPattern",
  "work.peak_hours": "work.peakHours",
  "work.task_granularity": "work.taskSize",
  "work.deadline_behavior": "work.deadlineStyle",
  "work.collaboration": "work.collaboration",
  "work.context_switching": "work.contextSwitching",

  // Personality
  "personality.core_motivation": "personality.motivation",
  "personality.stress_response": "personality.stressResponse",
  "personality.perfectionism": "personality.perfectionism",
  "personality.risk_tolerance": "personality.riskTolerance",

  // Neurodivergent
  "neurodivergent.adhd_adaptations": "neurodivergent.adaptations",
  "neurodivergent.time_perception": "neurodivergent.timeAwareness",
  "neurodivergent.hyperfocus": "neurodivergent.hyperfocus",

  // Expertise
  "expertise.tech_stack": "expertise.techStack",
  "expertise.industries": "expertise.industries",
  "expertise.secondary_domains": "expertise.domains",

  // Life context
  "life.life_stage": "lifeContext.stage",
  "life.financial_context": "lifeContext.constraints",
  "life.priorities": "lifeContext.priorities",
};

// ─── Value normalizers ──────────────────────────────────

/** Normalize language codes: "pl_default" → "pl" */
function normalizeLanguage(value: string): string {
  const match = value.match(/^([a-z]{2})(?:_|$)/);
  return match ? match[1] : value.toLowerCase().slice(0, 2);
}

/** Extract clean name from verbose scan output */
function cleanName(value: string): string {
  // "Karol — na podstawie ścieżek systemowych..." → "Karol"
  const dashIdx = value.indexOf("—");
  if (dashIdx > 0) return value.slice(0, dashIdx).trim();
  const colonIdx = value.indexOf(":");
  if (colonIdx > 0 && colonIdx < 30) return value.slice(0, colonIdx).trim();
  return value.trim();
}

/** Normalize enum values: handle verbose descriptions → clean enum */
function normalizeEnum(value: string, validValues: string[]): string | undefined {
  const lower = value.toLowerCase().replace(/[\s-]+/g, "_");

  // Direct match
  if (validValues.includes(lower)) return lower;

  // Partial match (value contains valid option)
  for (const valid of validValues) {
    if (lower.includes(valid)) return valid;
  }

  // If value is too long (likely a narrative), skip
  if (value.length > 100) return undefined;

  return lower;
}

// ─── Main converter ─────────────────────────────────────

export interface ConvertOptions {
  /** Profile ID to use (generated if omitted) */
  id?: string;
  /** Profile type */
  profileType?: "personal" | "professional" | "creative";
  /** Include intelligence layer (Level 3) */
  includeIntelligence?: boolean;
  /** Include AI rules as instructions */
  includeRules?: boolean;
}

export function convertV1toV2(
  v1: PersonaProfile,
  options: ConvertOptions = {}
): MeportProfile {
  const {
    id = uuid(),
    profileType = v1.profile_type === "business" ? "professional" : "personal",
    includeIntelligence = true,
    includeRules = true,
  } = options;

  // Build sections from flat dimensions
  const identity = buildIdentity(v1.explicit);
  const communication = buildCommunication(v1.explicit);
  const aiPreferences = buildAIPreferences(v1.explicit);
  const cognitive = buildCognitive(v1.explicit);
  const work = buildWork(v1.explicit);
  const personality = buildPersonality(v1.explicit);
  const neurodivergent = buildNeurodivergent(v1.explicit);
  const expertise = buildExpertise(v1.explicit);
  const lifeContext = buildLifeContext(v1.explicit);
  const financial = buildFinancial(v1.explicit);
  const { instructions, never } = includeRules ? buildInstructionsAndNever(v1.explicit) : { instructions: undefined, never: undefined };
  const goals = buildGoals(v1.explicit);
  const antiGoals = buildAntiGoals(v1.explicit);
  const intelligence = includeIntelligence ? buildIntelligence(v1) : undefined;

  const profile: MeportProfile = {
    $schema: "https://meport.app/schema/v1.json",
    "@context": "https://meport.app/context/v1",
    "@type": "MeportProfile",
    version: "1.0",
    id,
    profileType,
    created: v1.created_at,
    updated: v1.updated_at,
    level: 0, // computed below
    completeness: v1.completeness / 100,
    identity,
    provenance: {
      source: "meport",
      method: v1.meta?.profiling_method === "interactive" ? "interview" : (v1.meta?.profiling_method || "hybrid"),
      toolVersion: "1.0",
      lastVerified: v1.updated_at,
    },
  };

  // Add non-empty sections
  if (communication && Object.keys(communication).length > 0) profile.communication = communication;
  if (aiPreferences && Object.keys(aiPreferences).length > 0) profile.aiPreferences = aiPreferences;
  if (cognitive && Object.keys(cognitive).length > 0) profile.cognitive = cognitive;
  if (work && Object.keys(work).length > 0) profile.work = work;
  if (personality && Object.keys(personality).length > 0) profile.personality = personality;
  if (neurodivergent && Object.keys(neurodivergent).length > 0) profile.neurodivergent = neurodivergent;
  if (expertise && Object.keys(expertise).length > 0) profile.expertise = expertise;
  if (lifeContext && Object.keys(lifeContext).length > 0) profile.lifeContext = lifeContext;
  if (financial && Object.keys(financial).length > 0) profile.financial = financial;
  if (goals && goals.length > 0) profile.goals = goals;
  if (antiGoals && antiGoals.length > 0) profile.antiGoals = antiGoals;
  if (instructions && instructions.length > 0) profile.instructions = instructions;
  if (never && never.length > 0) profile.never = never;
  if (intelligence) profile.intelligence = intelligence;

  // Compute level
  profile.level = computeLevel(profile);

  return profile;
}

// ─── Section builders ───────────────────────────────────

function getExplicitValue(explicit: Record<string, DimensionValue>, key: string): string | undefined {
  const dim = explicit[key];
  if (!dim) return undefined;
  return typeof dim.value === "string" ? dim.value : String(dim.value);
}

function buildIdentity(explicit: Record<string, DimensionValue>): MeportIdentity {
  const rawName = getExplicitValue(explicit, "identity.preferred_name") || "Unknown";
  const name = cleanName(rawName);
  const rawLang = getExplicitValue(explicit, "identity.language") || "en";
  const language = normalizeLanguage(rawLang);

  const identity: MeportIdentity = { name, language };

  if (name !== rawName && rawName.length < 50) identity.preferredName = name;

  const pronouns = getExplicitValue(explicit, "identity.pronouns");
  if (pronouns) identity.pronouns = pronouns;

  const timezone = getExplicitValue(explicit, "identity.timezone");
  if (timezone) identity.timezone = timezone;

  const location = getExplicitValue(explicit, "identity.location");
  if (location) identity.location = location.length > 80 ? location.slice(0, 80) : location;

  return identity;
}

function buildCommunication(explicit: Record<string, DimensionValue>): Partial<MeportCommunication> {
  const result: Record<string, string> = {};
  const fields: [string, string, string[]][] = [
    ["communication.directness", "directness", ["very_direct", "direct", "balanced", "indirect", "very_indirect"]],
    ["communication.verbosity_preference", "verbosity", ["minimal", "concise", "balanced", "detailed", "comprehensive"]],
    ["communication.formality", "formality", ["casual", "semiformal", "formal", "adaptive"]],
    ["communication.feedback_style", "feedbackStyle", ["blunt", "direct", "constructive", "gentle"]],
    ["communication.correction_receptivity", "correctionReceptivity", ["welcome", "accept", "sensitive", "resistant"]],
    ["communication.format_preference", "formatPreference", ["prose", "bullets", "structured", "code_first", "mixed"]],
    ["communication.humor", "humor", ["none", "occasional", "frequent", "dry", "playful"]],
  ];
  for (const [dimKey, fieldKey, valid] of fields) {
    const raw = getExplicitValue(explicit, dimKey);
    if (raw) {
      const normalized = normalizeEnum(raw, valid);
      if (normalized) result[fieldKey] = normalized;
    }
  }
  return result as Partial<MeportCommunication>;
}

function buildAIPreferences(explicit: Record<string, DimensionValue>): Partial<MeportAIPreferences> {
  const result: Record<string, string> = {};
  const fields: [string, string, string[]][] = [
    ["ai.relationship_model", "relationshipModel", ["tool", "collaborator", "mentor", "peer", "coach", "assistant"]],
    ["ai.proactivity", "proactivity", ["reactive", "balanced", "proactive", "autonomous"]],
    ["ai.correction_style", "correctionStyle", ["direct", "explain_then_correct", "ask_first", "suggest"]],
    ["ai.memory_preference", "memoryScope", ["minimal", "session", "essential", "comprehensive"]],
    ["ai.explanation_depth", "explanationDepth", ["surface", "practical", "thorough", "deep"]],
  ];
  for (const [dimKey, fieldKey, valid] of fields) {
    const raw = getExplicitValue(explicit, dimKey);
    if (raw) {
      const normalized = normalizeEnum(raw, valid);
      if (normalized) result[fieldKey] = normalized;
    }
  }
  return result as Partial<MeportAIPreferences>;
}

function buildCognitive(explicit: Record<string, DimensionValue>): Partial<MeportCognitive> {
  const result: Record<string, string> = {};
  const fields: [string, string, string[]][] = [
    ["cognitive.thinking_style", "thinkingStyle", ["analytical", "creative", "practical", "systematic", "holistic"]],
    ["cognitive.learning_style", "learningMode", ["visual", "textual", "hands_on", "conceptual", "example_based"]],
    ["cognitive.decision_style", "decisionPattern", ["data_driven", "intuitive", "consultative", "rapid", "deliberate"]],
    ["cognitive.abstraction_preference", "abstractionLevel", ["concrete", "balanced", "abstract"]],
  ];
  for (const [dimKey, fieldKey, valid] of fields) {
    const raw = getExplicitValue(explicit, dimKey);
    if (raw) {
      const normalized = normalizeEnum(raw, valid);
      if (normalized) result[fieldKey] = normalized;
    }
  }
  const mentalModel = getExplicitValue(explicit, "cognitive.mental_model");
  if (mentalModel) result.mentalModel = mentalModel;
  return result as Partial<MeportCognitive>;
}

function buildWork(explicit: Record<string, DimensionValue>): Partial<MeportWork> {
  const result: Record<string, string> = {};
  const fields: [string, string, string[]][] = [
    ["work.energy_archetype", "energyPattern", ["steady", "burst", "nocturnal", "early_bird", "variable"]],
    ["work.task_granularity", "taskSize", ["micro", "small", "medium", "large", "epic"]],
    ["work.deadline_behavior", "deadlineStyle", ["early", "steady", "pressure_driven", "last_minute"]],
    ["work.collaboration", "collaboration", ["solo", "pair", "small_team", "flexible"]],
    ["work.context_switching", "contextSwitching", ["avoid", "tolerate", "embrace"]],
  ];
  for (const [dimKey, fieldKey, valid] of fields) {
    const raw = getExplicitValue(explicit, dimKey);
    if (raw) {
      const normalized = normalizeEnum(raw, valid);
      if (normalized) result[fieldKey] = normalized;
    }
  }
  const peakHours = getExplicitValue(explicit, "work.peak_hours");
  if (peakHours) result.peakHours = peakHours;
  return result as Partial<MeportWork>;
}

function buildPersonality(explicit: Record<string, DimensionValue>): Partial<MeportPersonality> {
  const result: Record<string, string> = {};
  const fields: [string, string, string[]][] = [
    ["personality.core_motivation", "motivation", ["freedom", "achievement", "connection", "mastery", "impact", "security"]],
    ["personality.stress_response", "stressResponse", ["withdraw", "push_through", "seek_help", "distract", "analyze"]],
    ["personality.perfectionism", "perfectionism", ["low", "moderate", "high", "situational"]],
    ["personality.risk_tolerance", "riskTolerance", ["averse", "cautious", "moderate", "high", "thrill_seeking"]],
  ];
  for (const [dimKey, fieldKey, valid] of fields) {
    const raw = getExplicitValue(explicit, dimKey);
    if (raw) {
      const normalized = normalizeEnum(raw, valid);
      if (normalized) result[fieldKey] = normalized;
    }
  }
  return result as Partial<MeportPersonality>;
}

function buildNeurodivergent(explicit: Record<string, DimensionValue>): Partial<MeportNeurodivergent> {
  const result: Partial<MeportNeurodivergent> = {};
  const adaptations = getExplicitValue(explicit, "neurodivergent.adhd_adaptations");
  if (adaptations) result.adaptations = adaptations.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const timePerception = getExplicitValue(explicit, "neurodivergent.time_perception");
  if (timePerception) {
    const normalized = normalizeEnum(timePerception, ["accurate", "variable", "poor"]);
    if (normalized) result.timeAwareness = normalized as "accurate" | "variable" | "poor";
  }
  const hyperfocus = getExplicitValue(explicit, "neurodivergent.hyperfocus");
  if (hyperfocus) {
    const normalized = normalizeEnum(hyperfocus, ["rare", "occasional", "frequent"]);
    if (normalized) result.hyperfocus = normalized as "rare" | "occasional" | "frequent";
  }
  return result;
}

function buildExpertise(explicit: Record<string, DimensionValue>): Partial<MeportExpertise> {
  const result: Partial<MeportExpertise> = {};
  const techStack = getExplicitValue(explicit, "expertise.tech_stack");
  if (techStack) result.techStack = techStack.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const industries = getExplicitValue(explicit, "expertise.industries");
  if (industries) result.industries = industries.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const domains = getExplicitValue(explicit, "expertise.secondary_domains");
  if (domains) result.domains = domains.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return result;
}

function buildLifeContext(explicit: Record<string, DimensionValue>): Partial<MeportLifeContext> {
  const result: Partial<MeportLifeContext> = {};
  const stage = getExplicitValue(explicit, "life.life_stage");
  if (stage) {
    const normalized = normalizeEnum(stage, ["student", "early_career", "mid_career", "senior", "founder", "retired", "transitioning"]);
    if (normalized) result.stage = normalized as MeportLifeContext["stage"];
  }
  const priorities = getExplicitValue(explicit, "life.priorities");
  if (priorities) result.priorities = priorities.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const constraints = getExplicitValue(explicit, "life.financial_context");
  if (constraints) result.constraints = [constraints];
  return result;
}

function buildFinancial(explicit: Record<string, DimensionValue>): Partial<MeportFinancial> {
  const result: Partial<MeportFinancial> = {};
  const context = getExplicitValue(explicit, "life.financial_context");
  if (context) {
    const lower = context.toLowerCase();
    if (lower.includes("scarcity") || lower.includes("zero") || lower.includes("~0") || lower.includes("brak")) {
      result.mindset = "scarcity";
      result.priceSensitivity = "high";
    } else if (lower.includes("cautious") || lower.includes("tight") || lower.includes("limited")) {
      result.mindset = "cautious";
      result.priceSensitivity = "high";
    } else if (lower.includes("comfortable") || lower.includes("stable")) {
      result.mindset = "balanced";
      result.priceSensitivity = "medium";
    }
    result._meta = { sensitive: true, defaultScope: "private" };
  }
  return result;
}

function buildGoals(explicit: Record<string, DimensionValue>): string[] | undefined {
  const priorities = getExplicitValue(explicit, "life.priorities");
  if (!priorities) return undefined;
  return priorities.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

function buildAntiGoals(explicit: Record<string, DimensionValue>): string[] | undefined {
  const antiGoals = getExplicitValue(explicit, "life.anti_goals");
  if (!antiGoals) return undefined;
  return antiGoals.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

/** Classify instruction type from its text content */
function classifyInstructionType(rule: string): MeportInstruction["type"] {
  const lower = rule.toLowerCase();
  if (lower.includes("language") || lower.includes("polish") || lower.includes("english") || lower.includes("respond in")) return "language";
  if (lower.includes("format") || lower.includes("emoji") || lower.includes("lines per") || lower.includes("bullet") || lower.includes("structured")) return "format";
  if (lower.includes("decide") || lower.includes("pick for") || lower.includes("choose")) return "decision";
  if (lower.includes("never") || lower.includes("don't") || lower.includes("avoid") || lower.includes("safe")) return "safety";
  if (lower.includes("workflow") || lower.includes("task") || lower.includes("energy") || lower.includes("schedule")) return "workflow";
  return "behavior";
}

function buildInstructionsAndNever(explicit: Record<string, DimensionValue>): { instructions: MeportInstruction[]; never: MeportNeverRule[] } {
  const instructions: MeportInstruction[] = [];
  const never: MeportNeverRule[] = [];

  for (const [key, dim] of Object.entries(explicit)) {
    if (key.startsWith("_ai_rule_")) {
      const value = typeof dim.value === "string" ? dim.value : String(dim.value);
      if (value.length === 0 || value.length >= 500) continue;

      const lower = value.toLowerCase();
      // Separate NEVER rules from instructions
      if (lower.startsWith("never:") || lower.startsWith("never ") || lower.startsWith("nigdy")) {
        const cleanRule = value.replace(/^(never:|never\s+|nigdy\s*:?\s*)/i, "").trim();
        never.push({
          rule: cleanRule || value,
          priority: "high",
        });
      } else {
        instructions.push({
          rule: value,
          type: classifyInstructionType(value),
          context: "always",
          priority: 5,
        });
      }
    }
  }
  return { instructions, never };
}

function buildIntelligence(v1: PersonaProfile): MeportIntelligence | undefined {
  const intel: MeportIntelligence = {};
  let hasData = false;

  // Inferred values
  if (Object.keys(v1.inferred).length > 0) {
    intel.inferred = Object.values(v1.inferred).map((iv): MeportInferredValue => ({
      dimension: iv.dimension,
      value: iv.value,
      confidence: iv.confidence,
      source: iv.source === "behavioral" ? "behavioral" : "pattern",
    }));
    hasData = true;
  }

  // Compound values
  if (Object.keys(v1.compound).length > 0) {
    intel.compounds = Object.values(v1.compound).map((cv): MeportCompoundValue => ({
      dimension: cv.dimension,
      value: cv.value,
      confidence: cv.confidence,
      inputs: cv.inputs,
      exportInstruction: cv.export_instruction,
    }));
    hasData = true;
  }

  // Contradictions
  if (v1.contradictions.length > 0) {
    intel.contradictions = v1.contradictions.map((c): MeportContradiction => ({
      dimensions: c.dimensions,
      description: c.description,
      resolution: c.resolution === "flag_for_reveal" ? "context_dependent" : c.resolution,
      note: c.note,
    }));
    hasData = true;
  }

  // Emergent observations
  if (v1.emergent.length > 0) {
    intel.emergent = v1.emergent
      .filter((e) => e.status !== "removed")
      .map((e): MeportEmergentObservation => ({
        id: e.observation_id,
        category: e.category === "compound_signal" || e.category === "contradiction" ? "insight" : e.category,
        title: e.title,
        observation: e.observation,
        evidence: e.evidence,
        confidence: e.confidence,
        status: e.status === "pending_review" ? "pending" : e.status as "accepted" | "edited" | "rejected",
        userEdit: e.user_edit,
      }));
    hasData = true;
  }

  // Synthesis
  if (v1.synthesis) {
    intel.synthesis = convertSynthesis(v1.synthesis);
    hasData = true;
  }

  return hasData ? intel : undefined;
}

function convertSynthesis(s: ProfileSynthesis): MeportSynthesis {
  return {
    narrative: s.narrative,
    archetype: s.archetype,
    archetypeDescription: s.archetypeDescription,
    cognitiveProfile: s.cognitiveProfile,
    communicationDNA: s.communicationDNA,
    contradictions: s.contradictions,
    predictions: s.predictions,
    strengths: s.strengths,
    blindSpots: s.blindSpots,
  };
}
