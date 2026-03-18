/**
 * meport demo — Before/after simulation
 *
 * Shows the user HOW their AI will respond differently
 * with their meport profile vs without.
 *
 * This is the "holy shit" moment that sells the product.
 */

import { readFile } from "node:fs/promises";
import ora from "ora";
import { select, input } from "@inquirer/prompts";
import {
  collectRules,
  collectPackExportRules,
  loadPacks,
  getAvailablePackIds,
  createAIClient,
  type PersonaProfile,
  type AIConfig,
} from "@meport/core";
import { GREEN, BOLD, CYAN, DIM, RED, YELLOW } from "../ui/display.js";
import { loadConfig } from "./config.js";

interface DemoOptions {
  profile: string;
  lang?: string;
}

const TEST_PROMPTS = {
  en: [
    "How do I sort an array in JavaScript?",
    "Give me feedback on this idea: a CLI tool that generates AI personalization profiles",
    "I'm overwhelmed with tasks. Help me prioritize.",
    "Explain what a closure is",
    "I need to learn Rust. Where do I start?",
  ],
  pl: [
    "Jak posortować tablicę w JavaScript?",
    "Daj mi feedback na ten pomysł: CLI do generowania profili personalizacji AI",
    "Mam za dużo zadań. Pomóż mi ustalić priorytety.",
    "Wyjaśnij czym jest closure",
    "Chcę się nauczyć Rusta. Od czego zacząć?",
  ],
};

export async function demoCommand(options: DemoOptions): Promise<void> {
  const pl = (options.lang ?? "").startsWith("pl") || (!options.lang && (process.env.LANG ?? "").startsWith("pl"));

  // Load profile
  let profile: PersonaProfile;
  try {
    const raw = await readFile(options.profile, "utf-8");
    profile = JSON.parse(raw) as PersonaProfile;
  } catch {
    console.log(RED("✗ ") + (pl ? "Brak profilu." : "No profile found."));
    return;
  }

  // Check AI config
  const config = await loadConfig();
  if (!config.ai?.provider) {
    console.log(RED("✗ ") + (pl ? "Brak konfiguracji AI. Uruchom: meport config" : "No AI configured. Run: meport config"));
    return;
  }

  const client = createAIClient(config.ai as AIConfig);

  // Collect rules
  let packRules = new Map<string, string>();
  try {
    const packs = await loadPacks(getAvailablePackIds());
    packRules = collectPackExportRules(packs);
  } catch {}
  const rules = collectRules(profile, packRules);
  const rulesText = rules.map((r, i) => `${i + 1}. ${r.rule}`).join("\n");

  // Pick or enter a test prompt
  const prompts = pl ? TEST_PROMPTS.pl : TEST_PROMPTS.en;

  while (true) {
    console.log(
      BOLD(pl ? "\n━━━ Demo: Przed vs Po ━━━\n" : "\n━━━ Demo: Before vs After ━━━\n")
    );
    console.log(
      DIM(pl
        ? "  Zobaczysz jak AI odpowiada BEZ i Z Twoim profilem.\n"
        : "  See how AI responds WITHOUT and WITH your profile.\n")
    );

    const choice = await select({
      message: pl ? "Wybierz pytanie testowe:" : "Pick a test prompt:",
      choices: [
        ...prompts.map((p) => ({ name: p, value: p })),
        { name: pl ? "✏️  Wpisz własne" : "✏️  Type your own", value: "__custom__" },
      ],
    });

    let testPrompt = choice;
    if (choice === "__custom__") {
      testPrompt = await input({
        message: pl ? "Twoje pytanie:" : "Your prompt:",
      });
    }

    if (!testPrompt.trim()) return;

    console.log();

    // ─── WITHOUT profile ────────────────────────────────
    const withoutSpin = ora(
      pl ? "🔴 Generuję odpowiedź BEZ profilu..." : "🔴 Generating response WITHOUT profile..."
    ).start();

    let withoutResponse: string;
    try {
      withoutResponse = await client.generate(
        `User asks: "${testPrompt}"\n\nRespond naturally as a helpful AI assistant.`
      );
      withoutSpin.succeed(pl ? "Bez profilu" : "Without profile");
    } catch (err: any) {
      withoutSpin.fail("AI error: " + err.message);
      return;
    }

    console.log(RED(`\n  ┌─ ${pl ? "BEZ meport" : "WITHOUT meport"} ─────────────────────────────────`));
    for (const line of withoutResponse.trim().split("\n").slice(0, 12)) {
      console.log(RED("  │ ") + line);
    }
    if (withoutResponse.split("\n").length > 12) {
      console.log(RED("  │ ") + DIM(`... (${withoutResponse.split("\n").length} lines total)`));
    }
    console.log(RED("  └────────────────────────────────────────────"));

    console.log();

    // ─── WITH profile ───────────────────────────────────
    const withSpin = ora(
      pl ? "🟢 Generuję odpowiedź Z profilem..." : "🟢 Generating response WITH profile..."
    ).start();

    const name = profile.explicit["identity.preferred_name"]?.value ?? "User";

    let withResponse: string;
    try {
      withResponse = await client.generate(
        `You are talking to ${name}. Follow these rules STRICTLY:\n\n${rulesText}\n\n---\n\nUser asks: "${testPrompt}"\n\nRespond following ALL rules above.`
      );
      withSpin.succeed(pl ? "Z profilem" : "With profile");
    } catch (err: any) {
      withSpin.fail("AI error: " + err.message);
      return;
    }

    console.log(GREEN(`\n  ┌─ ${pl ? "Z meport" : "WITH meport"} ──────────────────────────────────`));
    for (const line of withResponse.trim().split("\n").slice(0, 12)) {
      console.log(GREEN("  │ ") + line);
    }
    if (withResponse.split("\n").length > 12) {
      console.log(GREEN("  │ ") + DIM(`... (${withResponse.split("\n").length} lines total)`));
    }
    console.log(GREEN("  └────────────────────────────────────────────"));

    // ─── Comparison stats ───────────────────────────────
    const withoutLen = withoutResponse.length;
    const withLen = withResponse.length;
    const reduction = Math.round((1 - withLen / withoutLen) * 100);

    console.log();
    console.log(
      BOLD(pl ? "  Różnica:\n" : "  Difference:\n")
    );
    console.log(
      `  ${RED("Bez:")} ${withoutLen} ${pl ? "znaków" : "chars"}, ${withoutResponse.split("\n").length} ${pl ? "linii" : "lines"}`
    );
    console.log(
      `  ${GREEN("Z:")}   ${withLen} ${pl ? "znaków" : "chars"}, ${withResponse.split("\n").length} ${pl ? "linii" : "lines"}`
    );
    if (reduction > 0) {
      console.log(
        `  ${CYAN("→")}   ${reduction}% ${pl ? "krótsza odpowiedź" : "shorter response"}`
      );
    }
    console.log();

    // Offer another test
    const again = await select({
      message: pl ? "Co dalej?" : "What next?",
      choices: [
        { name: pl ? "🔄 Przetestuj inne pytanie" : "🔄 Try another prompt", value: "again" },
        { name: pl ? "✓ Wróć" : "✓ Done", value: "done" },
      ],
    });

    if (again !== "again") break;
  }
}
