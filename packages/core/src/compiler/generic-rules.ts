/**
 * Generic Rule-Based Compiler
 *
 * Plain markdown rules for any AI tool — no platform-specific formatting.
 * Good as a fallback for any LLM: Open WebUI, LM Studio, Jan.ai, custom APIs, etc.
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

export class GenericRuleCompiler extends BaseCompiler {
  readonly config: ExportCompilerConfig = {
    platform: "Generic",
    format: "markdown",
    charLimit: null,
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
      platform: "claude", // reuse claude formatting (clean markdown + sections)
    };

    const content = formatWithContexts(profile, rules, ruleConfig);

    const ruleCount = content
      .split("\n")
      .filter((l) => l.startsWith("- ")).length;

    return this.buildResult(
      content,
      "meport-rules.md",
      "Paste as the system prompt in any LLM API, Open WebUI, LM Studio, Jan.ai, or similar.",
      this.collectDimensions(profile, 0.5),
      ruleCount
    );
  }
}
