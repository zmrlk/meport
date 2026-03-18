/**
 * Gemini Gems Rule-Based Compiler
 *
 * Format: Persona + Task + Context (Google's recommended structure)
 * Similar to ChatGPT but with Gem-specific framing.
 */

import { BaseCompiler } from "./base.js";
import type {
  PersonaProfile,
  ExportResult,
  ExportCompilerConfig,
} from "../schema/types.js";
import {
  collectRules,
  truncateAtWordBoundary,
  getExplicitValue,
  type RuleCompilerConfig,
  type ExportRule,
} from "./rules.js";

export class GeminiRuleCompiler extends BaseCompiler {
  readonly config: ExportCompilerConfig = {
    platform: "Gemini",
    format: "text",
    charLimit: 4000,
    tokenLimit: null,
    priority: "P0",
  };

  private packExportRules?: Map<string, string[]>;

  setPackExportRules(rules: Map<string, string[]>): void {
    this.packExportRules = rules;
  }

  compile(profile: PersonaProfile): ExportResult {
    const rules = collectRules(profile, this.packExportRules);

    const ruleConfig: RuleCompilerConfig = {
      maxRules: 15,
      maxChars: 3500,
      includeSensitive: false,
      includeContext: true,
      platform: "gemini",
    };

    const content = formatForGemini(profile, rules, ruleConfig);

    const ruleCount = content.split("\n").filter((l) => l.match(/^\d+\./)).length;

    return this.buildResult(
      content,
      "gemini-gem-instructions.txt",
      "Open Gemini → Gems → Create Gem → Paste these instructions.",
      this.collectDimensions(profile, 0.5),
      ruleCount
    );
  }
}

function formatForGemini(
  profile: PersonaProfile,
  rules: ExportRule[],
  config: RuleCompilerConfig
): string {
  const name = getExplicitValue(profile, "identity.preferred_name") ?? "User";
  const sections: string[] = [];

  // Persona section
  sections.push("## Persona");
  sections.push(`You are talking to ${name}.`);

  const occupation = getExplicitValue(profile, "context.occupation");
  if (occupation) sections.push(`They work as: ${occupation}.`);

  const useCase = getExplicitValue(profile, "primary_use_case");
  if (useCase) sections.push(`They use AI for: ${useCase}.`);

  const techStack = getExplicitValue(profile, "expertise.tech_stack");
  if (techStack) sections.push(`Tech stack: ${techStack}.`);

  const expertise = getExplicitValue(profile, "expertise.level");
  if (expertise) sections.push(`Experience level: ${expertise}.`);

  const selfDesc = getExplicitValue(profile, "identity.self_description");
  if (selfDesc) sections.push(`About them: ${selfDesc}`);

  // Rules section
  sections.push("\n## Rules (follow strictly)");

  const filteredRules = rules
    .filter((r) => !r.sensitive)
    .slice(0, config.maxRules);

  for (let i = 0; i < filteredRules.length; i++) {
    sections.push(`${i + 1}. ${filteredRules[i].rule}`);
  }

  // Keep within char limit
  let content = sections.join("\n");
  if (config.maxChars && content.length > config.maxChars) {
    // Truncate rules from the end
    const rulesHeaderIdx = sections.indexOf("\n## Rules (follow strictly)");
    if (rulesHeaderIdx !== -1) {
      while (content.length > config.maxChars && filteredRules.length > 3) {
        filteredRules.pop();
        const truncated = sections.slice(0, rulesHeaderIdx + 1);
        for (let i = 0; i < filteredRules.length; i++) {
          truncated.push(`${i + 1}. ${filteredRules[i].rule}`);
        }
        content = truncated.join("\n");
      }
    }
    // Final safety: word-boundary truncate
    if (content.length > config.maxChars) {
      content = truncateAtWordBoundary(content, config.maxChars);
    }
  }

  return content;
}

