/**
 * ChatGPT Rule-Based Compiler
 *
 * Generates ChatGPT Custom Instructions using RULES, not descriptions.
 * Two fields: "What would you like ChatGPT to know?" + "How should ChatGPT respond?"
 * Hard limit: 1,500 chars per field.
 *
 * Critical rules at START and END (Lost in the Middle effect).
 */

import { BaseCompiler } from "./base.js";
import type {
  PersonaProfile,
  ExportResult,
  ExportCompilerConfig,
} from "../schema/types.js";
import {
  collectRules,
  formatForChatGPT,
  type ExportRule,
  type RuleCompilerConfig,
} from "./rules.js";

export class ChatGPTRuleCompiler extends BaseCompiler {
  readonly config: ExportCompilerConfig = {
    platform: "ChatGPT Custom Instructions",
    format: "text",
    charLimit: 1500,
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
      maxRules: 12,
      maxChars: 1500,
      includeSensitive: false,
      includeContext: true,
      platform: "chatgpt",
    };

    const { aboutMe, howToRespond } = formatForChatGPT(
      profile,
      rules,
      ruleConfig
    );

    // Apply Lost in the Middle: repeat most critical rule at end
    let content = aboutMe + "\n\n" + howToRespond;

    // Count included rules
    const ruleCount = howToRespond.split("\n").filter((l) =>
      l.match(/^\d+\./)
    ).length;

    return this.buildResult(
      content,
      "chatgpt-instructions.txt",
      'Copy to ChatGPT → Settings → Personalization → Custom Instructions.\nField 1 "About me": paste everything before RULES.\nField 2 "How to respond": paste from RULES onwards.',
      this.collectDimensions(profile, 0.7),
      ruleCount
    );
  }
}
