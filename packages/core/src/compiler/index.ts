/**
 * Export Compiler Registry
 *
 * Central registry for all platform-specific compilers.
 * v2: Rule-based compilers (new) alongside description-based (legacy).
 *
 * Usage:
 *   getCompiler("chatgpt").compile(profile)        // legacy
 *   getRuleCompiler("chatgpt").compile(profile)     // rule-based (recommended)
 */

import type { PersonaProfile, ExportResult } from "../schema/types.js";
import { BaseCompiler } from "./base.js";

// Legacy (description-based)
import { ChatGPTCompiler } from "./chatgpt.js";
import { ClaudeCompiler } from "./claude.js";
import { ClaudeCodeCompiler } from "./claude-code.js";
import { GenericCompiler } from "./generic.js";
import { JsonCompiler } from "./json.js";

// Rule-based (v2)
import { ChatGPTRuleCompiler } from "./chatgpt-rules.js";
import { ClaudeRuleCompiler } from "./claude-rules.js";
import { CursorRuleCompiler } from "./cursor-rules.js";
import { OllamaRuleCompiler } from "./ollama-rules.js";
import { GeminiRuleCompiler } from "./gemini-rules.js";
import { AgentsMdRuleCompiler } from "./agents-md-rules.js";
import { ClaudeCodeRuleCompiler } from "./claude-code-rules.js";
import { CopilotRuleCompiler } from "./copilot-rules.js";
import { GrokRuleCompiler } from "./grok-rules.js";
import { PerplexityRuleCompiler } from "./perplexity-rules.js";
import { WindsurfRuleCompiler } from "./windsurf-rules.js";
import { OpenClawRuleCompiler } from "./openclaw-rules.js";
import { GenericRuleCompiler } from "./generic-rules.js";

// Legacy exports
export { BaseCompiler } from "./base.js";
export { ChatGPTCompiler } from "./chatgpt.js";
export { ClaudeCompiler } from "./claude.js";
export { ClaudeCodeCompiler } from "./claude-code.js";
export { GenericCompiler } from "./generic.js";
export { JsonCompiler } from "./json.js";

// Rule-based exports
export { ChatGPTRuleCompiler } from "./chatgpt-rules.js";
export { ClaudeRuleCompiler } from "./claude-rules.js";
export { CursorRuleCompiler } from "./cursor-rules.js";
export { OllamaRuleCompiler } from "./ollama-rules.js";
export { GeminiRuleCompiler } from "./gemini-rules.js";
export { AgentsMdRuleCompiler } from "./agents-md-rules.js";
export { ClaudeCodeRuleCompiler } from "./claude-code-rules.js";
export { CopilotRuleCompiler } from "./copilot-rules.js";
export { GrokRuleCompiler } from "./grok-rules.js";
export { PerplexityRuleCompiler } from "./perplexity-rules.js";
export { WindsurfRuleCompiler } from "./windsurf-rules.js";
export { GenericRuleCompiler } from "./generic-rules.js";
export {
  OpenClawRuleCompiler,
  formatForOpenClaw,
  formatOpenClawAgentsMd,
  formatOpenClawIdentityMd,
  type OpenClawBundleResult,
} from "./openclaw-rules.js";
export {
  collectRules,
  formatWithContexts,
  formatForClaudeCode,
  formatForWindsurf,
  formatForAgentsMd,
  truncateAtWordBoundary,
  validateProfile,
  type ExportRule,
  type RuleCompilerConfig,
} from "./rules.js";

export type PlatformId =
  // Implemented (legacy + rule-based)
  | "chatgpt"
  | "claude"
  | "claude-code"
  | "cursor"
  | "ollama"
  | "generic"
  | "json"
  | "windsurf"
  | "copilot"
  | "gemini"
  | "agents-md"
  | "grok"
  | "perplexity"
  | "openclaw";

// ─── Legacy Registry (description-based) ────────────────────

const compilerRegistry: Map<PlatformId, () => BaseCompiler> = new Map([
  ["chatgpt", () => new ChatGPTCompiler()],
  ["claude", () => new ClaudeCompiler()],
  ["claude-code", () => new ClaudeCodeCompiler()],
  ["generic", () => new GenericCompiler()],
  ["json", () => new JsonCompiler()],
]);

export function getCompiler(platform: PlatformId): BaseCompiler {
  const factory = compilerRegistry.get(platform);
  if (!factory) {
    throw new Error(
      `Compiler for "${platform}" is not yet implemented. Available: ${[...compilerRegistry.keys()].join(", ")}`
    );
  }
  return factory();
}

// ─── Rule-Based Registry (v2, recommended) ──────────────────

const ruleCompilerRegistry: Map<PlatformId, () => BaseCompiler> = new Map([
  ["chatgpt", () => new ChatGPTRuleCompiler()],
  ["claude", () => new ClaudeRuleCompiler()],
  ["claude-code", () => new ClaudeCodeRuleCompiler()],
  ["cursor", () => new CursorRuleCompiler()],
  ["ollama", () => new OllamaRuleCompiler()],
  ["gemini", () => new GeminiRuleCompiler()],
  ["agents-md", () => new AgentsMdRuleCompiler()],
  ["copilot", () => new CopilotRuleCompiler()],
  ["grok", () => new GrokRuleCompiler()],
  ["perplexity", () => new PerplexityRuleCompiler()],
  ["windsurf", () => new WindsurfRuleCompiler()],
  ["openclaw", () => new OpenClawRuleCompiler()],
  ["generic", () => new GenericRuleCompiler()],
  ["json", () => new JsonCompiler()],
]);

export function getRuleCompiler(platform: PlatformId): BaseCompiler {
  const factory = ruleCompilerRegistry.get(platform);
  if (!factory) {
    // Graceful fallback — use Claude format (markdown rules) for unknown platforms
    console.warn(
      `[meport] Unknown platform "${platform}" — falling back to Claude format. Available: ${[...ruleCompilerRegistry.keys()].join(", ")}`
    );
    return new ClaudeRuleCompiler();
  }
  return factory();
}

export function getAvailableCompilers(): PlatformId[] {
  return [...compilerRegistry.keys()];
}

export function getAvailableRuleCompilers(): PlatformId[] {
  return [...ruleCompilerRegistry.keys()];
}

export function compileAll(
  profile: PersonaProfile
): Map<PlatformId, ExportResult> {
  const results = new Map<PlatformId, ExportResult>();

  for (const [id, factory] of compilerRegistry) {
    const compiler = factory();
    results.set(id, compiler.compile(profile));
  }

  return results;
}

export function compileAllRules(
  profile: PersonaProfile,
  packExportRules?: Map<string, string[]>
): Map<PlatformId, ExportResult> {
  const results = new Map<PlatformId, ExportResult>();

  for (const [id, factory] of ruleCompilerRegistry) {
    const compiler = factory();
    if (packExportRules && compiler.setPackExportRules) {
      compiler.setPackExportRules(packExportRules);
    }
    results.set(id, compiler.compile(profile));
  }

  return results;
}
