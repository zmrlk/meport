/**
 * Claude Rule-Based Compiler
 *
 * Rich markdown with XML tags for better compliance.
 * Uses <communication-rules> and <user-context> tags.
 * No hard char limit but targets 800-2000 tokens.
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
  type RuleCompilerConfig,
} from "./rules.js";

export class ClaudeRuleCompiler extends BaseCompiler {
  readonly config: ExportCompilerConfig = {
    platform: "Claude",
    format: "markdown",
    charLimit: null, // charLimit is enforced by formatWithContexts(); tokenLimit is advisory (platform recommendation)
    tokenLimit: 2000,
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
      maxChars: 4000,
      includeSensitive: false,
      includeContext: true,
      platform: "claude",
    };

    // formatWithContexts generates per-domain context sections (tech stack groups,
    // founder vs manager vs creative, etc.) in addition to universal rules.
    // formatForClaude (XML tags) is kept as a utility for callers that need
    // pure XML-structured output without domain context sections.
    const content = formatWithContexts(profile, rules, ruleConfig);

    const ruleCount = content
      .split("\n")
      .filter((l) => l.startsWith("- ")).length;

    return this.buildResult(
      content,
      "meport-profile.md",
      "Add to Claude → Projects → Instructions, or paste into Preferences.",
      this.collectDimensions(profile, 0.5),
      ruleCount
    );
  }
}
