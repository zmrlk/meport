/**
 * Platform metadata for export screen.
 */
export interface PlatformMeta {
  id: string;
  name: string;
  icon: string;
  format: string;
  description: string;
  color: string;
  settingsUrl?: string; // Direct link to platform's settings where user pastes the profile
  category?: string;   // "chat" | "editor" | "universal"
  deployType?: "download" | "clipboard"; // how this platform gets deployed
}

export const platforms: PlatformMeta[] = [
  { id: "chatgpt", name: "ChatGPT", icon: "🟢", format: "Custom Instructions", description: "Memory + How to Respond", color: "#10a37f", settingsUrl: "https://chatgpt.com/?temporary-chat=true#settings/Personalization", category: "chat", deployType: "clipboard" },
  { id: "claude", name: "Claude", icon: "🟠", format: "Project Instructions", description: "XML-structured rules", color: "#d97706", settingsUrl: "https://claude.ai/settings/profile", category: "chat", deployType: "clipboard" },
  { id: "claude-code", name: "Claude Code", icon: "⚡", format: "CLAUDE.md", description: "Markdown in repo root", color: "#f59e0b", category: "editor", deployType: "download" },
  { id: "cursor", name: "Cursor", icon: "🔵", format: ".cursorrules", description: "MDC frontmatter + rules", color: "#3b82f6", category: "editor", deployType: "download" },
  { id: "copilot", name: "GitHub Copilot", icon: "🐙", format: "copilot-instructions.md", description: ".github/ directory", color: "#6366f1", category: "editor", deployType: "download" },
  { id: "windsurf", name: "Windsurf", icon: "🏄", format: ".windsurfrules", description: "Project root file", color: "#06b6d4", category: "editor", deployType: "download" },
  { id: "gemini", name: "Gemini", icon: "💎", format: "Gem Instructions", description: "Persona + Rules", color: "#8b5cf6", settingsUrl: "https://gemini.google.com/app/settings", category: "chat", deployType: "clipboard" },
  { id: "ollama", name: "Ollama", icon: "🦙", format: "Modelfile", description: "SYSTEM directive", color: "#64748b", category: "editor", deployType: "download" },
  { id: "grok", name: "Grok", icon: "⚡", format: "Custom Instructions", description: "Settings → Custom", color: "#ef4444", settingsUrl: "https://x.com/i/grok", category: "chat", deployType: "clipboard" },
  { id: "perplexity", name: "Perplexity", icon: "🔍", format: "AI Profile", description: "Profile → AI Profile", color: "#22d3ee", settingsUrl: "https://www.perplexity.ai/settings/account", category: "chat", deployType: "clipboard" },
  { id: "agents-md", name: "AGENTS.md", icon: "📋", format: "AGENTS.md", description: "Agent definition file", color: "#a78bfa", category: "editor", deployType: "download" },
  { id: "openclaw", name: "OpenClaw", icon: "🦞", format: "SOUL.md", description: "Full personality bundle", color: "#fb923c", category: "editor", deployType: "download" },
  { id: "json", name: "JSON", icon: "{ }", format: "profile.json", description: "Raw machine-readable", color: "#94a3b8", category: "universal", deployType: "download" },
  { id: "generic", name: "Generic", icon: "📄", format: "meport-rules.md", description: "Plain markdown rules for any AI tool", color: "#6b7280", category: "universal", deployType: "download" },
];
