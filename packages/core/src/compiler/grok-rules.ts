/**
 * Grok Custom Instructions Compiler
 *
 * Format: Plain text with a numbered RULES section.
 * Grok supports ~4000 chars in custom instructions.
 */

import { BaseCompiler } from "./base.js";
import type { PersonaProfile, ExportResult, ExportCompilerConfig } from "../schema/types.js";
import { collectRules, truncateAtWordBoundary, getExplicitValue, type ExportRule } from "./rules.js";

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

  compile(profile: PersonaProfile): ExportResult {
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

  private formatForGrok(profile: PersonaProfile, rules: ExportRule[]): string {
    const name = getExplicitValue(profile, "identity.preferred_name") ?? "User";
    const lines: string[] = [];

    lines.push(`My name is ${name}.`);
    const occupation = getExplicitValue(profile, "context.occupation");
    if (occupation) lines.push(`I'm a ${occupation}.`);
    const useCase = getExplicitValue(profile, "primary_use_case");
    if (useCase) lines.push(`I use AI for ${useCase}.`);
    const techStack = getExplicitValue(profile, "expertise.tech_stack");
    if (techStack) lines.push(`Tech: ${techStack}.`);

    lines.push("\nRULES:");
    for (let i = 0; i < rules.length; i++) {
      lines.push(`${i + 1}. ${rules[i].rule}`);
    }

    let output = lines.join("\n");
    if (output.length > 4000) {
      output = truncateAtWordBoundary(output, 4000);
    }
    return output;
  }
}

