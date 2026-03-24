/**
 * Perplexity Custom Instructions Compiler
 * Format: Concise plain text optimized for search-focused answers.
 * Perplexity is search-focused — rules about how to present findings.
 */

import { BaseCompiler } from "./base.js";
import type { PersonaProfile, ExportResult, ExportCompilerConfig } from "../schema/types.js";
import type { MeportProfile } from "../schema/standard.js";
import { collectRules, truncateAtWordBoundary, getExplicitValue, findDimensionBySubstring, type ExportRule } from "./rules.js";

export class PerplexityRuleCompiler extends BaseCompiler {
  readonly config: ExportCompilerConfig = {
    platform: "Perplexity",
    format: "text",
    charLimit: 3000,
    tokenLimit: null,
    priority: "P1",
  };

  private packExportRules?: Map<string, string[]>;
  setPackExportRules(rules: Map<string, string[]>): void { this.packExportRules = rules; }

  compile(profile: PersonaProfile | MeportProfile): ExportResult {
    const rules = collectRules(profile, this.packExportRules);
    const filtered = rules.filter((r) => !r.sensitive).slice(0, 12);
    const content = this.formatForPerplexity(profile, filtered);

    return this.buildResult(
      content,
      "perplexity-instructions.txt",
      "Open Perplexity → Profile → AI Profile → Paste.",
      this.collectDimensions(profile, 0.5),
      filtered.length
    );
  }

  private formatForPerplexity(profile: any, rules: ExportRule[]): string {
    const name = getExplicitValue(profile, "identity.preferred_name") ?? "User";
    const lines: string[] = [];

    lines.push(`I'm ${name}.`);
    const occupation = getExplicitValue(profile, "context.occupation") || getExplicitValue(profile, "identity.role");
    if (occupation) lines.push(`${occupation}.`);
    const techStack = getExplicitValue(profile, "expertise.tech_stack");
    if (techStack) lines.push(`Tech: ${techStack}.`);
    const location = getExplicitValue(profile, "context.location");
    if (location) lines.push(`Based in ${location}.`);
    const lang = getExplicitValue(profile, "identity.language");
    if (lang && !/^(en|english)$/i.test(lang)) lines.push(`Language: ${lang}.`);
    const family = getExplicitValue(profile, "life.family_context") || findDimensionBySubstring(profile, "family");
    if (family) lines.push(`Family: ${family}.`);
    const goals = getExplicitValue(profile, "life.goals");
    if (goals) lines.push(`Goals: ${goals}.`);
    const hobbies = getExplicitValue(profile, "lifestyle.hobbies") || getExplicitValue(profile, "lifestyle.interests");
    if (hobbies) lines.push(`Interests: ${hobbies}.`);

    lines.push("\nWhen answering my questions:");
    for (let i = 0; i < rules.length; i++) {
      lines.push(`${i + 1}. ${rules[i].rule}`);
    }

    let output = lines.join("\n");
    const limit = this.config.charLimit ?? 3000;
    if (output.length > limit) {
      output = truncateAtWordBoundary(output, limit);
    }
    return output;
  }
}

