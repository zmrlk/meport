/**
 * CLI Display Utilities
 *
 * Consistent formatting for the terminal UI.
 */

import chalk from "chalk";

export const BRAND = chalk.hex("#7C3AED"); // Purple
export const DIM = chalk.dim;
export const BOLD = chalk.bold;
export const GREEN = chalk.green;
export const YELLOW = chalk.yellow;
export const RED = chalk.red;
export const CYAN = chalk.cyan;

export function banner(pl = false): void {
  const tagline = pl ? " — Twój profil AI" : " — your AI profile";
  console.log();
  console.log(BRAND("  ┌─────────────────────────────────────┐"));
  console.log(BRAND("  │") + BOLD("  meport") + DIM(tagline) + BRAND("         │"));
  console.log(BRAND("  │") + DIM("  meport.app") + BRAND("                         │"));
  console.log(BRAND("  └─────────────────────────────────────┘"));
  console.log();
}

export function tierHeader(
  tier: number,
  name: string,
  intro: string
): void {
  console.log();
  console.log(BRAND(`━━━ Tier ${tier}: ${name} ━━━`));
  console.log(DIM(intro));
  console.log();
}

export function tierComplete(headline: string, body: string): void {
  console.log();
  console.log(GREEN("✓ ") + BOLD(headline));
  console.log(DIM(body));
  console.log();
}

export function questionProgress(
  index: number,
  total: number,
  tier: number
): string {
  return DIM(`[${tier}.${index}/${total}]`);
}

export function profileSummary(stats: {
  dimensions: number;
  tiers: number;
  completeness: number;
  compounds: number;
  contradictions: number;
}): void {
  console.log();
  console.log(BRAND("━━━ Profile Summary ━━━"));
  console.log(`  Dimensions:     ${BOLD(String(stats.dimensions))}`);
  console.log(`  Tiers:          ${BOLD(String(stats.tiers))}`);
  console.log(`  Completeness:   ${completenessBar(stats.completeness)}`);
  console.log(`  Compound:       ${BOLD(String(stats.compounds))} signals`);
  console.log(`  Contradictions: ${BOLD(String(stats.contradictions))}`);
  console.log();
}

export function completenessBar(pct: number): string {
  const clamped = Math.min(100, Math.max(0, pct));
  const filled = Math.round(clamped / 5);
  const empty = 20 - filled;
  const bar =
    GREEN("█".repeat(filled)) + DIM("░".repeat(empty));
  const color = pct >= 80 ? GREEN : pct >= 50 ? YELLOW : RED;
  return `${bar} ${color(pct + "%")}`;
}

// ─── Pack-Based Display ──────────────────────────────────

export function packHeader(
  packName: string,
  intro: string,
  sensitive: boolean,
  privacyNote?: string
): void {
  console.log();
  console.log(BRAND(`━━━ ${packName} ━━━`));
  console.log(DIM(intro));
  if (sensitive && privacyNote) {
    console.log(YELLOW("  🔒 " + privacyNote));
  }
  console.log();
}

export function packComplete(pack: string, answered: number, pl = false): void {
  console.log();
  console.log(GREEN("✓ ") + BOLD(pack) + DIM(pl ? ` — ${answered} pytań` : ` — ${answered} questions answered`));
}

export function packProgress(index: number, total: number, pack: string): string {
  return DIM(`[${pack} ${index}/${total}]`);
}

export function previewExport(
  dimensions: number,
  completeness: number,
  rules: number,
  pl = false
): void {
  console.log();
  console.log(BRAND(pl ? "━━━ Podgląd profilu ━━━" : "━━━ Profile Preview ━━━"));
  console.log(`  ${pl ? "Wymiary" : "Dimensions"}:   ${BOLD(String(dimensions))}`);
  console.log(`  ${pl ? "Kompletność" : "Completeness"}: ${completenessBar(completeness)}`);
  console.log(`  ${pl ? "Reguły" : "Export rules"}: ${BOLD(String(rules))}`);
  console.log();
  console.log(GREEN("  ✓ ") + (pl ? "Bazowy profil gotowy!" : "Your base profile is ready!"));
  console.log(DIM(pl ? "    Kontynuuj żeby pogłębić profil w wybranych pakietach.\n" : "    Keep going to deepen it across your selected packs.\n"));
}

export function finalSummary(stats: {
  dimensions: number;
  completeness: number;
  rules: number;
  packs: number;
  compounds: number;
}, pl = false): void {
  console.log();
  console.log(BRAND(pl ? "━━━ Profil końcowy ━━━" : "━━━ Final Profile ━━━"));
  console.log(`  ${pl ? "Wymiary" : "Dimensions"}:   ${BOLD(String(stats.dimensions))}`);
  console.log(`  ${pl ? "Pakiety" : "Packs"}:        ${BOLD(String(stats.packs))}`);
  console.log(`  ${pl ? "Reguły" : "Export rules"}: ${BOLD(String(stats.rules))}`);
  console.log(`  ${pl ? "Kompletność" : "Completeness"}: ${completenessBar(stats.completeness)}`);
  if (stats.compounds > 0) {
    console.log(`  ${pl ? "Złożone" : "Compound"}:     ${BOLD(String(stats.compounds))} ${pl ? "sygnałów" : "signals"}`);
  }
  console.log();
}

export function exportResult(
  platform: string,
  filename: string,
  chars: number,
  covered: number,
  omitted: number
): void {
  console.log();
  console.log(GREEN("✓ ") + BOLD(platform));
  console.log(`  File:       ${CYAN(filename)}`);
  console.log(`  Characters: ${chars.toLocaleString()}`);
  console.log(`  Dimensions: ${covered} included, ${DIM(omitted + " omitted")}`);
}
