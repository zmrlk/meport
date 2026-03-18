/**
 * Compiler Coverage Tests
 *
 * Tests all platform compilers and core utility functions
 * that were previously untested.
 */

import { describe, it, expect } from "vitest";
import type { PersonaProfile, DimensionValue } from "../schema/types.js";
import {
  collectRules,
  deduplicateAndFilter,
  formatWithContexts,
  type ExportRule,
  type RuleCompilerConfig,
} from "./rules.js";
import { GeminiRuleCompiler } from "./gemini-rules.js";
import { GrokRuleCompiler } from "./grok-rules.js";
import { PerplexityRuleCompiler } from "./perplexity-rules.js";
import { CopilotRuleCompiler } from "./copilot-rules.js";
import { WindsurfRuleCompiler } from "./windsurf-rules.js";
import { OpenClawRuleCompiler, formatForOpenClaw, formatOpenClawAgentsMd, formatOpenClawIdentityMd } from "./openclaw-rules.js";

// ─── Fixtures ────────────────────────────────────────────────

function dim(dimension: string, value: string | string[], qid = "q"): DimensionValue {
  return { dimension, value, confidence: 1.0, source: "explicit", question_id: qid };
}

function makeProfile(overrides: Partial<PersonaProfile> = {}): PersonaProfile {
  return {
    schema_version: "1.0",
    profile_type: "personal",
    profile_id: "test-compilers",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    completeness: 70,
    explicit: {
      "identity.preferred_name": dim("identity.preferred_name", "TestUser"),
      "communication.verbosity_preference": dim("communication.verbosity_preference", "minimal"),
      "communication.anti_patterns": dim("communication.anti_patterns", ["no_emoji", "no_praise"]),
      "communication.directness": dim("communication.directness", "direct"),
      "expertise.tech_stack": dim("expertise.tech_stack", "TypeScript, React"),
      "expertise.level": dim("expertise.level", "senior"),
      "context.occupation": dim("context.occupation", "software engineer"),
      ...overrides.explicit,
    },
    inferred: overrides.inferred ?? {},
    compound: overrides.compound ?? {},
    contradictions: overrides.contradictions ?? [],
    emergent: overrides.emergent ?? [],
    meta: overrides.meta ?? {
      tiers_completed: [0, 1],
      tiers_skipped: [],
      total_questions_answered: 8,
      total_questions_skipped: 0,
      avg_response_time_ms: 3000,
      profiling_duration_ms: 120000,
      profiling_method: "interactive",
      layer3_available: false,
    },
  };
}

const packRules = new Map<string, string[]>([
  ["communication.verbosity_preference:minimal", ["Max 5 lines for simple questions. Go straight to the answer."]],
  ["communication.directness:direct", ["Give confident, direct answers. No hedging."]],
]);

// ─── Gemini Compiler ─────────────────────────────────────────

describe("GeminiRuleCompiler", () => {
  it("compiles to Gemini format with persona and rules sections", () => {
    const compiler = new GeminiRuleCompiler();
    compiler.setPackExportRules(packRules);
    const result = compiler.compile(makeProfile());

    expect(result.filename).toBe("gemini-gem-instructions.txt");
    expect(result.content).toContain("## Persona");
    expect(result.content).toContain("TestUser");
    expect(result.content).toContain("## Rules (follow strictly)");
    expect(result.content).toContain("1.");
  });

  it("stays within 4000 char limit", () => {
    const compiler = new GeminiRuleCompiler();
    compiler.setPackExportRules(packRules);
    const result = compiler.compile(makeProfile());

    expect(result.content.length).toBeLessThanOrEqual(4000);
  });

  it("includes tech stack and occupation", () => {
    const compiler = new GeminiRuleCompiler();
    const result = compiler.compile(makeProfile());

    expect(result.content).toContain("TypeScript, React");
    expect(result.content).toContain("software engineer");
  });
});

// ─── Grok Compiler ───────────────────────────────────────────

describe("GrokRuleCompiler", () => {
  it("compiles with name and RULES section", () => {
    const compiler = new GrokRuleCompiler();
    compiler.setPackExportRules(packRules);
    const result = compiler.compile(makeProfile());

    expect(result.filename).toBe("grok-instructions.txt");
    expect(result.content).toContain("My name is TestUser");
    expect(result.content).toContain("RULES:");
    expect(result.content).toMatch(/\d+\./);
  });

  it("stays within 4000 char limit", () => {
    const compiler = new GrokRuleCompiler();
    compiler.setPackExportRules(packRules);
    const result = compiler.compile(makeProfile());

    expect(result.content.length).toBeLessThanOrEqual(4000);
  });

  it("excludes sensitive rules", () => {
    const profile = makeProfile({
      explicit: {
        "health.fitness_level": dim("health.fitness_level", "beginner"),
      },
    });
    const compiler = new GrokRuleCompiler();
    const result = compiler.compile(profile);

    // Health rules are marked sensitive and should be excluded
    expect(result.content).not.toContain("fitness");
  });
});

// ─── Perplexity Compiler ─────────────────────────────────────

describe("PerplexityRuleCompiler", () => {
  it("compiles with search-focused format", () => {
    const compiler = new PerplexityRuleCompiler();
    compiler.setPackExportRules(packRules);
    const result = compiler.compile(makeProfile());

    expect(result.filename).toBe("perplexity-instructions.txt");
    expect(result.content).toContain("I'm TestUser");
    expect(result.content).toContain("When answering my questions:");
    expect(result.content).toMatch(/\d+\./);
  });

  it("stays within 3000 char limit", () => {
    const compiler = new PerplexityRuleCompiler();
    compiler.setPackExportRules(packRules);
    const result = compiler.compile(makeProfile());

    expect(result.content.length).toBeLessThanOrEqual(3000);
  });

  it("includes expertise level", () => {
    const compiler = new PerplexityRuleCompiler();
    const result = compiler.compile(makeProfile());

    expect(result.content).toContain("senior");
  });
});

// ─── Copilot Compiler ────────────────────────────────────────

describe("CopilotRuleCompiler", () => {
  it("compiles to copilot-instructions.md format", () => {
    const compiler = new CopilotRuleCompiler();
    compiler.setPackExportRules(packRules);
    const result = compiler.compile(makeProfile());

    expect(result.filename).toBe("copilot-instructions.md");
    expect(result.content).toContain("TestUser");
    expect(result.content).toContain("- ");
  });

  it("excludes lifestyle/health/finance dimensions", () => {
    const profile = makeProfile({
      explicit: {
        "lifestyle.travel_style": dim("lifestyle.travel_style", "spontaneous"),
        "finance.spending_style": dim("finance.spending_style", "impulsive"),
      },
    });
    const compiler = new CopilotRuleCompiler();
    compiler.setPackExportRules(new Map([
      ["lifestyle.travel_style:spontaneous", ["I'm a spontaneous traveler."]],
      ["finance.spending_style:impulsive", ["I spend impulsively."]],
    ]));
    const result = compiler.compile(profile);

    expect(result.content).not.toContain("traveler");
    expect(result.content).not.toContain("impulsive");
  });

  it("stays within 4000 char limit", () => {
    const compiler = new CopilotRuleCompiler();
    compiler.setPackExportRules(packRules);
    const result = compiler.compile(makeProfile());

    expect(result.content.length).toBeLessThanOrEqual(4000);
  });
});

// ─── Windsurf Compiler ───────────────────────────────────────

describe("WindsurfRuleCompiler", () => {
  it("compiles to .windsurfrules format", () => {
    const compiler = new WindsurfRuleCompiler();
    compiler.setPackExportRules(packRules);
    const result = compiler.compile(makeProfile());

    expect(result.filename).toBe(".windsurfrules");
    expect(result.content).toContain("# User Preferences");
    expect(result.content).toContain("- ");
  });

  it("stays within 6000 char limit", () => {
    const compiler = new WindsurfRuleCompiler();
    compiler.setPackExportRules(packRules);
    const result = compiler.compile(makeProfile());

    expect(result.content.length).toBeLessThanOrEqual(6000);
  });
});

// ─── OpenClaw Compiler ───────────────────────────────────────

describe("OpenClawRuleCompiler", () => {
  it("compiles SOUL.md format", () => {
    const compiler = new OpenClawRuleCompiler();
    compiler.setPackExportRules(packRules);
    const result = compiler.compile(makeProfile());

    expect(result.filename).toBe("SOUL.md");
    expect(result.content).toContain("TestUser");
    expect(result.content).toContain("# Identity");
  });

  it("compileBundle produces 3 files", () => {
    const compiler = new OpenClawRuleCompiler();
    compiler.setPackExportRules(packRules);
    const bundle = compiler.compileBundle(makeProfile());

    expect(bundle.soul).toBeDefined();
    expect(bundle.agents).toBeDefined();
    expect(bundle.identity).toBeDefined();
    expect(bundle.soul.content).toContain("# Identity");
    expect(bundle.agents.content).toContain("# Agent Configuration");
    expect(bundle.identity.content).toContain("# Identity");
  });
});

describe("formatForOpenClaw", () => {
  it("generates SOUL.md content", () => {
    const profile = makeProfile();
    const rules = collectRules(profile, packRules);
    const content = formatForOpenClaw(profile, rules, {
      maxRules: 15, maxChars: 8000, includeSensitive: false, includeContext: true, platform: "openclaw",
    });

    expect(content).toContain("# Identity");
    expect(content).toContain("TestUser");
    expect(content).toContain("# Communication Style");
  });
});

describe("formatOpenClawAgentsMd", () => {
  it("generates AGENTS.md content", () => {
    const profile = makeProfile();
    const rules = collectRules(profile, packRules);
    const content = formatOpenClawAgentsMd(profile, rules, {
      maxRules: 15, maxChars: 8000, includeSensitive: false, includeContext: true, platform: "openclaw",
    });

    expect(content).toContain("# Agent Configuration");
    expect(content).toContain("meport");
  });
});

describe("formatOpenClawIdentityMd", () => {
  it("generates IDENTITY.md content", () => {
    const profile = makeProfile();
    const content = formatOpenClawIdentityMd(profile);

    expect(content).toContain("# Identity");
    expect(content).toContain("TestUser");
  });
});

// ─── Core Functions ──────────────────────────────────────────

describe("deduplicateAndFilter", () => {
  it("removes near-duplicate rules (Jaccard >= 0.6)", () => {
    const rules: ExportRule[] = [
      { rule: "Never use emoji in responses.", source: "anti_pattern", dimension: "anti.emoji", weight: 9, confidence: 1.0 },
      { rule: "Never include emoji in your responses.", source: "anti_pattern", dimension: "anti.emoji2", weight: 8, confidence: 1.0 },
      { rule: "Be concise and direct.", source: "explicit", dimension: "comm.style", weight: 7, confidence: 1.0 },
    ];

    const result = deduplicateAndFilter(rules);
    // First emoji rule kept, second deduped
    expect(result.length).toBeLessThan(rules.length);
    expect(result[0].rule).toContain("Never use emoji");
  });

  it("keeps rules with different content", () => {
    const rules: ExportRule[] = [
      { rule: "Never use emoji in responses.", source: "anti_pattern", dimension: "anti.emoji", weight: 9, confidence: 1.0 },
      { rule: "Max 5 lines for simple questions. Go straight to the answer.", source: "explicit", dimension: "comm.verbosity", weight: 8, confidence: 1.0 },
      { rule: "IF I say 'quick' THEN respond in max 3 lines.", source: "conditional", dimension: "cond.quick", weight: 7, confidence: 1.0 },
    ];

    const result = deduplicateAndFilter(rules);
    expect(result.length).toBe(3);
  });

  it("removes generic rules", () => {
    const rules: ExportRule[] = [
      { rule: "Be helpful and friendly.", source: "explicit", dimension: "generic", weight: 5, confidence: 1.0 },
      { rule: "Never use emoji in responses.", source: "anti_pattern", dimension: "anti.emoji", weight: 9, confidence: 1.0 },
    ];

    const result = deduplicateAndFilter(rules);
    expect(result.length).toBe(1);
    expect(result[0].rule).toContain("emoji");
  });
});

describe("formatWithContexts", () => {
  it("generates multi-section output with tech contexts", () => {
    const profile = makeProfile();
    const rules = collectRules(profile, packRules);
    const config: RuleCompilerConfig = {
      maxRules: 15, maxChars: 4000, includeSensitive: false, includeContext: true, platform: "test",
    };

    const content = formatWithContexts(profile, rules, config);

    expect(content).toContain("TestUser");
    expect(content).toContain("## Always");
  });

  it("respects char budget", () => {
    const profile = makeProfile();
    const rules = collectRules(profile, packRules);
    const config: RuleCompilerConfig = {
      maxRules: 15, maxChars: 2000, includeSensitive: false, includeContext: true, platform: "test",
    };

    const content = formatWithContexts(profile, rules, config);
    expect(content.length).toBeLessThanOrEqual(2000);
  });
});

describe("collectRules source attribution", () => {
  it("tags conditional rules with source 'conditional'", () => {
    const profile = makeProfile();
    const rules = collectRules(profile, packRules);

    const conditional = rules.filter((r) => r.source === "conditional");
    expect(conditional.length).toBeGreaterThan(0);
    for (const r of conditional) {
      expect(r.dimension).toMatch(/^conditional\./);
    }
  });

  it("tags observed style rules with source 'observed'", () => {
    const profile = makeProfile({
      explicit: {
        "observed.message_style": dim("observed.message_style", "terse"),
      },
    });
    const rules = collectRules(profile);

    const observed = rules.filter((r) => r.source === "observed");
    expect(observed.length).toBeGreaterThan(0);
    for (const r of observed) {
      expect(r.dimension).toMatch(/^observed\./);
    }
  });

  it("tags example rules with source 'example'", () => {
    const profile = makeProfile();
    const rules = collectRules(profile, packRules);

    const examples = rules.filter((r) => r.source === "example");
    expect(examples.length).toBeGreaterThan(0);
    for (const r of examples) {
      expect(r.dimension).toMatch(/^example\./);
    }
  });
});
