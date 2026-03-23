/**
 * Meport JSON → Markdown Converter
 *
 * Converts a .meport.json (standard v1.0) into a .meport.md file.
 * Produces human-readable Markdown following the Meport Profile Standard.
 */

import type { MeportProfile } from "./standard";

export interface JsonToMdOptions {
  /** Include frontmatter (default: true) */
  frontmatter?: boolean;
  /** Include sharing section (default: false — privacy by default) */
  includeSharing?: boolean;
  /** Sections to exclude from output */
  excludeSections?: string[];
}

/**
 * Convert a MeportProfile JSON to .meport.md format.
 */
export function jsonToMd(profile: MeportProfile, options: JsonToMdOptions = {}): string {
  const { frontmatter = true, includeSharing = false, excludeSections = [] } = options;
  const lines: string[] = [];
  const skip = new Set(excludeSections);

  // Frontmatter
  if (frontmatter) {
    lines.push("---");
    lines.push("schema: meport/1.0");
    lines.push("---");
    lines.push("");
  }

  // H1 = Name
  lines.push(`# ${profile.identity.name}`);

  // Summary (generate from key fields)
  const summaryParts: string[] = [];
  if (profile.communication?.directness) summaryParts.push(denormalize(profile.communication.directness)!);
  if (profile.communication?.verbosity) summaryParts.push(denormalize(profile.communication.verbosity)!);
  if (profile.identity.language) summaryParts.push(profile.identity.language.toUpperCase());
  if (profile.lifeContext?.stage) summaryParts.push(denormalize(profile.lifeContext.stage)!);
  if (profile.neurodivergent?.traits?.length) summaryParts.push(profile.neurodivergent.traits.map((t) => t.toUpperCase()).join("+") + "-adapted");
  if (summaryParts.length > 0) {
    lines.push(`> ${summaryParts.join(". ")}.`);
  }
  lines.push("");

  // Identity
  if (!skip.has("identity")) {
    lines.push("## Identity");
    kv(lines, "Name", profile.identity.name);
    kv(lines, "Language", profile.identity.language);
    kv(lines, "Preferred name", profile.identity.preferredName);
    kv(lines, "Location", profile.identity.location);
    kv(lines, "Timezone", profile.identity.timezone);
    kv(lines, "Pronouns", profile.identity.pronouns);
    lines.push("");
  }

  // Communication
  if (profile.communication && !skip.has("communication")) {
    lines.push("## Communication");
    kv(lines, "Directness", denormalize(profile.communication.directness));
    kv(lines, "Verbosity", denormalize(profile.communication.verbosity));
    kv(lines, "Formality", denormalize(profile.communication.formality));
    kv(lines, "Feedback", denormalize(profile.communication.feedbackStyle));
    kv(lines, "Format", denormalize(profile.communication.formatPreference));
    kv(lines, "Humor", denormalize(profile.communication.humor));
    lines.push("");
  }

  // AI Preferences
  if (profile.aiPreferences && !skip.has("aiPreferences")) {
    lines.push("## AI Preferences");
    kv(lines, "Relationship", denormalize(profile.aiPreferences.relationshipModel));
    kv(lines, "Proactivity", denormalize(profile.aiPreferences.proactivity));
    kv(lines, "Corrections", denormalize(profile.aiPreferences.correctionStyle));
    kv(lines, "Memory scope", denormalize(profile.aiPreferences.memoryScope));
    kv(lines, "Explanation depth", denormalize(profile.aiPreferences.explanationDepth));
    lines.push("");
  }

  // Work & Energy
  if (profile.work && !skip.has("work")) {
    lines.push("## Work & Energy");
    kv(lines, "Energy", denormalize(profile.work.energyPattern));
    kv(lines, "Peak hours", profile.work.peakHours);
    kv(lines, "Tasks", denormalize(profile.work.taskSize));
    kv(lines, "Deadline style", denormalize(profile.work.deadlineStyle));
    kv(lines, "Collaboration", denormalize(profile.work.collaboration));
    kv(lines, "Context switching", denormalize(profile.work.contextSwitching));
    lines.push("");
  }

  // Personality
  if (profile.personality && !skip.has("personality")) {
    lines.push("## Personality");
    kv(lines, "Motivation", denormalize(profile.personality.motivation));
    kv(lines, "Stress", denormalize(profile.personality.stressResponse));
    kv(lines, "Perfectionism", denormalize(profile.personality.perfectionism));
    kv(lines, "Risk tolerance", denormalize(profile.personality.riskTolerance));
    kv(lines, "Ambiguity tolerance", denormalize(profile.personality.ambiguityTolerance));
    lines.push("");
  }

  // Cognitive
  if (profile.cognitive && !skip.has("cognitive")) {
    lines.push("## Cognitive");
    kv(lines, "Thinking style", denormalize(profile.cognitive.thinkingStyle));
    kv(lines, "Learning mode", denormalize(profile.cognitive.learningMode));
    kv(lines, "Decision pattern", denormalize(profile.cognitive.decisionPattern));
    kv(lines, "Abstraction level", denormalize(profile.cognitive.abstractionLevel));
    kv(lines, "Mental model", profile.cognitive.mentalModel);
    lines.push("");
  }

  // Neurodivergent
  if (profile.neurodivergent && !skip.has("neurodivergent")) {
    lines.push("## Neurodivergent");
    if (profile.neurodivergent.traits?.length) {
      kv(lines, "Traits", profile.neurodivergent.traits.join(", "));
    }
    kv(lines, "Time awareness", denormalize(profile.neurodivergent.timeAwareness));
    kv(lines, "Hyperfocus", denormalize(profile.neurodivergent.hyperfocus));
    if (profile.neurodivergent.adaptations?.length) {
      for (const a of profile.neurodivergent.adaptations) {
        lines.push(`- ${a}`);
      }
    }
    if (profile.neurodivergent.sensoryNotes?.length) {
      for (const s of profile.neurodivergent.sensoryNotes) {
        lines.push(`- Sensory: ${s}`);
      }
    }
    lines.push("");
  }

  // Expertise
  if (profile.expertise && !skip.has("expertise")) {
    lines.push("## Expertise");
    if (profile.expertise.domains?.length) {
      kv(lines, "Domains", profile.expertise.domains.join(", "));
    }
    if (profile.expertise.techStack?.length) {
      kv(lines, "Tech stack", profile.expertise.techStack.join(", "));
    }
    kv(lines, "Experience", profile.expertise.experienceYears != null ? `${profile.expertise.experienceYears} years` : undefined);
    if (profile.expertise.industries?.length) {
      kv(lines, "Industries", profile.expertise.industries.join(", "));
    }
    kv(lines, "Level", denormalize(profile.expertise.level));
    lines.push("");
  }

  // Life Context
  if (profile.lifeContext && !skip.has("lifeContext")) {
    lines.push("## Life Context");
    kv(lines, "Stage", denormalize(profile.lifeContext.stage));
    if (profile.lifeContext.priorities?.length) {
      for (const p of profile.lifeContext.priorities) {
        lines.push(`- ${p}`);
      }
    }
    if (profile.lifeContext.constraints?.length) {
      for (const c of profile.lifeContext.constraints) {
        lines.push(`- Constraint: ${c}`);
      }
    }
    lines.push("");
  }

  // Financial
  if (profile.financial && !skip.has("financial")) {
    lines.push("## Financial");
    kv(lines, "Mindset", denormalize(profile.financial.mindset));
    kv(lines, "Price sensitivity", denormalize(profile.financial.priceSensitivity));
    kv(lines, "Income stability", denormalize(profile.financial.incomeStability));
    kv(lines, "Stress level", denormalize(profile.financial.stressLevel));
    lines.push("");
  }

  // Goals
  if (profile.goals?.length && !skip.has("goals")) {
    lines.push("## Goals");
    for (const g of profile.goals) {
      lines.push(`- ${g}`);
    }
    lines.push("");
  }

  // Anti-Goals
  if (profile.antiGoals?.length && !skip.has("antiGoals")) {
    lines.push("## Anti-Goals");
    for (const a of profile.antiGoals) {
      lines.push(`- ${a}`);
    }
    lines.push("");
  }

  // Instructions
  if (profile.instructions?.length && !skip.has("instructions")) {
    lines.push("## Instructions");
    for (const i of profile.instructions) {
      lines.push(`- ${i.rule}`);
    }
    lines.push("");
  }

  // Never
  if (profile.never?.length && !skip.has("never")) {
    lines.push("## Never");
    for (const n of profile.never) {
      lines.push(`- ${n.rule}`);
    }
    lines.push("");
  }

  // Sharing (opt-in)
  if (includeSharing && profile.sharing && !skip.has("sharing")) {
    lines.push("## Sharing");
    if (profile.sharing.public?.length) {
      kv(lines, "Public", profile.sharing.public.join(", "));
    }
    if (profile.sharing.trusted?.length) {
      kv(lines, "Trusted", profile.sharing.trusted.join(", "));
    }
    if (profile.sharing.private?.length) {
      kv(lines, "Private", profile.sharing.private.join(", "));
    }
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ─── Helpers ────────────────────────────────────────────

/** Add a Key: Value line, skipping undefined values */
function kv(lines: string[], key: string, value: string | undefined): void {
  if (value) lines.push(`${key}: ${value}`);
}

/** Convert snake_case enum back to human-readable */
function denormalize(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/_/g, " ");
}
