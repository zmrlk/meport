/**
 * meport config — Manage API keys and settings.
 * Stores config in ~/.meport/config.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { select, input, password, confirm } from "@inquirer/prompts";
import { GREEN, BOLD, CYAN, DIM, RED, YELLOW } from "../ui/display.js";
import type { AIConfig } from "@meport/core";

const CONFIG_DIR = join(homedir(), ".meport");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function getModelChoices(pl: boolean): Record<string, { name: string; value: string }[]> {
  return {
    claude: [
      { name: pl ? "Claude Opus 4.6 — najlepsza jakość (domyślny)" : "Claude Opus 4.6 — best quality (default)", value: "claude-opus-4-20250514" },
      { name: pl ? "Claude Sonnet 4 — szybszy, tańszy" : "Claude Sonnet 4 — faster, cheaper", value: "claude-sonnet-4-20250514" },
      { name: pl ? "Claude Haiku 4.5 — najtańszy" : "Claude Haiku 4.5 — cheapest", value: "claude-haiku-4-5-20251001" },
    ],
    openai: [
      { name: pl ? "GPT-5.4 — najlepsza jakość (domyślny)" : "GPT-5.4 — best quality (default)", value: "gpt-5.4" },
      { name: pl ? "GPT-4o — szybszy, tańszy" : "GPT-4o — faster, cheaper", value: "gpt-4o" },
      { name: pl ? "GPT-4o-mini — najtańszy" : "GPT-4o-mini — cheapest", value: "gpt-4o-mini" },
    ],
    gemini: [
      { name: pl ? "Gemini 3.1 Pro — najlepsza jakość (domyślny)" : "Gemini 3.1 Pro — best quality (default)", value: "gemini-3.1-pro" },
      { name: pl ? "Gemini 3.1 Flash-Lite — szybszy, tańszy/darmowy" : "Gemini 3.1 Flash-Lite — faster, cheaper/free", value: "gemini-3.1-flash-lite" },
    ],
    grok: [
      { name: pl ? "Grok 3 — najlepsza jakość (domyślny)" : "Grok 3 — best quality (default)", value: "grok-3" },
      { name: pl ? "Grok 3 Mini — tańszy" : "Grok 3 Mini — cheaper", value: "grok-3-mini" },
    ],
    openrouter: [
      { name: pl ? "Claude Opus 4.6 (domyślny)" : "Claude Opus 4.6 (default)", value: "anthropic/claude-opus-4" },
      { name: "Claude Sonnet 4", value: "anthropic/claude-sonnet-4" },
      { name: "GPT-5.4", value: "openai/gpt-5.4" },
      { name: pl ? "Inny (wpiszę)" : "Other (I'll type)", value: "_custom" },
    ],
  };
}

export interface MeportConfig {
  ai?: AIConfig;
}

export async function loadConfig(): Promise<MeportConfig> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function saveConfig(config: MeportConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
}

export async function configCommand(lang?: string): Promise<void> {
  const config = await loadConfig();
  const pl = (lang ?? "").startsWith("pl") || (!lang && (process.env.LANG ?? "").startsWith("pl"));

  console.log(BOLD(pl ? "\n⚙️  Ustawienia\n" : "\n⚙️  Settings\n"));

  if (config.ai?.provider) {
    console.log(`  AI: ${GREEN("✓")} ${config.ai.provider} (${config.ai.model ?? "default"})`);
    console.log(`  ${pl ? "Klucz" : "Key"}: ${config.ai.apiKey ? GREEN(pl ? "ustawiony" : "set") : RED(pl ? "brak" : "missing")}`);
  } else {
    console.log(`  AI: ${DIM(pl ? "nie skonfigurowane — dodaj klucz żeby odblokować AI profiling" : "not configured — add a key to unlock AI profiling")}`);
  }
  console.log();

  const hasExistingAI = !!config.ai?.provider;

  const choices: { name: string; value: string }[] = [];

  if (hasExistingAI) {
    choices.push(
      { name: pl ? "🔄 Zmień model" : "🔄 Change model", value: "model" },
      { name: pl ? "🔑 Zmień klucz API" : "🔑 Change API key", value: "key" },
      { name: pl ? "🔀 Zmień provider" : "🔀 Change provider", value: "ai" },
    );
  } else {
    choices.push(
      { name: pl ? "🧠 Dodaj klucz AI" : "🧠 Add AI key", value: "ai" },
    );
  }
  choices.push(
    { name: pl ? "🗑️  Resetuj" : "🗑️  Reset", value: "reset" },
    { name: DIM("buymeacoffee.com/zmrlk"), value: "coffee" },
    { name: pl ? "← Wróć" : "← Back", value: "done" },
  );

  const action = await select({
    message: pl ? "Co zrobić?" : "What to do?",
    choices,
  });

  switch (action) {
    case "model": {
      const prov = config.ai!.provider as string;
      const mchoices = getModelChoices(pl)[prov];
      if (mchoices) {
        const selected: string = await select({
          message: pl ? "Model:" : "Model:",
          choices: [
            ...mchoices,
            { name: pl ? "← Wróć" : "← Back", value: "__back__" },
          ],
        });
        if (selected === "__back__") break;
        if (selected === "_custom") {
          config.ai!.model = String(await input({ message: pl ? "Nazwa modelu:" : "Model name:" }));
        } else {
          config.ai!.model = selected;
        }
      } else {
        config.ai!.model = String(await input({ message: pl ? "Model:" : "Model:", default: config.ai!.model ?? "gpt-4o" }));
      }
      await saveConfig(config);
      console.log(GREEN(pl ? `  ✓ Model zmieniony na ${config.ai!.model}` : `  ✓ Model changed to ${config.ai!.model}`));
      break;
    }
    case "key": {
      const newKey = await password({
        message: `${config.ai!.provider} API key:`,
        mask: "*",
      });
      if (newKey.trim()) {
        config.ai!.apiKey = newKey.trim();
        await saveConfig(config);
        console.log(GREEN(pl ? "  ✓ Klucz zmieniony." : "  ✓ Key updated."));
        await testConnection(config, pl);
      }
      break;
    }
    case "ai":
      await configureAI(config, pl);
      break;
    case "reset":
      await saveConfig({});
      console.log(GREEN(pl ? "  ✓ Konfiguracja zresetowana." : "  ✓ Config reset."));
      break;
    case "coffee":
      try {
        const cp = await import("node:child_process");
        cp.spawn("open", ["https://buymeacoffee.com/zmrlk"], { detached: true, stdio: "ignore" }).unref();
      } catch {}
      console.log(GREEN(pl ? "  Dzięki! ☕" : "  Thanks! ☕"));
      break;
    case "done":
      break;
  }
}

async function configureAI(config: MeportConfig, pl = false): Promise<void> {
  const provider = await select({
    message: pl ? "Provider AI:" : "AI provider:",
    choices: [
      {
        name: pl ? "Claude (Anthropic) — najlepsza jakość" : "Claude (Anthropic) — best quality",
        value: "claude" as const,
      },
      {
        name: pl ? "OpenAI (GPT) — dobra jakość" : "OpenAI (GPT) — good quality",
        value: "openai" as const,
      },
      {
        name: pl ? "Gemini (Google) — dobra jakość, darmowy tier" : "Gemini (Google) — good quality, free tier",
        value: "gemini" as const,
      },
      {
        name: pl ? "Grok (xAI) — szybki, dobry do kodu" : "Grok (xAI) — fast, good for code",
        value: "grok" as const,
      },
      {
        name: pl ? "OpenRouter — dostęp do 200+ modeli, jeden klucz" : "OpenRouter — 200+ models, one key",
        value: "openrouter" as const,
      },
      {
        name: pl ? "Ollama (lokalne) — za darmo, offline" : "Ollama (local) — free, fully offline",
        value: "ollama" as const,
      },
      {
        name: pl ? "← Wróć" : "← Back",
        value: "_back" as any,
      },
    ],
  });

  if (provider === "_back") return;

  if (provider === "ollama") {
    const url = await input({
      message: "Ollama URL:",
      default: "http://localhost:11434",
    });
    const model = await input({
      message: pl ? "Model:" : "Model:",
      default: "llama3.1",
    });

    config.ai = { provider: "ollama", baseUrl: url, model };
    await saveConfig(config);
    console.log(GREEN(pl ? "\n  ✓ Ollama skonfigurowane. Upewnij się że działa!" : "\n  ✓ Ollama configured. Make sure it's running!"));

    // Test connection
    await testConnection(config, pl);
    return;
  }

  const providerLabels: Record<string, string> = {
    claude: "Anthropic",
    openai: "OpenAI",
    gemini: "Google (Gemini)",
    grok: "xAI (Grok)",
    openrouter: "OpenRouter",
  };

  const keyUrls: Record<string, string> = {
    claude: "https://console.anthropic.com/settings/keys",
    openai: "https://platform.openai.com/api-keys",
    gemini: "https://aistudio.google.com/apikey",
    grok: "https://console.x.ai",
    openrouter: "https://openrouter.ai/keys",
  };

  const keyHints: Record<string, string> = {
    claude: "sk-ant-...",
    openai: "sk-...",
    gemini: "AIza...",
    grok: "xai-...",
    openrouter: "sk-or-...",
  };

  // Open browser with API key page
  const url = keyUrls[provider];
  if (url) {
    console.log();
    console.log(pl
      ? `  ${BOLD("Potrzebujesz klucz API.")} Otwieram stronę w przeglądarce...`
      : `  ${BOLD("You need an API key.")} Opening in browser...`);
    console.log(`  ${CYAN(url)}`);
    console.log(pl
      ? DIM("  Skopiuj klucz i wklej poniżej.\n")
      : DIM("  Copy the key and paste below.\n"));

    try {
      const cp = await import("node:child_process");
      const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      cp.spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
    } catch { /* user can open manually */ }
  }

  const bestModels: Record<string, string> = {
    claude: "claude-opus-4-20250514",
    openai: "gpt-5.4",
    gemini: "gemini-3.1-pro",
    grok: "grok-3",
    openrouter: "anthropic/claude-opus-4",
  };

  const apiKey = await password({
    message: `${providerLabels[provider]} API key (${keyHints[provider]}):`,
    mask: "*",
  });

  if (!apiKey.trim()) {
    console.log(RED(pl ? "  ✗ Brak klucza." : "  ✗ No key provided."));
    return;
  }

  // Auto-select best model, offer change
  let model = bestModels[provider] ?? "gpt-4o";
  console.log(DIM(pl ? `  Model: ${model} (najlepsza jakość)` : `  Model: ${model} (best quality)`));

  const changeModel = await confirm({
    message: pl ? "Zmienić model?" : "Change model?",
    default: false,
  });

  if (changeModel) {
    const choices = getModelChoices(pl)[provider];
    if (choices) {
      const selected = await select({
        message: pl ? "Model:" : "Model:",
        choices,
      });
      if (selected === "_custom") {
        model = await input({ message: pl ? "Nazwa modelu:" : "Model name:" });
      } else {
        model = selected;
      }
    } else {
      model = await input({ message: pl ? "Model:" : "Model:", default: "gpt-4o" });
    }
  }

  config.ai = { provider, apiKey: apiKey.trim(), model };
  await saveConfig(config);
  console.log(GREEN(pl ? `\n  ✓ ${provider} skonfigurowane.` : `\n  ✓ ${provider} configured.`));

  // Warn about weak models
  const weakModels = ["gpt-4o-mini", "gpt-3.5", "llama3.1", "grok-3-mini"];
  if (weakModels.some(m => model.includes(m))) {
    console.log(YELLOW(pl
      ? `  ⚠ ${model} da OK wyniki. Dla najlepszej jakości użyj GPT-4o, Claude Sonnet lub Grok 3.`
      : `  ⚠ ${model} gives OK results. For best quality use GPT-4o, Claude Sonnet, or Grok 3.`));
  }

  // Test connection
  await testConnection(config, pl);
}

async function testConnection(config: MeportConfig, pl: boolean): Promise<void> {
  if (!config.ai) return;

  const ora = (await import("ora")).default;
  const spin = ora(pl ? "Testuję połączenie..." : "Testing connection...").start();

  try {
    const { createAIClient } = await import("@meport/core");
    const client = createAIClient(config.ai);
    await client.generate("Say OK");
    spin.succeed(pl ? "Połączenie działa!" : "Connection works!");
  } catch (err: any) {
    spin.fail(pl ? `Błąd: ${err.message}` : `Error: ${err.message}`);
    console.log(DIM(pl ? "  Sprawdź klucz API i spróbuj ponownie." : "  Check your API key and try again."));
  }
}

function showConfig(config: MeportConfig): void {
  console.log(DIM("\n  ~/.meport/config.json:\n"));
  const display = { ...config };
  if (display.ai?.apiKey) {
    display.ai = { ...display.ai, apiKey: display.ai.apiKey.slice(0, 8) + "..." };
  }
  console.log("  " + JSON.stringify(display, null, 2).split("\n").join("\n  "));
  console.log();
}
