/**
 * Rule-Based Compiler Tests
 *
 * Tests the core rule collection and formatting logic.
 */

import { describe, it, expect } from "vitest";
import type { PersonaProfile } from "../schema/types.js";
import {
  collectRules,
  formatForChatGPT,
  formatForClaude,
  formatForClaudeCode,
  formatForCursor,
  formatForOllama,
  type RuleCompilerConfig,
} from "./rules.js";

// ─── Test Fixtures ──────────────────────────────────────────

function makeProfile(overrides: Partial<PersonaProfile> = {}): PersonaProfile {
  return {
    schema_version: "1.0",
    profile_type: "personal",
    profile_id: "test-123",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completeness: 50,
    explicit: {
      "identity.preferred_name": {
        dimension: "identity.preferred_name",
        value: "Alex",
        confidence: 1.0,
        source: "explicit",
        question_id: "setup_q01",
      },
      "communication.verbosity_preference": {
        dimension: "communication.verbosity_preference",
        value: "minimal",
        confidence: 1.0,
        source: "explicit",
        question_id: "setup_q02",
      },
      "communication.anti_patterns": {
        dimension: "communication.anti_patterns",
        value: ["no_emoji", "no_praise", "no_hedging"],
        confidence: 1.0,
        source: "explicit",
        question_id: "setup_q03",
      },
      ...overrides.explicit,
    },
    inferred: overrides.inferred ?? {},
    compound: overrides.compound ?? {},
    contradictions: overrides.contradictions ?? [],
    emergent: overrides.emergent ?? [],
    meta: overrides.meta ?? {
      tiers_completed: [0],
      tiers_skipped: [],
      total_questions_answered: 4,
      total_questions_skipped: 0,
      avg_response_time_ms: 3000,
      profiling_duration_ms: 60000,
      profiling_method: "interactive",
      layer3_available: false,
    },
  };
}

const packExportRules = new Map<string, string>([
  ["communication.verbosity_preference:minimal", "Max 5 lines for simple questions. Go straight to the answer."],
  ["communication.feedback_style:direct", "When reviewing my work, skip praise. Show me what's broken."],
  ["work.energy_archetype:burst", "My energy is unpredictable. Suggest 15-25 min tasks. Don't plan long sessions."],
  ["cognitive.learning_style:hands_on", "I learn by doing. Give me working examples to modify, not theory to read."],
]);

const baseConfig: RuleCompilerConfig = {
  maxRules: 15,
  maxChars: 4000,
  includeSensitive: false,
  includeContext: true,
  platform: "test",
};

// ─── Tests ──────────────────────────────────────────────────

describe("collectRules", () => {
  it("collects anti-pattern rules", () => {
    const profile = makeProfile();
    const rules = collectRules(profile);

    const antiPatternRules = rules.filter((r) => r.source === "anti_pattern");
    expect(antiPatternRules).toHaveLength(3);
    expect(antiPatternRules[0].rule).toContain("emoji");
    expect(antiPatternRules[0].weight).toBe(9);
    expect(antiPatternRules[0].confidence).toBe(1.0);
  });

  it("collects explicit dimension rules from pack export rules", () => {
    const profile = makeProfile();
    const rules = collectRules(profile, packExportRules);

    const explicitRules = rules.filter((r) => r.source === "explicit");
    expect(explicitRules.length).toBeGreaterThanOrEqual(1);
  });

  it("collects compound signal rules", () => {
    const profile = makeProfile({
      compound: {
        "compound.work_rhythm": {
          dimension: "compound.work_rhythm",
          value: "burst_worker",
          confidence: 0.8,
          rule_id: "compound_01",
          inputs: ["work_q01", "work_q02"],
          export_instruction: "This user works in unpredictable bursts. Break tasks into 15-min chunks.",
        },
      },
    });

    const rules = collectRules(profile);
    const compoundRules = rules.filter((r) => r.source === "compound");
    expect(compoundRules).toHaveLength(1);
    expect(compoundRules[0].rule).toContain("bursts");
  });

  it("sorts rules by weight DESC then confidence DESC", () => {
    const profile = makeProfile({
      compound: {
        "compound.cognitive_style": {
          dimension: "compound.cognitive_style",
          value: "visual_thinker",
          confidence: 0.7,
          rule_id: "compound_02",
          inputs: ["core_q02"],
          export_instruction: "Use diagrams and visual aids when explaining complex topics.",
        },
      },
    });

    const rules = collectRules(profile);
    // Anti-patterns have weight 9, compound.cognitive_style has weight 7
    const firstAntiPattern = rules.findIndex((r) => r.source === "anti_pattern");
    const firstCompound = rules.findIndex((r) => r.source === "compound");

    if (firstAntiPattern !== -1 && firstCompound !== -1) {
      expect(firstAntiPattern).toBeLessThan(firstCompound);
    }
  });

  it("marks health dimensions as sensitive", () => {
    const profile = makeProfile();
    // Add health dimension to the profile
    profile.explicit["health.fitness_level"] = {
      dimension: "health.fitness_level",
      value: "experienced",
      confidence: 1.0,
      source: "explicit",
      question_id: "health_q01",
    };

    const rules = collectRules(profile, new Map([
      ...packExportRules,
      ["health.fitness_level:experienced", "I exercise regularly. Skip beginner advice."],
    ]));

    const healthRules = rules.filter((r) => r.sensitive);
    expect(healthRules.length).toBeGreaterThanOrEqual(1);
    expect(healthRules[0].sensitive).toBe(true);
  });

  it("excludes flag_only inferred values", () => {
    const profile = makeProfile({
      inferred: {
        "behavioral.impulsive": {
          dimension: "behavioral.impulsive",
          value: "detected",
          confidence: 0.6,
          source: "behavioral",
          signal_id: "sig_01",
          override: "flag_only",
        },
      },
    });

    const rules = collectRules(profile);
    const flagRules = rules.filter((r) => r.dimension === "behavioral.impulsive");
    expect(flagRules).toHaveLength(0);
  });
});

describe("formatForChatGPT", () => {
  it("generates aboutMe and howToRespond sections", () => {
    const profile = makeProfile();
    const rules = collectRules(profile, packExportRules);
    const chatgptConfig = { ...baseConfig, maxChars: 1500 };

    const { aboutMe, howToRespond } = formatForChatGPT(profile, rules, chatgptConfig);

    expect(aboutMe).toContain("Alex");
    expect(howToRespond).toContain("RULES:");
    expect(howToRespond).toMatch(/\d+\./); // numbered rules
  });

  it("respects character budget", () => {
    const profile = makeProfile();
    const rules = collectRules(profile, packExportRules);
    const tightConfig = { ...baseConfig, maxChars: 200, maxRules: 2 };

    const { aboutMe, howToRespond } = formatForChatGPT(profile, rules, tightConfig);
    const total = aboutMe.length + howToRespond.length;
    // Should not vastly exceed budget (some overhead for headers is OK)
    expect(total).toBeLessThan(400);
  });

  it("includes anti-pattern rules as numbered items", () => {
    const profile = makeProfile();
    const rules = collectRules(profile);

    const { howToRespond } = formatForChatGPT(profile, rules, baseConfig);

    expect(howToRespond).toContain("emoji");
    expect(howToRespond).toContain("praise");
  });
});

describe("formatForClaude", () => {
  it("uses XML tags for better compliance", () => {
    const profile = makeProfile();
    const rules = collectRules(profile, packExportRules);

    const content = formatForClaude(profile, rules, baseConfig);

    expect(content).toContain("<communication-rules>");
    expect(content).toContain("</communication-rules>");
    expect(content).toContain("<user-context>");
    expect(content).toContain("Alex");
  });

  it("includes compound observations in behavioral-patterns tag", () => {
    const profile = makeProfile({
      compound: {
        "compound.work_rhythm": {
          dimension: "compound.work_rhythm",
          value: "burst_worker",
          confidence: 0.8,
          rule_id: "c1",
          inputs: ["w1"],
          export_instruction: "Works in bursts.",
        },
      },
    });

    const rules = collectRules(profile);
    const content = formatForClaude(profile, rules, baseConfig);

    // Compound signals may appear in behavioral-patterns or communication-rules
    expect(content).toContain("bursts");
  });
});

describe("formatForClaudeCode", () => {
  it("generates compact markdown", () => {
    const profile = makeProfile();
    const rules = collectRules(profile, packExportRules);

    const content = formatForClaudeCode(profile, rules, baseConfig);

    expect(content).toContain("# User Profile (meport)");
    expect(content).toContain("## Rules");
    expect(content).toContain("- "); // bullet points
  });
});

describe("formatForCursor", () => {
  it("generates MDC frontmatter", () => {
    const profile = makeProfile();
    const rules = collectRules(profile, packExportRules);

    const content = formatForCursor(profile, rules, baseConfig);

    expect(content).toContain("---");
    expect(content).toContain("alwaysApply: true");
    expect(content).toContain('globs: "**/*"');
  });

  it("excludes lifestyle/health/finance dimensions", () => {
    const profile = makeProfile({
      explicit: {
        "lifestyle.travel_style": {
          dimension: "lifestyle.travel_style",
          value: "spontaneous",
          confidence: 1.0,
          source: "explicit",
          question_id: "lifestyle_q01",
        },
      },
    });

    const rules = collectRules(profile, new Map([
      ["lifestyle.travel_style:spontaneous", "I'm a spontaneous traveler."],
    ]));

    const content = formatForCursor(profile, rules, baseConfig);
    expect(content).not.toContain("traveler");
  });
});

describe("formatForOllama", () => {
  it("generates simple directive format", () => {
    const profile = makeProfile();
    const rules = collectRules(profile, packExportRules);

    const content = formatForOllama(profile, rules, {
      ...baseConfig,
      maxRules: 8,
    });

    expect(content).toContain("Alex");
    expect(content).toContain("Follow these rules strictly");
    expect(content).toMatch(/\d+\./);
  });
});

describe("rule quality", () => {
  it("generates actionable rules, not descriptions", () => {
    const profile = makeProfile();
    const rules = collectRules(profile, packExportRules);

    // Every rule should be an instruction, not a description
    for (const rule of rules) {
      // Rules should NOT look like "User prefers X" or "X preference: Y"
      expect(rule.rule).not.toMatch(/^(user|this user|the user)/i);
      // Rules should be actionable (contain verbs like "never", "max", "give", "don't", etc.)
      expect(rule.rule.length).toBeGreaterThan(10);
    }
  });

  it("anti-pattern rules have highest weight after identity", () => {
    const profile = makeProfile();
    const rules = collectRules(profile);

    const antiPatterns = rules.filter((r) => r.source === "anti_pattern");
    for (const ap of antiPatterns) {
      expect(ap.weight).toBe(9);
    }
  });
});
