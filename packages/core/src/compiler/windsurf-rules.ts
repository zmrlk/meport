/**
 * Windsurf Rules Compiler
 * Format: .windsurfrules file in project root. Markdown rules, coding-focused.
 */

import { BaseCompiler } from "./base.js";
import type { PersonaProfile, ExportResult, ExportCompilerConfig } from "../schema/types.js";
import { collectRules, formatForWindsurf, type RuleCompilerConfig } from "./rules.js";

export class WindsurfRuleCompiler extends BaseCompiler {
  readonly config: ExportCompilerConfig = {
    platform: "Windsurf",
    format: "markdown",
    charLimit: 6000, // charLimit is enforced by formatWithContexts(); tokenLimit is advisory (platform recommendation)
    tokenLimit: 1500,
    priority: "P1",
  };

  private packExportRules?: Map<string, string[]>;
  setPackExportRules(rules: Map<string, string[]>): void { this.packExportRules = rules; }

  compile(profile: PersonaProfile): ExportResult {
    const rules = collectRules(profile, this.packExportRules);

    const ruleConfig: RuleCompilerConfig = {
      maxRules: 15,
      maxChars: 6000,
      includeSensitive: false,
      includeContext: false,
      platform: "windsurf",
    };

    const content = formatForWindsurf(profile, rules, ruleConfig);
    const ruleCount = content.split("\n").filter((l) => l.startsWith("- ")).length;

    return this.buildResult(
      content,
      ".windsurfrules",
      "Place in your project root. Windsurf reads it automatically.",
      this.collectDimensions(profile, 0.5),
      ruleCount
    );
  }
}
