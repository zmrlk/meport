/**
 * Pack-Based Question Loader
 *
 * Loads pack JSON files for the new Full Session architecture.
 * Replaces tier-based loading for pack-based profiling.
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKS_BASE = join(__dirname, "..", "..", "questions", "packs");

// ─── Locale ──────────────────────────────────────────────────

export type Locale = "en" | "pl";

const SUPPORTED_LOCALES: Locale[] = ["en", "pl"];

/**
 * Detect locale from explicit flag, LANG env, or Intl API.
 * Returns "en" as fallback.
 */
export function detectLocale(explicit?: string): Locale {
  if (explicit && SUPPORTED_LOCALES.includes(explicit as Locale)) {
    return explicit as Locale;
  }

  // Check LANG env variable (e.g. "pl_PL.UTF-8" → "pl")
  const lang = process.env.LANG ?? process.env.LC_ALL ?? process.env.LC_MESSAGES ?? "";
  const langPrefix = lang.split(/[_.]/)[0]?.toLowerCase();
  if (langPrefix && SUPPORTED_LOCALES.includes(langPrefix as Locale)) {
    return langPrefix as Locale;
  }

  // Check Intl API
  try {
    const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    const intlPrefix = intlLocale.split("-")[0]?.toLowerCase();
    if (intlPrefix && SUPPORTED_LOCALES.includes(intlPrefix as Locale)) {
      return intlPrefix as Locale;
    }
  } catch {
    // Intl not available
  }

  return "en";
}

/**
 * Get the packs directory for a given locale.
 * "en" = base directory, others = subdirectory.
 */
function getLocalizedPacksPath(basePath: string, locale: Locale): string {
  return locale === "en" ? basePath : join(basePath, locale);
}

// ─── Types ──────────────────────────────────────────────────

export interface PackQuestion {
  id: string;
  pack: string;
  question: string;
  type: "select" | "multi_select" | "open_text" | "scale";
  dimension: string;
  skippable: boolean;
  meta_profiling: string | null;
  why_this_matters: string | null;
  placeholder?: string;
  also_captures?: string[];
  open_text_addon?: string;
  skip_if?: string;
  options?: PackOption[];
}

export interface PackOption {
  value: string;
  label: string;
  maps_to: { dimension: string; value: string };
  also_maps_to?: { dimension: string; value: string };
  export_rule?: string;
  triggers?: string[];
}

export interface Pack {
  pack: string;
  pack_name: string;
  pack_intro: string;
  required: boolean;
  sensitive: boolean;
  privacy_note?: string;
  questions: PackQuestion[];
}

export type PackId =
  | "micro-setup"
  | "core"
  | "story"
  | "context"
  | "work"
  | "lifestyle"
  | "health"
  | "finance"
  | "learning";
  // Business packs (tier-b0 through tier-b6) exist in questions/business/
  // but use legacy tier format. Conversion to pack format is pending.

// ─── Loader ─────────────────────────────────────────────────

const PACK_FILES: PackId[] = [
  "micro-setup",
  "core",
  "story",
  "context",
  "work",
  "lifestyle",
  "health",
  "finance",
  "learning",
];

/**
 * Load a single pack by ID.
 * If locale is specified, loads from locale subdirectory (e.g. packs/pl/).
 * Falls back to English if localized file not found.
 */
export async function loadPack(
  packId: PackId,
  packsPath?: string,
  locale?: Locale
): Promise<Pack | null> {
  const basePath = packsPath ?? PACKS_BASE;
  const effectiveLocale = locale ?? "en";

  // Try localized path first
  if (effectiveLocale !== "en") {
    const localizedPath = getLocalizedPacksPath(basePath, effectiveLocale);
    const localizedFile = join(localizedPath, `${packId}.json`);
    try {
      const content = await readFile(localizedFile, "utf-8");
      return JSON.parse(content) as Pack;
    } catch {
      // Fall back to English
    }
  }

  // English (default)
  const filePath = join(basePath, `${packId}.json`);
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as Pack;
  } catch {
    return null;
  }
}

/**
 * Load multiple packs by ID
 */
export async function loadPacks(
  packIds: PackId[],
  packsPath?: string,
  locale?: Locale
): Promise<Pack[]> {
  const packs: Pack[] = [];

  for (const id of packIds) {
    const pack = await loadPack(id, packsPath, locale);
    if (pack) packs.push(pack);
  }

  return packs;
}

/**
 * Load the micro-setup + selected packs for a full session.
 * Always loads micro-setup and core. Then adds user-selected packs.
 */
export async function loadSessionPacks(
  selectedPacks: PackId[],
  packsPath?: string,
  locale?: Locale
): Promise<Pack[]> {
  // Always include micro-setup and core
  const packIds = new Set<PackId>(["micro-setup", "core"]);

  for (const id of selectedPacks) {
    packIds.add(id);
  }

  // Load in order: micro-setup → core → selected packs
  const orderedIds: PackId[] = ["micro-setup", "core"];
  for (const id of PACK_FILES) {
    if (id !== "micro-setup" && id !== "core" && packIds.has(id)) {
      orderedIds.push(id);
    }
  }

  return loadPacks(orderedIds, packsPath, locale);
}

/**
 * Collect all export_rules from pack questions.
 * Returns a map of dimension -> export_rule for the rule compiler.
 */
export function collectPackExportRules(packs: Pack[]): Map<string, string[]> {
  const rules = new Map<string, string[]>();

  for (const pack of packs) {
    for (const question of pack.questions) {
      if (question.options) {
        for (const option of question.options) {
          if (option.export_rule && option.maps_to) {
            // Store the rule keyed by dimension+value so we can match after answer
            const key = `${option.maps_to.dimension}:${option.maps_to.value}`;
            const existing = rules.get(key) ?? [];
            if (!existing.includes(option.export_rule)) {
              existing.push(option.export_rule);
            }
            rules.set(key, existing);
          }
        }
      }
    }
  }

  return rules;
}

/**
 * Resolve which export_rule applies for a given dimension+value pair.
 */
export function resolveExportRule(
  exportRules: Map<string, string[]>,
  dimension: string,
  value: string
): string[] | undefined {
  return exportRules.get(`${dimension}:${value}`);
}

/**
 * Get all available pack IDs
 */
export function getAvailablePackIds(): PackId[] {
  return [...PACK_FILES];
}
