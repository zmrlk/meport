/**
 * Browser-compatible pack loader for the Tauri/Vite app.
 *
 * `loadPack` from @meport/core uses node:fs and cannot run in the browser renderer.
 * This module imports packs as static JSON assets bundled by Vite, then wraps them
 * in the same Pack type so the rest of the store code is identical to the CLI.
 */

import type { Pack, PackId } from "@meport/core";

// Static JSON imports — Vite bundles these at build time.
// Keep in sync with packages/core/questions/packs/*.json
import microSetupEn from "../../../core/questions/packs/micro-setup.json" assert { type: "json" };
import coreEn from "../../../core/questions/packs/core.json" assert { type: "json" };
import storyEn from "../../../core/questions/packs/story.json" assert { type: "json" };
import contextEn from "../../../core/questions/packs/context.json" assert { type: "json" };
import workEn from "../../../core/questions/packs/work.json" assert { type: "json" };
import lifestyleEn from "../../../core/questions/packs/lifestyle.json" assert { type: "json" };
import healthEn from "../../../core/questions/packs/health.json" assert { type: "json" };
import financeEn from "../../../core/questions/packs/finance.json" assert { type: "json" };
import learningEn from "../../../core/questions/packs/learning.json" assert { type: "json" };

const PACKS_EN: Record<string, Pack> = {
  "micro-setup": microSetupEn as unknown as Pack,
  core: coreEn as unknown as Pack,
  story: storyEn as unknown as Pack,
  context: contextEn as unknown as Pack,
  work: workEn as unknown as Pack,
  lifestyle: lifestyleEn as unknown as Pack,
  health: healthEn as unknown as Pack,
  finance: financeEn as unknown as Pack,
  learning: learningEn as unknown as Pack,
};

// Localized packs (Polish) — loaded dynamically to avoid bundle bloat when not needed.
// Vite lazy chunk: only fetched when locale === "pl".
async function loadPlPacks(): Promise<Record<string, Pack>> {
  try {
    const [microSetup, core, story, context, work, lifestyle, health, finance, learning] =
      await Promise.all([
        import("../../../core/questions/packs/pl/micro-setup.json"),
        import("../../../core/questions/packs/pl/core.json"),
        import("../../../core/questions/packs/pl/story.json"),
        import("../../../core/questions/packs/pl/context.json"),
        import("../../../core/questions/packs/pl/work.json"),
        import("../../../core/questions/packs/pl/lifestyle.json"),
        import("../../../core/questions/packs/pl/health.json"),
        import("../../../core/questions/packs/pl/finance.json"),
        import("../../../core/questions/packs/pl/learning.json"),
      ]);
    return {
      "micro-setup": microSetup.default as unknown as Pack,
      core: core.default as unknown as Pack,
      story: story.default as unknown as Pack,
      context: context.default as unknown as Pack,
      work: work.default as unknown as Pack,
      lifestyle: lifestyle.default as unknown as Pack,
      health: health.default as unknown as Pack,
      finance: finance.default as unknown as Pack,
      learning: learning.default as unknown as Pack,
    };
  } catch {
    // Polish packs not found — fall back to English silently
    return {};
  }
}

let plPacksCache: Record<string, Pack> | null = null;

async function getPacksForLocale(locale: string): Promise<Record<string, Pack>> {
  if (locale === "pl") {
    if (!plPacksCache) {
      plPacksCache = await loadPlPacks();
    }
    return { ...PACKS_EN, ...plPacksCache };
  }
  return PACKS_EN;
}

export async function loadPackBrowser(
  packId: PackId,
  locale = "en"
): Promise<Pack | null> {
  const packs = await getPacksForLocale(locale);
  return packs[packId] ?? null;
}

export async function loadPacksBrowser(
  packIds: PackId[],
  locale = "en"
): Promise<Pack[]> {
  const packs = await getPacksForLocale(locale);
  return packIds.map((id) => packs[id]).filter((p): p is Pack => p !== undefined);
}
