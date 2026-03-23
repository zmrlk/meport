/**
 * Meport Markdown → JSON Converter
 *
 * Converts a parsed .meport.md into a .meport.json (standard v1.0).
 * Maps reserved section names to structured JSON fields.
 */

import type { ParsedProfile } from "./md-parser";
import type { MeportProfile } from "./standard";
import { computeLevel } from "./standard";
import { v4 as uuid } from "uuid";

/**
 * Convert a parsed Markdown profile to Meport JSON standard.
 */
export function mdToJson(parsed: ParsedProfile): MeportProfile {
  const now = new Date().toISOString();

  const profile: MeportProfile = {
    $schema: "https://meport.app/schema/v1.json",
    "@context": "https://meport.app/context/v1",
    "@type": "MeportProfile",
    version: "1.0",
    id: uuid(),
    profileType: "personal",
    created: now,
    updated: now,
    level: 0,
    completeness: 0,
    identity: {
      name: parsed.name || field(parsed, "Identity", "Name") || "Unknown",
      language: field(parsed, "Identity", "Language") || "en",
      preferredName: field(parsed, "Identity", "Preferred name"),
      timezone: field(parsed, "Identity", "Timezone"),
      location: field(parsed, "Identity", "Location"),
      pronouns: field(parsed, "Identity", "Pronouns"),
    },
    provenance: {
      source: "meport",
      method: "self_report",
      toolVersion: parsed.schema || "1.0",
      lastVerified: now,
    },
  };

  // Communication
  const comm = parsed.sections["Communication"];
  if (comm) {
    profile.communication = {
      directness: normalizeEnum(comm.fields["Directness"], ["very_direct", "direct", "balanced", "indirect", "very_indirect"]) as any,
      verbosity: normalizeEnum(comm.fields["Verbosity"], ["minimal", "concise", "balanced", "detailed", "comprehensive"]) as any,
      formality: normalizeEnum(comm.fields["Formality"], ["casual", "semiformal", "formal", "adaptive"]) as any,
      feedbackStyle: normalizeEnum(comm.fields["Feedback"], ["blunt", "direct", "constructive", "gentle"]) as any,
      formatPreference: normalizeEnum(comm.fields["Format"], ["prose", "bullets", "structured", "code_first", "mixed"]) as any,
      humor: normalizeEnum(comm.fields["Humor"], ["none", "occasional", "frequent", "dry", "playful"]) as any,
    };
    removeUndefined(profile.communication as any);
  }

  // AI Preferences
  const ai = parsed.sections["AI Preferences"];
  if (ai) {
    profile.aiPreferences = {
      relationshipModel: normalizeEnum(ai.fields["Relationship"], ["tool", "collaborator", "mentor", "peer", "coach", "assistant"]) as any,
      proactivity: normalizeEnum(ai.fields["Proactivity"], ["reactive", "balanced", "proactive", "autonomous"]) as any,
      correctionStyle: normalizeEnum(ai.fields["Corrections"], ["direct", "explain_then_correct", "ask_first", "suggest"]) as any,
    };
    removeUndefined(profile.aiPreferences as any);
  }

  // Work & Energy
  const work = parsed.sections["Work & Energy"];
  if (work) {
    profile.work = {
      energyPattern: normalizeEnum(work.fields["Energy"], ["steady", "burst", "nocturnal", "early_bird", "variable"]) as any,
      peakHours: work.fields["Peak hours"],
      taskSize: normalizeEnum(work.fields["Tasks"], ["micro", "small", "medium", "large", "epic"]) as any,
      deadlineStyle: normalizeEnum(work.fields["Deadline style"] || work.fields["Deadlines"], ["early", "steady", "pressure_driven", "last_minute"]) as any,
    };
    removeUndefined(profile.work as any);
  }

  // Personality
  const pers = parsed.sections["Personality"];
  if (pers) {
    profile.personality = {
      motivation: normalizeEnum(pers.fields["Motivation"], ["freedom", "achievement", "connection", "mastery", "impact", "security"]) as any,
      stressResponse: normalizeEnum(pers.fields["Stress"], ["withdraw", "push_through", "seek_help", "distract", "analyze"]) as any,
    };
    removeUndefined(profile.personality as any);
  }

  // Life Context
  const life = parsed.sections["Life Context"];
  if (life) {
    profile.lifeContext = {
      ...profile.lifeContext,
      constraints: life.items.length > 0 ? life.items : undefined,
    };
    removeUndefined(profile.lifeContext as any);
  }

  // Financial
  const fin = parsed.sections["Financial"];
  if (fin) {
    profile.financial = {
      priceSensitivity: normalizeEnum(fin.fields["Price sensitivity"], ["low", "medium", "high"]) as any,
      mindset: normalizeEnum(fin.fields["Mindset"], ["scarcity", "cautious", "balanced", "abundant"]) as any,
      _meta: { sensitive: true, defaultScope: "private" },
    };
    removeUndefined(profile.financial as any);
  }

  // Goals → separate array
  const goals = parsed.sections["Goals"];
  if (goals && goals.items.length > 0) {
    profile.goals = goals.items;
  }

  // Anti-Goals → separate array
  const antiGoals = parsed.sections["Anti-Goals"];
  if (antiGoals && antiGoals.items.length > 0) {
    profile.antiGoals = antiGoals.items;
  }

  // Instructions → structured array
  const instr = parsed.sections["Instructions"];
  if (instr && instr.items.length > 0) {
    profile.instructions = instr.items.map((item) => ({
      rule: item,
      context: "always" as const,
    }));
  }

  // Never → separate policy array
  const never = parsed.sections["Never"];
  if (never && never.items.length > 0) {
    profile.never = never.items.map((item) => ({
      rule: item,
      priority: "high" as const,
    }));
  }

  // Compute level and completeness
  profile.level = computeLevel(profile);
  const totalSections = Object.keys(parsed.sections).length;
  profile.completeness = Math.min(1, totalSections / 10);

  return profile;
}

// ─── Helpers ────────────────────────────────────────────

function field(parsed: ParsedProfile, section: string, key: string): string | undefined {
  return parsed.sections[section]?.fields[key];
}

function normalizeEnum(value: string | undefined, validValues: string[]): string | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase().replace(/[\s-]+/g, "_");
  for (const v of validValues) {
    if (lower.includes(v)) return v;
  }
  return undefined;
}

function removeUndefined(obj: Record<string, any>): void {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) delete obj[key];
  }
}
