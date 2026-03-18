/**
 * Cursor Rule-Based Compiler
 *
 * .cursor/rules/meport.mdc format with MDC frontmatter.
 * Coding-focused — strips lifestyle/health/finance dimensions.
 * 12,000 chars max.
 */

import { BaseCompiler } from "./base.js";
import type {
  PersonaProfile,
  ExportResult,
  ExportCompilerConfig,
} from "../schema/types.js";
import {
  collectRules,
  formatWithContexts,
  getExplicitValue,
  type RuleCompilerConfig,
} from "./rules.js";

export class CursorRuleCompiler extends BaseCompiler {
  readonly config: ExportCompilerConfig = {
    platform: "Cursor",
    format: "mdc",
    charLimit: 12000,
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
      maxChars: 12000,
      includeSensitive: false,
      includeContext: true,
      platform: "cursor",
    };

    // Use formatWithContexts so tech-stack groups get separate sections
    // (e.g. Rust + TS vs .NET get different behavior rules).
    // formatForCursor is kept for callers that need the raw MDC-only format.
    const withContexts = formatWithContexts(profile, rules, ruleConfig);

    // Prepend MDC frontmatter that Cursor requires
    // YAML values with special chars need quoting
    const name = getExplicitValue(profile, "identity.preferred_name");
    const descText = name
      ? `"User profile and preferences for ${String(name).replace(/"/g, '\\"').replace(/[\n\r]/g, " ")} (meport)"`
      : "User profile and preferences (meport)";
    const mdcHeader = [
      "---",
      `description: ${descText}`,
      'globs: "**/*"',
      "alwaysApply: true",
      "---\n",
    ].join("\n");

    const content = mdcHeader + withContexts;

    const ruleCount = content
      .split("\n")
      .filter((l) => l.startsWith("- ")).length;

    return this.buildResult(
      content,
      "meport.mdc",
      "Save to .cursor/rules/meport.mdc in your project root.",
      this.collectDimensions(profile, 0.7),
      ruleCount
    );
  }
}
