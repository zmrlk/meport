/**
 * Perplexity Custom Instructions Compiler
 * Format: Concise plain text optimized for search-focused answers.
 * Perplexity is search-focused — rules about how to present findings.
 */

import { BaseCompiler } from "./base.js";
import type { PersonaProfile, ExportResult, ExportCompilerConfig } from "../schema/types.js";
import { collectRules, truncateAtWordBoundary, getExplicitValue, type ExportRule } from "./rules.js";

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

  compile(profile: PersonaProfile): ExportResult {
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

  private formatForPerplexity(profile: PersonaProfile, rules: ExportRule[]): string {
    const name = getExplicitValue(profile, "identity.preferred_name") ?? "User";
    const lines: string[] = [];

    lines.push(`I'm ${name}.`);
    const occupation = getExplicitValue(profile, "context.occupation");
    if (occupation) lines.push(`${occupation}.`);
    const expertise = getExplicitValue(profile, "expertise.level");
    if (expertise) lines.push(`${expertise} level.`);

    lines.push("\nWhen answering my questions:");
    for (let i = 0; i < rules.length; i++) {
      lines.push(`${i + 1}. ${rules[i].rule}`);
    }

    let output = lines.join("\n");
    if (output.length > 3000) {
      output = truncateAtWordBoundary(output, 3000);
    }
    return output;
  }
}

