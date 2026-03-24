/**
 * Grok Custom Instructions Compiler
 *
 * Format: Plain text with a numbered RULES section.
 * Grok supports ~4000 chars in custom instructions.
 */

import { BaseCompiler } from "./base.js";
import type { PersonaProfile, ExportResult, ExportCompilerConfig } from "../schema/types.js";
import type { MeportProfile } from "../schema/standard.js";
import { collectRules, truncateAtWordBoundary, getExplicitValue, findDimensionBySubstring, type ExportRule } from "./rules.js";

export class GrokRuleCompiler extends BaseCompiler {
  readonly config: ExportCompilerConfig = {
    platform: "Grok",
    format: "text",
    charLimit: 4000,
    tokenLimit: null,
    priority: "P1",
  };

  private packExportRules?: Map<string, string[]>;
  setPackExportRules(rules: Map<string, string[]>): void { this.packExportRules = rules; }

  compile(profile: PersonaProfile | MeportProfile): ExportResult {
    const rules = collectRules(profile, this.packExportRules);
    const filteredRules = rules.filter((r) => !r.sensitive).slice(0, 15);
    const content = this.formatForGrok(profile, filteredRules);

    return this.buildResult(
      content,
      "grok-instructions.txt",
      "Open Grok → Settings → Custom Instructions → Paste.",
      this.collectDimensions(profile, 0.5),
      filteredRules.length
    );
  }

  private formatForGrok(profile: any, rules: ExportRule[]): string {
    const name = getExplicitValue(profile, "identity.preferred_name") ?? "User";
    const lines: string[] = [];

    lines.push(`My name is ${name}.`);
    const occupation = getExplicitValue(profile, "context.occupation") || getExplicitValue(profile, "identity.role");
    if (occupation) lines.push(`I'm a ${occupation}.`);
    const techStack = getExplicitValue(profile, "expertise.tech_stack");
    if (techStack) lines.push(`Tech: ${techStack}.`);
    const location = getExplicitValue(profile, "context.location") || getExplicitValue(profile, "life.location_type");
    if (location) lines.push(`Based in ${location}.`);
    const lang = getExplicitValue(profile, "identity.language");
    if (lang && !/^(en|english)$/i.test(lang)) lines.push(`Language: ${lang}.`);
    const family = getExplicitValue(profile, "life.family_context") || findDimensionBySubstring(profile, "family");
    if (family) lines.push(`Family: ${family}.`);
    const hobbies = getExplicitValue(profile, "lifestyle.hobbies") || getExplicitValue(profile, "lifestyle.interests");
    if (hobbies) lines.push(`Interests: ${hobbies}.`);
    const motivation = getExplicitValue(profile, "personality.core_motivation");
    if (motivation) lines.push(`Motivation: ${motivation}.`);
    const goals = getExplicitValue(profile, "life.goals");
    if (goals) lines.push(`Goals: ${goals}.`);
    const lifeStage = getExplicitValue(profile, "life.life_stage") || getExplicitValue(profile, "life.stage");
    if (lifeStage) lines.push(`Life stage: ${lifeStage}.`);

    lines.push("\nRULES:");
    for (let i = 0; i < rules.length; i++) {
      lines.push(`${i + 1}. ${rules[i].rule}`);
    }

    let output = lines.join("\n");
    const limit = this.config.charLimit ?? 4000;
    if (output.length > limit) {
      output = truncateAtWordBoundary(output, limit);
    }
    return output;
  }
}

