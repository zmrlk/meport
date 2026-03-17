/**
 * meport interactive shell — clean, minimal flow.
 *
 * First run:  scan → summary → questions → profile → export
 * Main menu:  view | export | refresh | reset | settings | exit
 */

import { readFile, writeFile } from "node:fs/promises";
import { select, confirm } from "@inquirer/prompts";
import { GREEN, BOLD, CYAN, DIM, RED, YELLOW } from "../ui/display.js";
import { viewCommand } from "./view.js";
import { exportCommand } from "./export.js";
import { configCommand, loadConfig } from "./config.js";
import { deployCommand } from "./deploy.js";
import { refreshCommand } from "./refresh.js";
const loadProfileV2 = () => import("./profile-v2.js").then(m => m.profileV2Command);
import type { PersonaProfile } from "@meport/core";

interface ShellOptions {
  profile: string;
  lang?: string;
}

export async function shellCommand(options: ShellOptions): Promise<void> {
  const pl = options.lang === "pl" || (!options.lang && (process.env.LANG || "").startsWith("pl"));

  // Check if profile exists
  let hasProfile = false;
  try {
    const raw = await readFile(options.profile, "utf-8");
    const profile = JSON.parse(raw) as PersonaProfile;
    hasProfile = !!profile.schema_version;
  } catch {
    hasProfile = false;
  }

  if (!hasProfile) {
    await firstRun(options, pl);
  } else {
    await mainMenu(options, pl);
  }
}

// ━━━ FIRST RUN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function firstRun(options: ShellOptions, pl: boolean): Promise<void> {
  console.log(
    pl
      ? BOLD("\n  meport") + " — Twoje AI Cię nie zna. Naprawmy to.\n"
      : BOLD("\n  meport") + " — Your AI doesn't know you. Let's fix that.\n"
  );

  const config = await loadConfig();
  const hasAI = !!config.ai?.provider;

  if (!hasAI) {
    console.log(
      pl
        ? DIM("  Tip: Dodaj klucz API (OpenAI, Claude, Grok) w Ustawieniach\n"
          + "  żeby odblokować tryb AI — skanuje komputer, personalizuje pytania,\n"
          + "  i generuje 3x lepsze profile. Koszt: ~$0.10 za profil.\n")
        : DIM("  Tip: Add an API key (OpenAI, Claude, Grok) in Settings\n"
          + "  to unlock AI mode — scans your computer, personalizes questions,\n"
          + "  and generates 3x better profiles. Cost: ~$0.10 per profile.\n")
    );
  }

  const action = await select({
    message: pl ? "Jak chcesz stworzyć profil?" : "How to create your profile?",
    choices: [
      {
        name: hasAI
          ? (pl ? "🚀 AI — skan kompa + 10 pytań + AI eksport (~5 min, najlepsza jakość)"
              : "🚀 AI — computer scan + 10 questions + AI export (~5 min, best quality)")
          : (pl ? "🚀 AI — wymaga klucza API (dodaj w Ustawieniach)"
              : "🚀 AI — needs API key (add in Settings)"),
        value: "ai",
        disabled: !hasAI,
      },
      {
        name: pl
          ? "📋 Quiz — 4 części, ~40 pytań (~10 min, dobra jakość bez AI)"
          : "📋 Quiz — 4 sections, ~40 questions (~10 min, good quality without AI)",
        value: "quiz",
      },
      {
        name: pl ? "📥 Importuj istniejące instrukcje" : "📥 Import existing instructions",
        value: "import",
      },
      {
        name: hasAI
          ? (pl ? `⚙️  Ustawienia (${config.ai!.provider} ✓)` : `⚙️  Settings (${config.ai!.provider} ✓)`)
          : (pl ? "⚙️  Ustawienia (klucze API)" : "⚙️  Settings (API keys)"),
        value: "settings",
      },
      { name: pl ? "❌ Wyjdź" : "❌ Exit", value: "exit" },
    ],
  });

  if (action === "ai") {
    const { profileAICommand } = await import("./profile-ai.js");
    await profileAICommand({ output: options.profile, lang: options.lang });
    await mainMenu(options, pl);
  } else if (action === "quiz") {
    const profileV2Command = await loadProfileV2();
    await profileV2Command({ output: options.profile, lang: options.lang });
    try {
      const raw = await readFile(options.profile, "utf-8");
      JSON.parse(raw);
    } catch { return; }
    await mainMenu(options, pl);
  } else if (action === "import") {
    const { importCommand } = await import("./import-profile.js");
    await importCommand({ profile: options.profile, lang: options.lang });
    try {
      const raw = await readFile(options.profile, "utf-8");
      JSON.parse(raw);
    } catch { return; }
    await mainMenu(options, pl);
  } else if (action === "settings") {
    await configCommand(options.lang);
    await firstRun(options, pl);
  }
}

// ━━━ MAIN MENU ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function mainMenu(options: ShellOptions, pl: boolean): Promise<void> {
  process.on("SIGINT", () => { console.log(pl ? "\n  Do zobaczenia!" : "\n  See you!"); process.exit(0); });

  // Show quick summary
  try {
    const raw = await readFile(options.profile, "utf-8");
    const profile = JSON.parse(raw) as PersonaProfile;
    const dimCount = Object.keys(profile.explicit).filter(k => !k.startsWith("_")).length;
    const name = profile.explicit?.["identity.preferred_name"]?.value ?? "";
    console.log();
    console.log(`  ${BOLD("meport")} ${name ? `— ${name}` : ""} ${DIM(`(${dimCount} dims, ${profile.completeness ?? 0}%)`)}`);
  } catch { /* ignore */ }

  while (true) {
    console.log();
    const action = await select({
      message: pl ? "Co dalej?" : "What next?",
      choices: [
        { name: pl ? "👁️  Zobacz profil" : "👁️  View profile", value: "view" },
        { name: pl ? "📦 Eksportuj / Deploy" : "📦 Export / Deploy", value: "export" },
        { name: pl ? "🔄 Odśwież profil" : "🔄 Refresh profile", value: "refresh" },
        { name: pl ? "✏️  Popraw profil" : "✏️  Edit profile", value: "edit" },
        { name: pl ? "🗑️  Zacznij od nowa" : "🗑️  Start over", value: "reset" },
        { name: pl ? "⚙️  Ustawienia" : "⚙️  Settings", value: "settings" },
        { name: pl ? "❌ Wyjdź" : "❌ Exit", value: "exit" },
      ],
    });

    switch (action) {
      case "view":
        await viewCommand({ profile: options.profile });
        break;

      case "export": {
        const exportAction = await select({
          message: pl ? "Gdzie eksportować?" : "Where to export?",
          choices: [
            { name: pl ? "🚀 Deploy do lokalnych narzędzi (Cursor, Claude Code, Copilot...)" : "🚀 Deploy to local tools (Cursor, Claude Code, Copilot...)", value: "deploy" },
            { name: pl ? "📦 Eksportuj do plików" : "📦 Export to files", value: "files" },
            { name: pl ? "📋 Kopiuj do schowka (ChatGPT, Claude...)" : "📋 Copy to clipboard (ChatGPT, Claude...)", value: "copy" },
            { name: pl ? "← Wróć" : "← Back", value: "back" },
          ],
        });
        if (exportAction === "deploy") {
          await deployCommand({ profile: options.profile, lang: options.lang });
        } else if (exportAction === "files") {
          await exportCommand("", { profile: options.profile, all: true });
        } else if (exportAction === "copy") {
          const platform = await select({
            message: pl ? "Dla jakiej platformy?" : "Which platform?",
            choices: [
              { name: "ChatGPT", value: "chatgpt" },
              { name: "Claude", value: "claude" },
              { name: "Gemini", value: "gemini" },
              { name: "Grok", value: "grok" },
              { name: "Perplexity", value: "perplexity" },
              { name: pl ? "← Wróć" : "← Back", value: "back" },
            ],
          });
          if (platform !== "back") {
            await exportCommand(platform, { profile: options.profile, copy: true });
          }
        }
        break;
      }

      case "refresh":
        await refreshCommand({ profile: options.profile, lang: options.lang });
        break;

      case "edit": {
        const { editCommand } = await import("./edit.js");
        await editCommand({ profile: options.profile });
        break;
      }

      case "reset": {
        const sure = await confirm({
          message: pl ? "Na pewno usunąć profil i zacząć od nowa?" : "Delete profile and start over?",
          default: false,
        });
        if (sure) {
          const { unlink } = await import("node:fs/promises");
          try { await unlink(options.profile); } catch { /* ok */ }
          console.log(GREEN(pl ? "  ✓ Profil usunięty." : "  ✓ Profile deleted."));
          await firstRun({ profile: options.profile, lang: options.lang }, pl);
          return;
        }
        break;
      }

      case "settings":
        await configCommand(options.lang);
        break;

      case "exit":
        console.log(pl ? "\n  Do zobaczenia!\n" : "\n  See you!\n");
        return;
    }
  }
}
