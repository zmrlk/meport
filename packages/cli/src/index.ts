#!/usr/bin/env node

/**
 * Meport CLI — npx meport
 *
 * Your AI doesn't know you. Fix that in 5 minutes.
 */

import { Command } from "commander";
import { profileCommand } from "./commands/profile.js";
import { profileV2Command } from "./commands/profile-v2.js";
import { exportCommand } from "./commands/export.js";
import { viewCommand } from "./commands/view.js";
import { syncCommand } from "./commands/sync.js";
import { updateCommand } from "./commands/update.js";
import { continueCommand } from "./commands/continue.js";
import { configCommand } from "./commands/config.js";
import { editCommand } from "./commands/edit.js";
import { profileAICommand } from "./commands/profile-ai.js";
import { demoCommand } from "./commands/demo.js";
import { importCommand } from "./commands/import-profile.js";
import { refreshCommand } from "./commands/refresh.js";
import { deployCommand } from "./commands/deploy.js";
import { cardCommand } from "./commands/card.js";
import { reportCommand } from "./commands/report.js";
import { historyCommand } from "./commands/history.js";
import { projectsCommand } from "./commands/projects.js";
import { discoverCommand } from "./commands/discover.js";
import { shellCommand } from "./commands/shell.js";
import {
  packsListCommand,
  packsAddCommand,
  packsRemoveCommand,
} from "./commands/packs.js";

process.on('unhandledRejection', (err) => {
  console.error('\n  Unexpected error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

const program = new Command();

program
  .name("meport")
  .description("Your AI doesn't know you. Fix that in 5 minutes.")
  .version("0.1.6");

program
  .command("profile")
  .description("Start profiling — one conversation, full AI profile")
  .option("-o, --output <path>", "Output file path", "./meport-profile.json")
  .option("-e, --export-dir <path>", "Auto-export to directory")
  .option("-l, --lang <locale>", "Language for questions (en, pl)")
  .option("-s, --scan <paths...>", "Scan files or folders for profile data")
  .option("-q, --quick", "Quick mode — key questions only, instant profile")
  .option("--ai", "AI-driven conversational profiling (requires API key)")
  .action(async (options) => {
    if (options.ai) {
      await profileAICommand(options);
    } else {
      // Auto-detect: if AI is configured, suggest AI mode
      const { loadConfig } = await import("./commands/config.js");
      const config = await loadConfig();
      if (config.ai?.provider && !options.quick) {
        const { confirm } = await import("@inquirer/prompts");
        const useAI = await confirm({
          message: config.ai.provider === "ollama"
            ? "AI configured (Ollama). Use AI-driven interview?"
            : `AI configured (${config.ai.provider}). Use AI-driven interview?`,
          default: true,
        });
        if (useAI) {
          await profileAICommand(options);
          return;
        }
      }
      await profileV2Command(options);
    }
  });

program
  .command("profile-legacy", { hidden: true })
  .description("Legacy tier-based profiling (deprecated)")
  .option("-t, --track <track>", "Track: personal or business", "personal")
  .option("-o, --output <path>", "Output file path", "./meport-profile.json")
  .option("--tier <tier>", "Start from specific tier (0-8)")
  .action(profileCommand);

program
  .command("export")
  .description("Export your profile to a specific platform")
  .argument("[platform]", "Target platform (chatgpt, claude, cursor, etc.)")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .option("-o, --output <path>", "Output file path")
  .option("-a, --all", "Export to all available platforms")
  .option("-c, --copy", "Copy export to clipboard (single platform)")
  .option("--legacy", "Use legacy description-based compilers")
  .option("-l, --lang <locale>", "Language for UI (en, pl)")
  .action(exportCommand);

program
  .command("sync", { hidden: true })
  .description("Sync profile to platform configs (Claude Code, Cursor, Ollama)")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .option("-c, --copy <platform>", "Copy export to clipboard")
  .option("-a, --all", "Sync all + show clipboard targets")
  .action(syncCommand);

program
  .command("update", { hidden: true })
  .description("Quick tune-up — confirm key settings, re-sync")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .action(updateCommand);

program
  .command("continue", { hidden: true })
  .description("Resume an interrupted profiling session")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .action(continueCommand);

program
  .command("view")
  .description("View your profile summary")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .option("-l, --lang <locale>", "Language (en, pl)")
  .action(viewCommand);

program
  .command("import")
  .description("Import and upgrade existing custom instructions from ChatGPT/Claude/Cursor")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .option("-l, --lang <locale>", "Language (en, pl)")
  .option("-f, --file <path>", "Import from file")
  .action(importCommand);

program
  .command("discover")
  .description("Find existing AI config files (CLAUDE.md, .cursorrules, etc.) on your computer")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .option("-l, --lang <locale>", "Language (en, pl)")
  .action(discoverCommand);

program
  .command("projects")
  .description("Manage tracked projects for multi-deploy")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .option("-l, --lang <locale>", "Language (en, pl)")
  .action(projectsCommand);

program
  .command("deploy")
  .description("Push profile to all platforms (Cursor, Claude Code, Copilot, Windsurf + clipboard)")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .option("-l, --lang <locale>", "Language (en, pl)")
  .option("-a, --all", "Deploy to all without asking")
  .option("-g, --global", "Deploy to ALL tracked projects (from meport projects)")
  .action(deployCommand);

program
  .command("refresh")
  .description("Refresh your profile — detect changes, update dimensions, re-export")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .option("-l, --lang <locale>", "Language (en, pl)")
  .action(refreshCommand);

program
  .command("edit")
  .description("Edit individual profile dimensions")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .option("-l, --lang <locale>", "Language (en, pl)")
  .action(editCommand);

program
  .command("demo")
  .description("See how AI responds with vs without your profile")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .option("-l, --lang <locale>", "Language (en, pl)")
  .action(demoCommand);

program
  .command("config")
  .description("Configure AI provider and API keys")
  .action(configCommand);

program
  .command("card")
  .description("Show your visual personality card")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .action(cardCommand);

program
  .command("report")
  .description("Generate a Me Report — AI-powered personal insights")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .option("-l, --lang <locale>", "Language (en, pl)")
  .option("-o, --output <path>", "Save report to file")
  .action(reportCommand);

program
  .command("history")
  .description("Show profile version history and changes over time")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .option("-l, --lang <locale>", "Language (en, pl)")
  .action(historyCommand);

program
  .command("scan <paths...>")
  .description("Scan files/folders to preview what meport can detect")
  .option("-l, --lang <locale>", "Language (en, pl)")
  .action(async (paths: string[], opts: { lang?: string }) => {
    const pl = (opts.lang ?? "").startsWith("pl") || (!opts.lang && (process.env.LANG ?? "").startsWith("pl"));
    try {
      const { runFileScan, runSystemScan } = await import("@meport/core");
      const ora = (await import("ora")).default;

      const sysSpinner = ora(pl ? "Skanuję system..." : "System scan...").start();
      const sysResult = await runSystemScan(process.cwd());
      sysSpinner.succeed(`${sysResult.context.dimensions.size} ${pl ? "wymiarów systemowych" : "system dimensions"}`);

      const fileSpinner = ora(pl ? "Skanuję pliki..." : "File scan...").start();
      const fileResult = await runFileScan({ paths });
      fileSpinner.succeed(`${fileResult.context.dimensions.size} ${pl ? "wymiarów z" : "file dimensions from"} ${fileResult.sources.length} ${pl ? "plików" : "files"}`);

      const allDims = new Map([...sysResult.context.dimensions, ...fileResult.context.dimensions]);

      if (allDims.size === 0) {
        console.log(pl ? "\n  Nic nie wykryto." : "\n  No dimensions detected.");
        return;
      }

      console.log(pl ? "\n  Wykryto:\n" : "\n  Detected:\n");
      for (const [dim, val] of allDims) {
        if (dim.startsWith("_")) continue;
        console.log(`    ${dim}: ${val.value} (${val.source})`);
      }
      console.log(`\n  ${pl ? "Użyj:" : "Use:"} meport profile --scan ${paths.join(" ")}\n`);
    } catch (err) {
      console.error("\n  Scan failed:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// ─── Pack management ────────────────────────────────────
const packsCmd = program
  .command("packs")
  .description("Manage profile packs (add, remove, list)");

packsCmd
  .command("list")
  .description("Show available packs and their status")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .option("-l, --lang <locale>", "Language (en, pl)")
  .action(packsListCommand);

packsCmd
  .command("add <pack>")
  .description("Add a pack to your profile")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .option("-l, --lang <locale>", "Language (en, pl)")
  .action(packsAddCommand);

packsCmd
  .command("remove <pack>")
  .description("Remove a pack from your profile")
  .option("-p, --profile <path>", "Profile JSON path", "./meport-profile.json")
  .option("-l, --lang <locale>", "Language (en, pl)")
  .action(packsRemoveCommand);

program
  .command("deepen")
  .description("Go deeper — targeted questions about shallow areas of your profile")
  .option("-p, --profile <path>", "Profile path", "./meport-profile.json")
  .option("-l, --lang <locale>", "Language (en, pl)")
  .action(async (opts) => {
    const { deepenCommand } = await import("./commands/deepen.js");
    await deepenCommand(opts);
  });

program
  .command("feedback")
  .description("Rate how well AI responds with your profile")
  .option("-p, --profile <path>", "Profile path", "./meport-profile.json")
  .option("-l, --lang <locale>", "Language (en, pl)")
  .action(async (opts) => {
    const { feedbackCommand } = await import("./commands/feedback.js");
    await feedbackCommand(opts);
  });

// ─── Default: interactive shell ─────────────────────────
program
  .action(async () => {
    await shellCommand({
      profile: "./meport-profile.json",
    });
  });

program.parse();
