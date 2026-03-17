/**
 * meport packs — Manage profile packs post-setup
 *
 * - list: Show available packs and which are active
 * - add <pack>: Run a new pack's questions and merge into existing profile
 * - remove <pack>: Remove a pack's dimensions from the profile
 */

import { readFile, writeFile } from "node:fs/promises";
import ora from "ora";
import {
  PackProfilingEngine,
  loadPack,
  loadPacks,
  collectPackExportRules,
  runPackLayer2,
  collectRules,
  type PackEngineEvent,
  type PackAnswerInput,
  type PackId,
  type Pack,
  type PersonaProfile,
  detectLocale,
  type Locale,
} from "@meport/core";
import {
  packHeader,
  packComplete,
  packProgress,
  finalSummary,
  GREEN,
  BOLD,
  CYAN,
  DIM,
  RED,
  YELLOW,
} from "../ui/display.js";
import { askPackQuestion, askConfirm } from "../ui/pack-prompts.js";

const ALL_PACKS: { id: PackId; name: string; description: string }[] = [
  { id: "core", name: "Communication DNA", description: "How you like AI to talk to you" },
  { id: "context", name: "Life Context", description: "Job, location, current focus, tools" },
  { id: "work", name: "Work Style", description: "Energy, deadlines, task preferences" },
  { id: "lifestyle", name: "Lifestyle", description: "Daily rhythm, priorities, stress" },
  { id: "health", name: "Health", description: "Fitness, diet, sleep (sensitive)" },
  { id: "finance", name: "Finance", description: "Money style, budgeting (sensitive)" },
  { id: "learning", name: "Learning", description: "How you learn, study preferences" },
];

interface PacksOptions {
  profile: string;
  lang?: string;
}

export async function packsListCommand(options: PacksOptions): Promise<void> {
  const profile = await loadProfile(options.profile);
  const activePacks = detectActivePacks(profile);

  console.log(BOLD("\n📦 Packs\n"));

  for (const pack of ALL_PACKS) {
    const active = activePacks.has(pack.id);
    const icon = active ? GREEN("●") : DIM("○");
    const status = active ? GREEN(" active") : DIM(" available");
    console.log(`  ${icon} ${BOLD(pack.name)} (${pack.id})${status}`);
    console.log(`    ${DIM(pack.description)}`);
  }

  const activeCount = activePacks.size;
  const availableCount = ALL_PACKS.length - activeCount;

  console.log();
  if (availableCount > 0) {
    console.log(
      DIM(`  ${activeCount} active, ${availableCount} available. `) +
        CYAN("meport packs add <id>") +
        DIM(" to add one.")
    );
  } else {
    console.log(GREEN("  All packs active! ") + DIM("Full profile coverage."));
  }
  console.log();
}

export async function packsAddCommand(
  packId: string,
  options: PacksOptions
): Promise<void> {
  const locale = detectLocale(options.lang);

  // Validate pack ID
  const packInfo = ALL_PACKS.find((p) => p.id === packId);
  if (!packInfo) {
    console.log(RED("✗ ") + `Unknown pack "${packId}".`);
    console.log(DIM("  Available: ") + ALL_PACKS.map((p) => p.id).join(", "));
    process.exit(1);
  }

  // Load existing profile
  const profile = await loadProfile(options.profile);
  const activePacks = detectActivePacks(profile);

  if (activePacks.has(packId as PackId)) {
    console.log(YELLOW("⚠ ") + `Pack "${packId}" is already active.`);
    console.log(DIM("  Use ") + CYAN("meport update") + DIM(" to re-answer questions."));
    return;
  }

  // Load the pack
  const pack = await loadPack(packId as PackId, undefined, locale);
  if (!pack) {
    console.log(RED("✗ ") + `Could not load pack "${packId}".`);
    process.exit(1);
  }

  console.log(
    "\n" + GREEN("+ ") + BOLD(`Adding ${packInfo.name}`) + DIM(` (${pack.questions.length} questions)\n`)
  );

  // Create a mini engine just for this pack
  const engine = new PackProfilingEngine(pack);
  const gen = engine.run();
  let result = gen.next();

  while (!result.done) {
    const event = result.value as PackEngineEvent;

    switch (event.type) {
      case "pack_start":
        packHeader(event.packName, event.intro, event.sensitive, event.privacyNote);
        result = gen.next(undefined);
        break;

      case "question": {
        const progress = packProgress(event.index, event.total, event.pack);
        const answer = await askPackQuestion(event.question, progress);
        result = gen.next(answer);
        break;
      }

      case "confirm": {
        const progress = packProgress(event.index, event.total, event.pack);
        const answer = await askConfirm(
          event.question,
          event.detectedValue,
          event.detectedSource,
          progress
        );
        result = gen.next(answer);
        break;
      }

      case "pack_selection":
        // Single pack — no selection needed
        result = gen.next({ value: [packId] });
        break;

      case "pack_complete":
        packComplete(event.pack, event.questionsAnswered);
        result = gen.next(undefined);
        break;

      case "preview_ready":
        result = gen.next(undefined);
        break;

      case "profiling_complete": {
        const newProfile = event.profile;

        // Merge new dimensions into existing profile
        const mergeSpinner = ora("Merging into profile...").start();

        // Merge explicit dimensions
        for (const [key, val] of Object.entries(newProfile.explicit)) {
          profile.explicit[key] = val;
        }

        // Merge inferred
        for (const [key, val] of Object.entries(newProfile.inferred)) {
          profile.inferred[key] = val;
        }

        // Re-run Layer 2 with ALL answers (existing + new)
        // Reconstruct answers from existing profile explicit dims + new pack answers
        const allAnswers = new Map(engine.getAnswers());
        for (const [key, val] of Object.entries(profile.explicit)) {
          if (!allAnswers.has(key) && val.question_id) {
            allAnswers.set(val.question_id, {
              question_id: val.question_id,
              value: val.value,
              timestamp: 0,
              response_time_ms: 0,
              skipped: false,
              pack: key.split(".")[0] || "unknown",
            });
          }
        }

        const allPackIds = [...activePacks, packId as PackId];
        const allPacks = await loadPacks(
          ["micro-setup" as PackId, "core" as PackId, ...allPackIds]
        );
        const enriched = runPackLayer2(
          profile,
          allAnswers,
          allPacks
        );

        // Update profile fields from enriched result
        profile.compound = enriched.compound;
        profile.contradictions = enriched.contradictions;
        profile.completeness = enriched.completeness;
        profile.updated_at = new Date().toISOString();
        profile.meta.total_questions_answered += event.profile.meta.total_questions_answered;

        mergeSpinner.succeed("Merged");

        // Save
        const saveSpinner = ora("Saving...").start();
        await writeFile(options.profile, JSON.stringify(profile, null, 2), "utf-8");
        saveSpinner.succeed(`Profile updated: ${CYAN(options.profile)}`);

        const dimCount = Object.keys(profile.explicit).length;
        console.log(
          "\n" +
            GREEN("✓ ") +
            BOLD(`${packInfo.name} added. `) +
            DIM(`${dimCount} dimensions, ${Math.round(profile.completeness)}% complete.`)
        );
        console.log(
          DIM("  Re-export: ") + CYAN("meport export --all")
        );
        console.log();

        result = gen.next(undefined);
        break;
      }
    }
  }
}

export async function packsRemoveCommand(
  packId: string,
  options: PacksOptions
): Promise<void> {
  const packInfo = ALL_PACKS.find((p) => p.id === packId);
  if (!packInfo) {
    console.log(RED("✗ ") + `Unknown pack "${packId}".`);
    process.exit(1);
  }

  if (packId === "core") {
    console.log(RED("✗ ") + "Cannot remove the core pack.");
    return;
  }

  const profile = await loadProfile(options.profile);
  const activePacks = detectActivePacks(profile);

  if (!activePacks.has(packId as PackId)) {
    console.log(YELLOW("⚠ ") + `Pack "${packId}" is not active.`);
    return;
  }

  // Load pack to know which dimensions to remove
  const pack = await loadPack(packId as PackId);
  if (!pack) {
    console.log(RED("✗ ") + `Could not load pack "${packId}".`);
    process.exit(1);
  }

  // Collect dimension keys from this pack's questions
  const dimensionsToRemove = new Set<string>();
  for (const q of pack.questions) {
    if (q.dimension) {
      dimensionsToRemove.add(q.dimension);
    }
    if (q.also_captures) {
      for (const dim of q.also_captures) {
        dimensionsToRemove.add(dim);
      }
    }
    if (q.options) {
      for (const opt of q.options) {
        if (opt.maps_to?.dimension) {
          dimensionsToRemove.add(opt.maps_to.dimension);
        }
        if (opt.also_maps_to?.dimension) {
          dimensionsToRemove.add(opt.also_maps_to.dimension);
        }
      }
    }
  }

  let removed = 0;
  for (const dim of dimensionsToRemove) {
    if (profile.explicit[dim]) {
      delete profile.explicit[dim];
      removed++;
    }
    if (profile.inferred[dim]) {
      delete profile.inferred[dim];
    }
  }

  // Remove compound signals that reference removed dimensions OR removed question IDs
  // compound.inputs can be question_ids (e.g. "setup_q02") or dimension keys
  const removedQuestionIds = new Set<string>();
  for (const q of pack.questions) {
    removedQuestionIds.add(q.id);
  }

  for (const [key, compound] of Object.entries(profile.compound)) {
    const inputsInvalid = compound.inputs.some((input: string) =>
      dimensionsToRemove.has(input) || removedQuestionIds.has(input)
    );
    if (inputsInvalid) {
      delete profile.compound[key];
    }
  }

  // Remove contradictions that reference removed dimensions
  profile.contradictions = profile.contradictions.filter((c) =>
    !c.dimensions.some((d) => dimensionsToRemove.has(d))
  );

  // Remove inferred signals from the removed pack's behavioral patterns
  for (const dim of Object.keys(profile.inferred)) {
    if (dimensionsToRemove.has(dim)) {
      delete profile.inferred[dim];
    }
  }

  // Recalculate completeness
  const totalDimensions = Object.keys(profile.explicit).length;
  profile.completeness = Math.min(100, Math.round((totalDimensions / 30) * 100));
  profile.updated_at = new Date().toISOString();

  await writeFile(options.profile, JSON.stringify(profile, null, 2), "utf-8");

  console.log(
    GREEN("✓ ") +
      BOLD(`${packInfo.name} removed. `) +
      DIM(`${removed} dimensions cleared.`)
  );
  console.log(DIM("  Re-export: ") + CYAN("meport export --all"));
  console.log();
}

// ─── Helpers ──────────────────────────────────────────────

async function loadProfile(path: string): Promise<PersonaProfile> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as PersonaProfile;
  } catch {
    console.log(RED("✗ ") + "No profile found. Run " + CYAN("meport profile") + " first.");
    throw new Error("No profile");
  }
}

/**
 * Detect which packs are active by checking which dimensions exist in the profile.
 * Each pack maps to specific dimension prefixes.
 */
function detectActivePacks(profile: PersonaProfile): Set<PackId> {
  const dims = new Set(Object.keys(profile.explicit));
  const active = new Set<PackId>();

  const packDimensionPrefixes: Record<string, string[]> = {
    core: ["communication.", "ai."],
    context: ["context."],
    work: ["work.", "cognitive."],
    lifestyle: ["life.", "personality.", "lifestyle."],
    health: ["health.", "fitness."],
    finance: ["finance.", "money."],
    learning: ["learning.", "study."],
  };

  for (const [packId, prefixes] of Object.entries(packDimensionPrefixes)) {
    const hasAny = prefixes.some((prefix) =>
      [...dims].some((d) => d.startsWith(prefix))
    );
    if (hasAny) {
      active.add(packId as PackId);
    }
  }

  return active;
}
