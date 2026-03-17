/**
 * meport export — Export profile to platform-specific formats
 *
 * Uses rule-based compilers (v2) by default.
 * Falls back to legacy description-based compilers with --legacy flag.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { copyToClipboard } from "../utils/clipboard.js";
import ora from "ora";
import {
  getCompiler,
  getAvailableCompilers,
  compileAll,
  getRuleCompiler,
  getAvailableRuleCompilers,
  compileAllRules,
  loadPacks,
  collectPackExportRules,
  getAvailablePackIds,
  type PersonaProfile,
  type PlatformId,
} from "@meport/core";
import {
  banner,
  exportResult,
  GREEN,
  BOLD,
  CYAN,
  DIM,
  RED,
  YELLOW,
} from "../ui/display.js";
import { checkFreshness } from "../ui/freshness.js";

interface ExportOptions {
  profile: string;
  output?: string;
  all?: boolean;
  legacy?: boolean;
  copy?: boolean;
  lang?: string;
}

export async function exportCommand(
  platform: string | undefined,
  options: ExportOptions
): Promise<void> {
  const pl = (options.lang ?? "en").toLowerCase() === "pl";

  // Load profile
  let profileData: PersonaProfile;
  try {
    const raw = await readFile(options.profile, "utf-8");
    profileData = JSON.parse(raw) as PersonaProfile;
  } catch {
    console.log(
      RED("✗ ") +
        (pl ? `Nie można odczytać profilu z ${options.profile}` : `Could not read profile from ${options.profile}`)
    );
    console.log(
      DIM("  " + (pl ? "Uruchom " : "Run ")) +
        CYAN("meport profile") +
        DIM(pl ? " najpierw, żeby go utworzyć." : " first to create one.")
    );
    return;
  }

  // Freshness nudge
  checkFreshness(profileData.updated_at);

  // Legacy mode
  if (options.legacy) {
    return exportLegacy(platform, profileData, options, pl);
  }

  // Load pack export rules for rule-based compilation
  const packExportRules = await loadAllPackExportRules();

  // Export all platforms (rule-based)
  if (options.all) {
    banner();
    const spinner = ora(pl ? "Generuję eksporty..." : "Generating rule-based exports...").start();

    const results = compileAllRules(profileData, packExportRules);
    spinner.succeed(pl ? `Wyeksportowano na ${results.size} platform` : `Exported to ${results.size} platforms`);

    const outDir = options.output ?? "./meport-exports";
    await mkdir(outDir, { recursive: true });

    for (const [id, result] of results) {
      const filePath = join(outDir, result.filename);
      await writeFile(filePath, result.content, "utf-8");

      exportResult(
        id,
        result.filename,
        result.charCount,
        result.dimensionsCovered,
        result.dimensionsOmitted
      );
    }

    console.log();
    console.log(
      GREEN("✓ ") +
        BOLD(pl ? `Eksporty zapisane w ${CYAN(outDir)}/` : `All exports saved to ${CYAN(outDir)}/`)
    );
    console.log();
    return;
  }

  // Single platform export
  if (!platform) {
    console.log(BOLD((pl ? "Dostępne platformy:" : "Available export targets:") + "\n"));

    console.log(DIM("  " + (pl ? "Oparte na regułach (zalecane):" : "Rule-based (recommended):")));
    const ruleCompilers = getAvailableRuleCompilers();
    for (const id of ruleCompilers) {
      console.log(`    ${CYAN(id)}`);
    }

    console.log(DIM("\n  " + (pl ? "Starsze (oparte na opisie):" : "Legacy (description-based):")));
    const legacyCompilers = getAvailableCompilers();
    for (const id of legacyCompilers) {
      if (!ruleCompilers.includes(id)) {
        console.log(`    ${DIM(id)}`);
      }
    }

    console.log();
    console.log(
      DIM("Usage: ") + CYAN("meport export <platform>")
    );
    console.log(
      DIM("  e.g. ") + CYAN("meport export chatgpt")
    );
    console.log(
      DIM("  or   ") + CYAN("meport export --all")
    );
    return;
  }

  // Compile for specific platform — prefer rule-based
  try {
    const ruleCompilers = getAvailableRuleCompilers();

    if (ruleCompilers.includes(platform as PlatformId)) {
      const compiler = getRuleCompiler(platform as PlatformId);
      if ("setPackExportRules" in compiler) {
        (compiler as any).setPackExportRules(packExportRules);
      }
      const result = compiler.compile(profileData);
      await outputResult(platform, result, options, pl);
    } else {
      // Fall back to legacy
      const compiler = getCompiler(platform as PlatformId);
      const result = compiler.compile(profileData);
      await outputResult(platform, result, options, pl);
    }
  } catch (err) {
    const available = getAvailableRuleCompilers().concat(
      getAvailableCompilers().filter(id => !getAvailableRuleCompilers().includes(id))
    );
    console.log(RED("✗ ") + (pl ? `Nieznana platforma "${platform}". Dostępne: ` : `Unknown platform "${platform}". Available: `) + available.join(", "));
    return;
  }
}

async function outputResult(
  platform: string,
  result: { content: string; charCount: number; dimensionsCovered: number; dimensionsOmitted: number; filename: string; instructions: string },
  options: ExportOptions,
  pl = false
): Promise<void> {
  if (options.output) {
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output!, result.content, "utf-8");
    exportResult(
      platform,
      options.output,
      result.charCount,
      result.dimensionsCovered,
      result.dimensionsOmitted
    );
  } else if (options.copy) {
    // Copy to clipboard
    try {
      copyToClipboard(result.content);
      console.log(GREEN("\n  ✓ ") + (pl ? `Skopiowano do schowka! (${result.charCount} znaków)` : `Copied to clipboard! (${result.charCount} chars)`));
    } catch {
      // Fallback for non-macOS
      console.log();
      console.log(result.content);
      console.log(DIM("\n  " + (pl ? "(schowek niedostępny — skopiuj ręcznie)" : "(clipboard not available — copy manually)")));
    }
  } else {
    console.log();
    console.log(result.content);
    console.log();
    console.log(DIM("─".repeat(50)));
    console.log(
      DIM(pl
        ? `${result.charCount} znaków | ${result.dimensionsCovered} wymiarów`
        : `${result.charCount} chars | ${result.dimensionsCovered} dimensions`)
    );
  }

  console.log();
  console.log(YELLOW(pl ? "Jak zastosować:" : "How to apply:"));
  console.log(DIM(result.instructions));
  console.log();
}

async function exportLegacy(
  platform: string | undefined,
  profileData: PersonaProfile,
  options: ExportOptions,
  pl = false
): Promise<void> {
  if (options.all) {
    banner();
    const spinner = ora("Exporting (legacy)...").start();
    const results = compileAll(profileData);
    spinner.succeed(`Exported to ${results.size} platforms`);

    const outDir = options.output ?? "./meport-exports";
    await mkdir(outDir, { recursive: true });

    for (const [id, result] of results) {
      const filePath = join(outDir, result.filename);
      await writeFile(filePath, result.content, "utf-8");
      exportResult(id, result.filename, result.charCount, result.dimensionsCovered, result.dimensionsOmitted);
    }

    console.log();
    console.log(GREEN("✓ ") + BOLD(`Saved to ${CYAN(outDir)}/`));
    console.log();
    return;
  }

  if (!platform) {
    const available = getAvailableCompilers();
    console.log(BOLD("Legacy compilers:\n"));
    for (const id of available) {
      console.log(`  ${CYAN(id)}`);
    }
    return;
  }

  const compiler = getCompiler(platform as PlatformId);
  const result = compiler.compile(profileData);
  await outputResult(platform, result, options, pl);
}

async function loadAllPackExportRules(): Promise<Map<string, string>> {
  try {
    const allPackIds = getAvailablePackIds();
    const packs = await loadPacks(allPackIds);
    return collectPackExportRules(packs);
  } catch {
    return new Map();
  }
}
