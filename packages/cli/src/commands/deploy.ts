/**
 * meport deploy — Push profile to all platforms automatically
 *
 * meport becomes the MANAGEMENT CENTER for all your AI profiles.
 *
 * Auto-deploy (writes files directly):
 * - Cursor (.cursor/rules/meport.mdc)
 * - Claude Code (CLAUDE.md or ~/.claude/CLAUDE.md)
 * - Copilot (.github/copilot-instructions.md)
 * - Windsurf (.windsurfrules)
 * - AGENTS.md (project root)
 * - Ollama (Modelfile + ollama create)
 *
 * Manual (clipboard + instructions):
 * - ChatGPT, Claude web, Gemini, Grok, Perplexity
 */

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import ora from "ora";
import { select, confirm } from "@inquirer/prompts";
import {
  collectPackExportRules,
  compileAllRules,
  getRuleCompiler,
  loadPacks,
  getAvailablePackIds,
  type PersonaProfile,
  type PlatformId,
} from "@meport/core";
import { copyToClipboard } from "../utils/clipboard.js";
import {
  GREEN,
  BOLD,
  CYAN,
  DIM,
  RED,
  YELLOW,
} from "../ui/display.js";

import { addProject, loadProjects } from "./projects.js";

interface DeployOptions {
  profile: string;
  lang?: string;
  all?: boolean;
  global?: boolean;
}

interface DeployTarget {
  platform: string;
  type: "auto" | "clipboard" | "manual";
  path?: string;
  description: string;
}

export async function deployCommand(options: DeployOptions): Promise<void> {
  const pl = (options.lang ?? "").startsWith("pl") ||
    (!options.lang && (process.env.LANG ?? "").startsWith("pl"));

  // Load profile
  let profile: PersonaProfile;
  try {
    const raw = await readFile(options.profile, "utf-8");
    profile = JSON.parse(raw);
  } catch {
    console.log(RED("✗ ") + (pl ? "Brak profilu." : "No profile found."));
    return;
  }

  // Load pack rules + compile exports
  let packRules = new Map<string, string>();
  try {
    const packs = await loadPacks(getAvailablePackIds());
    packRules = collectPackExportRules(packs);
  } catch {
    console.log(YELLOW("⚠ Pack rules could not be loaded"));
  }

  const compileSpin = ora(pl ? "Kompiluję eksporty..." : "Compiling exports...").start();
  const exports = compileAllRules(profile, packRules);
  compileSpin.succeed(`${exports.size} ${pl ? "platform" : "platforms"}`);

  // Discover deploy targets
  const targets = await discoverTargets();

  console.log(
    BOLD(pl ? "\n━━━ Deploy profilu ━━━\n" : "\n━━━ Deploy Profile ━━━\n")
  );

  // Show what we found
  const autoTargets = targets.filter((t) => t.type === "auto");
  const clipTargets = targets.filter((t) => t.type === "clipboard");

  if (autoTargets.length > 0) {
    console.log(BOLD(pl ? "  Automatyczny deploy:\n" : "  Auto-deploy:\n"));
    for (const t of autoTargets) {
      console.log(`    ${GREEN("●")} ${BOLD(t.platform)} → ${DIM(t.path ?? "")}`);
    }
    console.log();
  }

  if (clipTargets.length > 0) {
    console.log(BOLD(pl ? "  Ręczny (clipboard):\n" : "  Manual (clipboard):\n"));
    for (const t of clipTargets) {
      console.log(`    ${YELLOW("○")} ${t.platform} — ${DIM(t.description)}`);
    }
    console.log();
  }

  // Deploy
  const doDeploy = options.all || await confirm({
    message: pl ? "Wdrożyć?" : "Deploy?",
    default: true,
  });

  if (!doDeploy) return;

  // Platform name → compiler ID mapping
  const platformToCompiler: Record<string, string> = {
    "Cursor": "cursor",
    "Claude Code": "claude-code",
    "Copilot": "copilot",
    "Windsurf": "windsurf",
    "AGENTS.md": "agents-md",
  };

  // Auto-deploy to file-based platforms
  for (const target of autoTargets) {
    const platformId = (platformToCompiler[target.platform] ?? target.platform.toLowerCase()) as PlatformId;
    const exportResult = exports.get(platformId) ?? exports.get("claude" as PlatformId);

    if (!exportResult || !target.path) continue;

    try {
      await mkdir(dirname(target.path), { recursive: true });

      // Smart merge: if file exists, inject meport section instead of overwriting
      let finalContent = exportResult.content;
      try {
        const existing = await readFile(target.path, "utf-8");
        if (existing.length > 0 && !existing.includes("meport")) {
          // File exists and doesn't have meport content yet — APPEND
          const separator = "\n\n# --- meport profile (auto-generated) ---\n\n";
          finalContent = existing.trimEnd() + separator + exportResult.content;
          console.log(`  ${GREEN("✓")} ${target.platform} → ${CYAN(target.path)} ${DIM("(merged)")}`);
        } else if (existing.includes("# --- meport profile")) {
          // meport section exists — REPLACE only that section
          const before = existing.split("# --- meport profile")[0].trimEnd();
          const separator = "\n\n# --- meport profile (auto-generated) ---\n\n";
          finalContent = before + separator + exportResult.content;
          console.log(`  ${GREEN("✓")} ${target.platform} → ${CYAN(target.path)} ${DIM("(updated)")}`);
        } else {
          console.log(`  ${GREEN("✓")} ${target.platform} → ${CYAN(target.path)}`);
        }
      } catch {
        // File doesn't exist — write new
        console.log(`  ${GREEN("✓")} ${target.platform} → ${CYAN(target.path)} ${DIM("(new)")}`);
      }

      await writeFile(target.path, finalContent, "utf-8");
    } catch (err: any) {
      const msg = err.code === "EACCES"
        ? (pl ? "Brak uprawnień — sprawdź uprawnienia folderu" : "Permission denied — check folder permissions")
        : err.message;
      console.log(`  ${RED("✗")} ${target.platform} — ${msg}`);
    }
  }

  // Clipboard for ChatGPT (most common)
  const chatgptExport = exports.get("chatgpt" as PlatformId);
  if (chatgptExport) {
    if (copyToClipboard(chatgptExport.content)) {
      console.log(
        `\n  ${GREEN("📋")} ${BOLD("ChatGPT")} ${pl ? "w schowku!" : "copied to clipboard!"}`
      );
      console.log(
        DIM(pl
          ? "     → Otwórz ChatGPT → Settings → Personalization → Wklej"
          : "     → Open ChatGPT → Settings → Personalization → Paste")
      );
    }
  }

  // Instructions for other web platforms
  const webPlatforms = [
    { id: "claude" as PlatformId, name: "Claude", instruction: pl ? "Projects → Instructions → Wklej" : "Projects → Instructions → Paste" },
    { id: "gemini" as PlatformId, name: "Gemini", instruction: pl ? "Gems → Stwórz Gem → Wklej instrukcje" : "Gems → Create Gem → Paste instructions" },
    { id: "grok" as PlatformId, name: "Grok", instruction: pl ? "Settings → Custom Instructions → Wklej" : "Settings → Custom Instructions → Paste" },
    { id: "perplexity" as PlatformId, name: "Perplexity", instruction: pl ? "Profile → AI Profile → Wklej" : "Profile → AI Profile → Paste" },
  ];

  const hasWebExports = webPlatforms.some((p) => exports.has(p.id));
  if (hasWebExports) {
    console.log(
      BOLD(pl ? "\n  Ręczne wgranie:\n" : "\n  Manual upload:\n")
    );
    for (const wp of webPlatforms) {
      const exp = exports.get(wp.id);
      if (exp) {
        console.log(`    ${CYAN(wp.name)} → ${DIM(wp.instruction)}`);
        console.log(DIM(`      ${pl ? "Plik" : "File"}: meport-exports/${exp.filename}`));
      }
    }
  }

  // Copy another platform to clipboard
  console.log();
  const copyMore = await select({
    message: pl ? "Skopiować inną platformę do schowka?" : "Copy another platform to clipboard?",
    choices: [
      { name: pl ? "← Gotowe" : "← Done", value: "done" },
      ...webPlatforms
        .filter((p) => exports.has(p.id))
        .map((p) => ({ name: p.name, value: p.id })),
    ],
  });

  if (copyMore !== "done") {
    const exp = exports.get(copyMore as PlatformId);
    if (exp && copyToClipboard(exp.content)) {
      console.log(GREEN(`  ✓ ${copyMore} ${pl ? "skopiowany!" : "copied!"}`));
    }
  }

  console.log(
    GREEN(pl ? "\n  ✓ Deploy zakończony!\n" : "\n  ✓ Deploy complete!\n")
  );

  // Auto-track this project
  await addProject(process.cwd());
}

// ─── Target Discovery ───────────────────────────────────

async function discoverTargets(): Promise<DeployTarget[]> {
  const targets: DeployTarget[] = [];
  const cwd = process.cwd();
  const home = homedir();

  // Cursor — .cursor/rules/
  const cursorDir = join(cwd, ".cursor", "rules");
  targets.push({
    platform: "Cursor",
    type: "auto",
    path: join(cursorDir, "meport.mdc"),
    description: "Cursor AI rules",
  });

  // Claude Code — CLAUDE.md in project or global
  const claudeMdProject = join(cwd, "CLAUDE.md");
  const claudeMdGlobal = join(home, ".claude", "CLAUDE.md");

  // Claude Code — merge into existing CLAUDE.md or create new
  targets.push({
    platform: "Claude Code",
    type: "auto",
    path: claudeMdProject, // smart merge handles existing content
    description: "Claude Code project instructions",
  });

  // Copilot — .github/copilot-instructions.md
  targets.push({
    platform: "Copilot",
    type: "auto",
    path: join(cwd, ".github", "copilot-instructions.md"),
    description: "GitHub Copilot instructions",
  });

  // Windsurf — .windsurfrules
  targets.push({
    platform: "Windsurf",
    type: "auto",
    path: join(cwd, ".windsurfrules"),
    description: "Windsurf AI rules",
  });

  // AGENTS.md — project root
  targets.push({
    platform: "AGENTS.md",
    type: "auto",
    path: join(cwd, "AGENTS.md"),
    description: "OpenAI Codex instructions",
  });

  // Web platforms (clipboard only)
  targets.push(
    { platform: "ChatGPT", type: "clipboard", description: "Settings → Personalization" },
    { platform: "Claude", type: "clipboard", description: "Projects → Instructions" },
    { platform: "Gemini", type: "clipboard", description: "Gems → Instructions" },
    { platform: "Grok", type: "clipboard", description: "Settings → Custom Instructions" },
    { platform: "Perplexity", type: "clipboard", description: "Profile → AI Profile" },
  );

  return targets;
}
