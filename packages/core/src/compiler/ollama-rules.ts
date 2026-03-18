/**
 * Ollama Rule-Based Compiler
 *
 * Generates SYSTEM content for Ollama Modelfile.
 * Simple, directive rules — local models need simpler instructions
 * for better compliance (~50-60% for simple rules).
 */

import { BaseCompiler } from "./base.js";
import type {
  PersonaProfile,
  ExportResult,
  ExportCompilerConfig,
} from "../schema/types.js";
import {
  collectRules,
  formatForOllama,
  type RuleCompilerConfig,
} from "./rules.js";

export class OllamaRuleCompiler extends BaseCompiler {
  readonly config: ExportCompilerConfig = {
    platform: "Ollama Modelfile",
    format: "modelfile",
    charLimit: null,
    tokenLimit: 1000, // keep it short for local models
    priority: "P1",
  };

  private packExportRules?: Map<string, string[]>;

  setPackExportRules(rules: Map<string, string[]>): void {
    this.packExportRules = rules;
  }

  compile(profile: PersonaProfile): ExportResult {
    const rules = collectRules(profile, this.packExportRules);

    const ruleConfig: RuleCompilerConfig = {
      maxRules: 8, // fewer rules for local models — simpler is better
      maxChars: 4000,
      includeSensitive: false,
      includeContext: false,
      platform: "ollama",
    };

    const content = formatForOllama(profile, rules, ruleConfig);

    // Wrap in Modelfile SYSTEM directive
    const modelfile = `SYSTEM """
${content}
"""`;

    const ruleCount = content
      .split("\n")
      .filter((l) => l.match(/^\d+\./)).length;

    return this.buildResult(
      modelfile,
      "Modelfile",
      "Add to your Ollama Modelfile. Run: ollama create mymodel -f Modelfile",
      this.collectDimensions(profile, 0.7),
      ruleCount
    );
  }
}
