/**
 * AGENTS.md Compiler — for OpenAI Codex
 *
 * Format: Markdown with sections per OpenAI's AGENTS.md spec:
 * https://developers.openai.com/codex/guides/agents-md/
 *
 * Codex reads AGENTS.md before doing any work.
 * Layered: root (project-wide) + subdirectory (scoped).
 * We generate the root personal preferences layer.
 */

import { BaseCompiler } from "./base.js";
import type { PersonaProfile, ExportResult, ExportCompilerConfig } from "../schema/types.js";
import { collectRules, formatForAgentsMd, type RuleCompilerConfig } from "./rules.js";

export class AgentsMdRuleCompiler extends BaseCompiler {
  readonly config: ExportCompilerConfig = {
    platform: "AGENTS.md",
    format: "markdown",
    charLimit: 4000, // charLimit is enforced by formatWithContexts(); tokenLimit is advisory (platform recommendation)
    tokenLimit: 2000,
    priority: "P1",
  };

  private packExportRules?: Map<string, string[]>;
  setPackExportRules(rules: Map<string, string[]>): void { this.packExportRules = rules; }

  compile(profile: PersonaProfile): ExportResult {
    const rules = collectRules(profile, this.packExportRules);

    const ruleConfig: RuleCompilerConfig = {
      maxRules: 15,
      maxChars: 4000,
      includeSensitive: false,
      includeContext: true,
      platform: "agents-md",
    };

    const content = formatForAgentsMd(profile, rules, ruleConfig);
    const ruleCount = content.split("\n").filter((l) => l.startsWith("- ")).length;

    return this.buildResult(
      content,
      "AGENTS.md",
      "Place in your project root. Codex reads it automatically before each task.",
      this.collectDimensions(profile, 0.5),
      ruleCount
    );
  }
}
