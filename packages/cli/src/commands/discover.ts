/**
 * meport discover — Find existing AI config files on your computer
 *
 * Scans common locations for CLAUDE.md, .cursorrules, copilot-instructions.md,
 * .windsurfrules, AGENTS.md etc. and offers to update them with your meport profile.
 */

import { readFile, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import ora from "ora";
import { select, confirm, checkbox } from "@inquirer/prompts";
import { addProject } from "./projects.js";
import {
  GREEN,
  BOLD,
  CYAN,
  DIM,
  RED,
  YELLOW,
} from "../ui/display.js";

interface DiscoverOptions {
  profile: string;
  lang?: string;
}

interface FoundConfig {
  type: string;
  path: string;
  projectDir: string;
  size: number;
}

const AI_CONFIG_FILES = [
  { name: "CLAUDE.md", type: "Claude Code" },
  { name: ".cursorrules", type: "Cursor (legacy)" },
  { name: ".windsurfrules", type: "Windsurf" },
  { name: "AGENTS.md", type: "Codex" },
];

const AI_CONFIG_DIRS = [
  { dir: ".cursor/rules", file: null, ext: ".mdc", type: "Cursor" },
  { dir: ".github", file: "copilot-instructions.md", ext: null, type: "Copilot" },
];

export async function discoverCommand(options: DiscoverOptions): Promise<void> {
  const pl = (options.lang ?? "").startsWith("pl") ||
    (!options.lang && (process.env.LANG ?? "").startsWith("pl"));

  console.log(
    BOLD(pl ? "\n━━━ Szukam plików AI ━━━\n" : "\n━━━ Finding AI config files ━━━\n")
  );
  console.log(
    DIM(pl
      ? "  Szukam CLAUDE.md, .cursorrules, AGENTS.md, copilot-instructions.md\n  w Twoich projektach...\n"
      : "  Looking for CLAUDE.md, .cursorrules, AGENTS.md, copilot-instructions.md\n  in your projects...\n")
  );

  const spin = ora(pl ? "Skanuję..." : "Scanning...").start();

  const home = homedir();
  const searchDirs = [
    join(home, "Desktop"),
    join(home, "Documents"),
    join(home, "Projects"),
    join(home, "Code"),
    join(home, "dev"),
    join(home, "repos"),
    join(home, "work"),
    process.cwd(),
  ];

  const found: FoundConfig[] = [];

  for (const baseDir of searchDirs) {
    await scanDir(baseDir, found, 0, 3); // max 3 levels deep
  }

  // Also check global Claude Code config
  const globalClaude = join(home, ".claude", "CLAUDE.md");
  try {
    const s = await stat(globalClaude);
    found.push({
      type: "Claude Code (global)",
      path: globalClaude,
      projectDir: join(home, ".claude"),
      size: s.size,
    });
  } catch {
    // ENOENT expected — file may not exist
  }

  spin.succeed(`${found.length} ${pl ? "plików znalezionych" : "files found"}`);

  if (found.length === 0) {
    console.log(DIM(pl
      ? "\n  Nie znalazłem żadnych plików AI. Uruchom `meport deploy` w katalogu projektu."
      : "\n  No AI config files found. Run `meport deploy` in your project directory."));
    return;
  }

  // Group by project
  const projects = new Map<string, FoundConfig[]>();
  for (const f of found) {
    const existing = projects.get(f.projectDir) ?? [];
    existing.push(f);
    projects.set(f.projectDir, existing);
  }

  console.log();
  for (const [dir, configs] of projects) {
    const projectName = dir.split("/").pop() ?? dir;
    console.log(`  ${BOLD(projectName)} ${DIM(dir)}`);
    for (const c of configs) {
      console.log(`    ${CYAN(c.type)} → ${c.path.replace(dir + "/", "")} ${DIM(`(${c.size}b)`)}`);
    }
    console.log();
  }

  // Offer to update
  const update = await confirm({
    message: pl
      ? `Chcesz zaktualizować te pliki Twoim profilem meport?`
      : `Want to update these files with your meport profile?`,
    default: false,
  });

  if (update) {
    // Track all discovered projects
    for (const dir of projects.keys()) {
      await addProject(dir);
    }
    console.log(
      GREEN("  ✓ ") +
      `${projects.size} ${pl ? "projektów dodanych" : "projects tracked"}.` +
      DIM(pl ? " Uruchom `meport deploy --global` żeby zaktualizować." : " Run `meport deploy --global` to update all.")
    );
  }

  console.log();
}

async function scanDir(
  dir: string,
  found: FoundConfig[],
  depth: number,
  maxDepth: number
): Promise<void> {
  if (depth > maxDepth) return;

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden dirs (except .cursor, .github)
      if (entry.isDirectory()) {
        const name = entry.name;
        if (name === "node_modules" || name === ".git" || name === "dist" || name === "build") continue;
        if (name.startsWith(".") && name !== ".cursor" && name !== ".github") continue;

        // Check for AI config dirs
        for (const configDir of AI_CONFIG_DIRS) {
          if (name === configDir.dir.split("/")[0]) {
            const targetDir = join(dir, configDir.dir);
            if (configDir.file) {
              // Exact filename match
              const configPath = join(targetDir, configDir.file);
              try {
                const s = await stat(configPath);
                found.push({ type: configDir.type, path: configPath, projectDir: dir, size: s.size });
              } catch {}
            } else if (configDir.ext) {
              // Extension match — list dir and find matching files
              try {
                const dirEntries = await readdir(targetDir);
                for (const f of dirEntries) {
                  if (f.endsWith(configDir.ext)) {
                    const configPath = join(targetDir, f);
                    try {
                      const s = await stat(configPath);
                      found.push({ type: configDir.type, path: configPath, projectDir: dir, size: s.size });
                    } catch {}
                  }
                }
              } catch {}
            }
          }
        }

        // Recurse
        await scanDir(join(dir, name), found, depth + 1, maxDepth);
      }

      // Check for AI config files
      if (entry.isFile()) {
        for (const configFile of AI_CONFIG_FILES) {
          if (entry.name === configFile.name) {
            try {
              const fullPath = join(dir, entry.name);
              const s = await stat(fullPath);
              found.push({
                type: configFile.type,
                path: fullPath,
                projectDir: dir,
                size: s.size,
              });
            } catch {}
          }
        }
      }
    }
  } catch {
    // Permission denied or doesn't exist
  }
}
