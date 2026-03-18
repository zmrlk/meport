/**
 * Claude Code Rule-Based Compiler
 *
 * Compact format for CLAUDE.md — bullet rules, no XML tags, no elaborate sections.
 * Tech context included. Business/writing/analysis context sections excluded.
 * Target: ≤2000 chars, ≤10 rules.
 */

import { BaseCompiler } from "./base.js";
import type {
  PersonaProfile,
  ExportResult,
  ExportCompilerConfig,
} from "../schema/types.js";
import {
  collectRules,
  formatForClaudeCode,
  type RuleCompilerConfig,
} from "./rules.js";

export class ClaudeCodeRuleCompiler extends BaseCompiler {
  readonly config: ExportCompilerConfig = {
    platform: "Claude Code",
    format: "markdown",
    charLimit: 2000,
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
      maxRules: 10,
      maxChars: 2000,
      includeSensitive: false,
      includeContext: true,
      platform: "claude-code",
    };

    const content = formatForClaudeCode(profile, rules, ruleConfig);

    const ruleCount = content
      .split("\n")
      .filter((l) => l.startsWith("- ")).length;

    return this.buildResult(
      content,
      "CLAUDE.md",
      "Add to your project's CLAUDE.md at the top, before project-specific instructions.",
      this.collectDimensions(profile, 0.5),
      ruleCount
    );
  }
}
