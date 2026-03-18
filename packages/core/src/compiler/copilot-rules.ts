/**
 * GitHub Copilot Instructions Compiler
 *
 * Format: .github/copilot-instructions.md
 * Copilot reads this file for project-level context.
 * Coding-focused, similar to Cursor but with Copilot conventions.
 */

import { BaseCompiler } from "./base.js";
import type { PersonaProfile, ExportResult, ExportCompilerConfig } from "../schema/types.js";
import {
  collectRules,
  formatWithContexts,
  type RuleCompilerConfig,
} from "./rules.js";

export class CopilotRuleCompiler extends BaseCompiler {
  readonly config: ExportCompilerConfig = {
    platform: "Copilot",
    format: "markdown",
    charLimit: null, // charLimit is enforced by formatWithContexts(); tokenLimit is advisory (platform recommendation)
    tokenLimit: 1500,
    priority: "P1",
  };

  private packExportRules?: Map<string, string[]>;
  setPackExportRules(rules: Map<string, string[]>): void { this.packExportRules = rules; }

  compile(profile: PersonaProfile): ExportResult {
    const rules = collectRules(profile, this.packExportRules);

    // Strip sensitive/lifestyle rules — Copilot is a coding assistant
    const codingRules = rules.filter(
      (r) =>
        !r.sensitive &&
        !r.dimension.startsWith("lifestyle") &&
        !r.dimension.startsWith("health") &&
        !r.dimension.startsWith("finance") &&
        !r.dimension.startsWith("context.life")
    );

    const ruleConfig: RuleCompilerConfig = {
      maxRules: 10,
      maxChars: 4000,
      includeSensitive: false,
      includeContext: true,
      platform: "copilot",
    };

    // formatWithContexts generates per-tech-stack sections so Copilot gets
    // context-aware rules (e.g. different hints for .NET vs Rust work).
    const content = formatWithContexts(profile, codingRules, ruleConfig);

    const ruleCount = content.split("\n").filter((l) => l.startsWith("- ")).length;

    return this.buildResult(
      content,
      "copilot-instructions.md",
      "Place at .github/copilot-instructions.md in your repo.",
      this.collectDimensions(profile, 0.5),
      ruleCount
    );
  }
}
