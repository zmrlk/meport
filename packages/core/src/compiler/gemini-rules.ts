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
import type { MeportProfile } from "../schema/standard.js";
import {
  collectRules,
  truncateAtWordBoundary,
  getExplicitValue,
  findDimensionBySubstring,
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

  compile(profile: PersonaProfile | MeportProfile): ExportResult {
    const rules = collectRules(profile, this.packExportRules);

    const ruleConfig: RuleCompilerConfig = {
      maxRules: 15,
      maxChars: 3500,
      includeSensitive: false,
      includeContext: true,
      platform: "gemini",
    };

    const content = formatForGemini(profile, rules, ruleConfig);

    const ruleCount = content.split("\n").filter((l) => l.startsWith("•")).length;

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
  profile: any,
  rules: ExportRule[],
  config: RuleCompilerConfig
): string {
  const name = getExplicitValue(profile, "identity.preferred_name") ?? "User";
  const sections: string[] = [];

  // Persona section — personal context with bullet points (Gemini format)
  sections.push("## Persona");
  sections.push(`• You are talking to ${name}.`);

  const occupation = getExplicitValue(profile, "context.occupation") || getExplicitValue(profile, "identity.role");
  if (occupation) sections.push(`• Works as: ${occupation}.`);

  const techStack = getExplicitValue(profile, "expertise.tech_stack");
  if (techStack) sections.push(`• Tech: ${techStack}.`);

  const location = getExplicitValue(profile, "context.location") || getExplicitValue(profile, "life.location_type");
  if (location) sections.push(`• Based in: ${location}.`);

  const lang = getExplicitValue(profile, "identity.language");
  if (lang && !/^(en|english)$/i.test(lang)) sections.push(`• Language: ${lang}.`);

  const family = getExplicitValue(profile, "life.family_context") || findDimensionBySubstring(profile, "family");
  if (family) sections.push(`• Family: ${family}.`);

  const hobbies = getExplicitValue(profile, "lifestyle.hobbies") || getExplicitValue(profile, "lifestyle.interests");
  if (hobbies) sections.push(`• Interests: ${hobbies}.`);

  const motivation = getExplicitValue(profile, "personality.core_motivation");
  if (motivation) sections.push(`• Motivation: ${motivation}.`);

  const goals = getExplicitValue(profile, "life.goals");
  if (goals) sections.push(`• Goals: ${goals}.`);

  const selfDesc = getExplicitValue(profile, "identity.self_description");
  if (selfDesc) sections.push(`• About: ${selfDesc}`);

  // Rules section
  sections.push("\n## Rules (follow strictly)");

  const filteredRules = rules
    .filter((r) => !r.sensitive)
    .slice(0, config.maxRules);

  for (let i = 0; i < filteredRules.length; i++) {
    sections.push(`• ${filteredRules[i].rule}`);
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
          truncated.push(`• ${filteredRules[i].rule}`);
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

