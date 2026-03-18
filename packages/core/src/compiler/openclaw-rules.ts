/**
 * OpenClaw SOUL.md Compiler
 *
 * OpenClaw is an open-source AI agent platform that reads SOUL.md for
 * personality customization. This compiler generates a SOUL.md file that
 * describes the user in first-person, blunt, specific terms — NOT generic
 * AI instructions.
 *
 * Format: SOUL.md in project root or ~/.openclaw/SOUL.md
 * Target: 50-150 lines, 4000 chars max.
 *
 * compileBundle() returns all three files: SOUL.md + AGENTS.md + IDENTITY.md
 */

import { BaseCompiler } from "./base.js";
import type {
  PersonaProfile,
  ExportResult,
  ExportCompilerConfig,
} from "../schema/types.js";
import {
  collectRules,
  getExplicitValue,
  truncateAtWordBoundary,
  type RuleCompilerConfig,
  type ExportRule,
} from "./rules.js";

export interface OpenClawBundleResult {
  soul: { filename: "SOUL.md"; content: string };
  agents: { filename: "AGENTS.md"; content: string };
  identity: { filename: "IDENTITY.md"; content: string };
}

export class OpenClawRuleCompiler extends BaseCompiler {
  readonly config: ExportCompilerConfig = {
    platform: "OpenClaw",
    format: "markdown",
    charLimit: 4000,
    tokenLimit: null,
    priority: "P2",
  };

  private packExportRules?: Map<string, string[]>;

  setPackExportRules(rules: Map<string, string[]>): void {
    this.packExportRules = rules;
  }

  /** Primary output: SOUL.md (backwards compatible). */
  compile(profile: PersonaProfile): ExportResult {
    const rules = collectRules(profile, this.packExportRules);
    const ruleConfig = this.getRuleConfig();
    const content = formatForOpenClaw(profile, rules, ruleConfig);

    const ruleCount = content
      .split("\n")
      .filter((l) => l.startsWith("- ")).length;

    return this.buildResult(
      content,
      "SOUL.md",
      "Place SOUL.md in your project root or at ~/.openclaw/SOUL.md. OpenClaw loads it automatically.",
      this.collectDimensions(profile, 0.5),
      ruleCount
    );
  }

  /** Shared rule config for both compile() and compileBundle() */
  private getRuleConfig(): RuleCompilerConfig {
    return {
      maxRules: 15,
      maxChars: 4000,
      includeSensitive: false,
      includeContext: true,
      platform: "openclaw",
    };
  }

  /** Full bundle: SOUL.md + AGENTS.md + IDENTITY.md */
  compileBundle(profile: PersonaProfile): OpenClawBundleResult {
    const rules = collectRules(profile, this.packExportRules);
    const ruleConfig = this.getRuleConfig();

    return {
      soul: {
        filename: "SOUL.md",
        content: formatForOpenClaw(profile, rules, ruleConfig),
      },
      agents: {
        filename: "AGENTS.md",
        content: formatOpenClawAgentsMd(profile, rules, ruleConfig),
      },
      identity: {
        filename: "IDENTITY.md",
        content: formatOpenClawIdentityMd(profile),
      },
    };
  }
}

/**
 * Generate SOUL.md content for OpenClaw.
 *
 * Key principles:
 * - First person for user context ("I work as...", "I hate when...")
 * - Blunt and specific — NOT "be conversational", but "You speak casually. You find corporate jargon annoying."
 * - Include 2-3 example exchanges inline (from example rules)
 * - Keep it 50-150 lines
 */
export function formatForOpenClaw(
  profile: PersonaProfile,
  rules: ExportRule[],
  config: RuleCompilerConfig
): string {
  const name = getExplicitValue(profile, "identity.preferred_name") ?? "User";
  const sections: string[] = [];

  // ── # Identity ───────────────────────────────────────────────
  const occupation = getExplicitValue(profile, "context.occupation");
  const techStack = getExplicitValue(profile, "expertise.tech_stack");
  const lifeStage = getExplicitValue(profile, "context.life_stage");
  const selfDesc = getExplicitValue(profile, "identity.self_description");
  const vision = getExplicitValue(profile, "identity.vision");

  const identityLines: string[] = [];
  identityLines.push(`You are talking to ${name}.`);

  if (occupation) identityLines.push(`I work as ${occupation}.`);
  if (lifeStage === "founder" || lifeStage === "business_owner" || lifeStage === "freelancer" || occupation?.toLowerCase().includes("founder")) {
    identityLines.push("I'm building my own thing — every decision costs my time and money.");
  }
  if (techStack) identityLines.push(`My tech stack: ${techStack}.`);
  if (selfDesc) identityLines.push(selfDesc);
  if (vision) identityLines.push(`What I'm working toward: ${vision}.`);

  sections.push("# Identity\n");
  sections.push(identityLines.join(" "));

  // ── # Communication Style ────────────────────────────────────
  const commRules = rules.filter(
    (r) =>
      r.dimension.startsWith("communication.") ||
      r.dimension.startsWith("observed.") ||
      r.source === "anti_pattern"
  );

  // Split: positive style rules vs anti-patterns
  const styleRules = commRules.filter((r) => r.source !== "anti_pattern");
  const antiRules = commRules.filter((r) => r.source === "anti_pattern");

  // Example rules go in Communication Style as inline exchanges
  const exampleRules = rules.filter((r) => r.dimension.startsWith("example."));

  if (styleRules.length > 0 || exampleRules.length > 0) {
    sections.push("\n# Communication Style\n");
    for (const r of styleRules.slice(0, config.maxRules)) {
      sections.push(`- ${r.rule}`);
    }
    // Inline example exchanges — max 3
    if (exampleRules.length > 0) {
      sections.push("");
      for (const r of exampleRules.slice(0, 3)) {
        sections.push(r.rule);
      }
    }
  }

  // ── # Values ─────────────────────────────────────────────────
  const valueRules = rules.filter(
    (r) =>
      r.source === "compound" &&
      (r.dimension.includes("autonomy") ||
        r.dimension.includes("directness") ||
        r.dimension.includes("power_user") ||
        r.dimension.includes("free_spirit"))
  );

  const expertiseLevel =
    getExplicitValue(profile, "expertise.primary_depth") ??
    getExplicitValue(profile, "expertise.level") ??
    getExplicitValue(profile, "work.expertise_level");

  if (valueRules.length > 0 || expertiseLevel) {
    sections.push("\n# Values\n");
    if (expertiseLevel) {
      const isExpert = ["4", "5", "6", "expert", "senior", "authority"].includes(
        expertiseLevel
      );
      if (isExpert) {
        sections.push("- I value speed and signal density over hand-holding.");
        sections.push("- Skip the preamble. Get to the answer.");
      } else {
        sections.push("- I appreciate clarity but not condescension.");
      }
    }
    for (const r of valueRules.slice(0, 4)) {
      sections.push(`- ${r.rule}`);
    }
  }

  // ── # Boundaries ─────────────────────────────────────────────
  if (antiRules.length > 0) {
    sections.push("\n# Boundaries\n");
    for (const r of antiRules.slice(0, 6)) {
      // Reframe as "never do X" if not already framed that way
      const text = r.rule;
      sections.push(`- ${text}`);
    }
  }

  // Sensitive topics — skip (includeSensitive = false)
  const lang = getExplicitValue(profile, "identity.language");
  if (lang && lang !== "en") {
    sections.push(`- Default to ${lang}. Only switch to English if I write in English.`);
  }

  // ── # How I Work ─────────────────────────────────────────────
  const workRules = rules.filter(
    (r) =>
      r.source === "compound" &&
      (r.dimension.includes("adhd_pattern") ||
        r.dimension.includes("cognitive_style") ||
        r.dimension.includes("work_rhythm") ||
        r.dimension.includes("anxiety_pattern"))
  );

  const workMode = getExplicitValue(profile, "expertise.work_mode");
  const energyArchetype = getExplicitValue(profile, "work.energy_archetype");
  const currentFocus = getExplicitValue(profile, "context.current_focus");

  if (workRules.length > 0 || workMode || energyArchetype) {
    sections.push("\n# How I Work\n");
    if (workMode) sections.push(`- Work mode: ${workMode}.`);
    if (energyArchetype) sections.push(`- Energy pattern: ${energyArchetype}.`);
    for (const r of workRules.slice(0, 4)) {
      sections.push(`- ${r.rule}`);
    }
  }

  // ── # Context ────────────────────────────────────────────────
  const hasBusinessContext =
    lifeStage === "founder" ||
    (occupation !== undefined &&
      ["founder", "freelance", "independent", "consultant"].some((kw) =>
        occupation.toLowerCase().includes(kw)
      ));

  const contextLines: string[] = [];
  if (hasBusinessContext) {
    contextLines.push(
      "I run my own business. Recommendations affect my time and money directly."
    );
    contextLines.push("Give me actionable steps, not frameworks that need a team to execute.");
  }

  if (techStack) {
    contextLines.push(`Tech I work with: ${techStack}.`);
  }

  if (currentFocus) {
    contextLines.push(`Current focus: ${currentFocus}.`);
  }

  const industries = getExplicitValue(profile, "expertise.industries");
  if (industries) {
    contextLines.push(`Industry context: ${industries}.`);
  }

  if (contextLines.length > 0) {
    sections.push("\n# Context\n");
    for (const line of contextLines) {
      sections.push(`- ${line}`);
    }
  }

  sections.push("\n---\n*Generated by meport — portable AI profile*");

  // Enforce char limit
  let output = sections.join("\n");
  if (output.length > config.maxChars) {
    // Drop lowest-value sections first: Context > How I Work > Values > Boundaries > Communication > Identity
    const dropOrder = [
      "\n# Context\n",
      "\n# How I Work\n",
      "\n# Values\n",
      "\n# Boundaries\n",
      "\n# Communication Style\n",
    ];

    for (const sectionHeader of dropOrder) {
      if (output.length <= config.maxChars) break;
      const idx = output.indexOf(sectionHeader);
      if (idx === -1) continue;
      const nextSection = output.indexOf("\n# ", idx + sectionHeader.length);
      if (nextSection === -1) {
        output = output.slice(0, idx).trimEnd();
      } else {
        output = output.slice(0, idx) + output.slice(nextSection);
      }
    }

    // Word-boundary truncate as last resort
    if (output.length > config.maxChars) {
      output = truncateAtWordBoundary(output, config.maxChars);
    }
  }

  return output;
}

/**
 * Generate AGENTS.md for OpenClaw.
 *
 * Describes the AI's role, behavioral guidelines, capabilities, and
 * constraints in instruction-first format (second-person "You are...").
 */
export function formatOpenClawAgentsMd(
  profile: PersonaProfile,
  rules: ExportRule[],
  config: RuleCompilerConfig
): string {
  const name = getExplicitValue(profile, "identity.preferred_name") ?? "User";
  const occupation = getExplicitValue(profile, "context.occupation");
  const language = getExplicitValue(profile, "identity.language") ?? "English";
  const techStack = getExplicitValue(profile, "expertise.tech_stack");
  const industries = getExplicitValue(profile, "expertise.industries");
  const sections: string[] = [];

  // ── ## Role ───────────────────────────────────────────────
  sections.push("# Agent Configuration\n");
  sections.push("## Role\n");
  const roleLines: string[] = [];
  roleLines.push(`You are a personal AI assistant for ${name}.`);
  if (occupation) {
    roleLines.push(`${name} works as ${occupation}.`);
  }
  sections.push(roleLines.join("\n"));

  // ── ## Behavior Guidelines ────────────────────────────────
  // Pick the top positive (non-anti-pattern) rules by weight, max 10
  // (AGENTS.md is the behavior file — more rules than SOUL.md's 7 is appropriate)
  const behaviorRules = rules
    .filter((r) => r.source !== "anti_pattern")
    .slice(0, 10);

  if (behaviorRules.length > 0) {
    sections.push("\n## Behavior Guidelines\n");
    behaviorRules.forEach((r, i) => {
      sections.push(`${i + 1}. ${r.rule}`);
    });
  }

  // ── ## Capabilities ───────────────────────────────────────
  sections.push("\n## Capabilities\n");
  const capabilities: string[] = [];
  capabilities.push(`- Respond in ${language}`);
  if (techStack) {
    capabilities.push(`- Technical assistance with: ${techStack}`);
  }
  if (industries) {
    capabilities.push(`- Domain knowledge in: ${industries}`);
  }
  if (occupation) {
    const occ = occupation.toLowerCase();
    if (occ.includes("developer") || occ.includes("engineer") || occ.includes("cto")) {
      capabilities.push("- Code review, architecture decisions, debugging");
    }
    if (occ.includes("founder") || occ.includes("freelance") || occ.includes("consultant")) {
      capabilities.push("- Business strategy, client communication, decision-making");
    }
    if (occ.includes("designer")) {
      capabilities.push("- Design critique, UX feedback, visual direction");
    }
  }
  for (const cap of capabilities) {
    sections.push(cap);
  }

  // ── ## Constraints ────────────────────────────────────────
  const antiRules = rules.filter((r) => r.source === "anti_pattern").slice(0, 6);
  if (antiRules.length > 0) {
    sections.push("\n## Constraints\n");
    for (const r of antiRules) {
      sections.push(`- ${r.rule}`);
    }
  }

  sections.push("\n---\n*Generated by meport — portable AI profile*");

  // Enforce char limit
  let output = sections.join("\n");
  if (output.length > config.maxChars) {
    output = truncateAtWordBoundary(output, config.maxChars);
  }
  return output;
}

/**
 * Generate IDENTITY.md for OpenClaw.
 *
 * Compact metadata file: name, language, occupation, expertise, location,
 * communication style — one field per line in YAML-like format.
 */
export function formatOpenClawIdentityMd(profile: PersonaProfile): string {
  const name = getExplicitValue(profile, "identity.preferred_name") ?? "User";
  const language = getExplicitValue(profile, "identity.language") ?? "en";
  const occupation = getExplicitValue(profile, "context.occupation");
  const expertiseLevel =
    getExplicitValue(profile, "expertise.primary_depth") ??
    getExplicitValue(profile, "expertise.level") ??
    getExplicitValue(profile, "work.expertise_level");
  const location = getExplicitValue(profile, "context.location");

  // Build style keywords from communication dimensions
  const styleKeywords: string[] = [];
  const directness = getExplicitValue(profile, "communication.directness");
  const verbosity = getExplicitValue(profile, "communication.verbosity_preference");
  const format = getExplicitValue(profile, "communication.format_preference");
  if (directness) styleKeywords.push(directness);
  if (verbosity) styleKeywords.push(verbosity);
  if (format) styleKeywords.push(format);

  const lines: string[] = [];
  lines.push("# Identity\n");
  lines.push(`name: ${name}`);
  lines.push(`language: ${language}`);
  lines.push(`occupation: ${occupation ?? "not specified"}`);
  if (expertiseLevel) lines.push(`expertise: ${expertiseLevel}`);
  if (location) lines.push(`location: ${location}`);
  if (styleKeywords.length > 0) {
    lines.push(`style: ${styleKeywords.join(", ")}`);
  }

  lines.push("\n---\n*Generated by meport — portable AI profile*");
  return lines.join("\n");
}

