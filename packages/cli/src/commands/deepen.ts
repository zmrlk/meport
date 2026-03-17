/**
 * meport deepen — Progressive profile deepening
 *
 * Each session goes DEEPER into areas that are shallow.
 * Session 1 = broad coverage. Session 2+ = targeted depth.
 *
 * "Last time we covered your work and communication style.
 *  Today I want to understand your decision-making and what drives you."
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import ora from "ora";
import { input, confirm } from "@inquirer/prompts";
import {
  createAIClient,
  AIInterviewer,
  recomputeProfile,
  collectPackExportRules,
  compileAllRules,
  loadPacks,
  getAvailablePackIds,
  type PersonaProfile,
  type AIConfig,
} from "@meport/core";
import {
  GREEN,
  BOLD,
  CYAN,
  DIM,
  RED,
  YELLOW,
} from "../ui/display.js";
import { loadConfig } from "./config.js";

interface DeepenOptions {
  profile: string;
  lang?: string;
}

// Categories and their key dimensions for depth tracking
const CATEGORIES: Record<string, { label: string; labelPl: string; dimensions: string[] }> = {
  identity: {
    label: "Who you are",
    labelPl: "Kim jesteś",
    dimensions: ["identity.preferred_name", "identity.self_description", "identity.background", "identity.key_achievement", "identity.vision"],
  },
  communication: {
    label: "Communication style",
    labelPl: "Styl komunikacji",
    dimensions: ["communication.verbosity_preference", "communication.directness", "communication.anti_patterns", "communication.feedback_style", "communication.pet_peeves"],
  },
  work: {
    label: "Work style & energy",
    labelPl: "Styl pracy i energia",
    dimensions: ["work.energy_archetype", "work.deadline_behavior", "work.perfectionism", "work.breaks_pattern", "personality.stress_response", "work.expertise_level", "work.collaboration_style"],
  },
  cognitive: {
    label: "How you think & learn",
    labelPl: "Jak myślisz i się uczysz",
    dimensions: ["cognitive.learning_style", "cognitive.decision_style", "cognitive.attention_span", "work.multitasking"],
  },
  context: {
    label: "Life context & goals",
    labelPl: "Kontekst życiowy",
    dimensions: ["context.occupation", "context.industry", "context.life_stage", "context.current_focus", "primary_use_case"],
  },
  motivation: {
    label: "What drives you",
    labelPl: "Co Cię napędza",
    dimensions: ["story.motivation", "story.fear", "identity.vision", "story.life_situation", "story.primary_need"],
  },
  ai_relationship: {
    label: "Your AI relationship",
    labelPl: "Relacja z AI",
    dimensions: ["ai.relationship_model", "ai.correction_style", "ai.proactivity", "ai.memory_preference"],
  },
  lifestyle: {
    label: "Lifestyle & personality",
    labelPl: "Styl życia",
    dimensions: ["lifestyle.routine_preference", "lifestyle.social_energy", "lifestyle.morning_routine", "personality.risk_tolerance"],
  },
};

export async function deepenCommand(options: DeepenOptions): Promise<void> {
  const pl = (options.lang ?? "").startsWith("pl") ||
    (!options.lang && (process.env.LANG ?? "").startsWith("pl"));

  // Load existing profile
  let profile: PersonaProfile;
  try {
    const raw = await readFile(options.profile, "utf-8");
    profile = JSON.parse(raw) as PersonaProfile;
  } catch {
    console.log(RED("✗ ") + (pl ? "Brak profilu. Uruchom meport profile." : "No profile. Run meport profile."));
    return;
  }

  const config = await loadConfig();
  if (!config.ai?.provider) {
    console.log(RED(pl ? "Brak konfiguracji AI. Uruchom: meport config" : "No AI configured. Run: meport config"));
    return;
  }

  const client = createAIClient(config.ai as AIConfig);
  const sessionCount = (profile.meta.session_count || 0) + 1;

  // Calculate depth per category
  const depthMap: Record<string, number> = {};
  for (const [catId, cat] of Object.entries(CATEGORIES)) {
    const filled = cat.dimensions.filter(d => profile.explicit[d]).length;
    depthMap[catId] = Math.round((filled / cat.dimensions.length) * 100);
  }

  // Find shallowest categories (targets for this session)
  const sorted = Object.entries(depthMap).sort((a, b) => a[1] - b[1]);
  const targets = sorted.slice(0, 3).filter(([, depth]) => depth < 80);

  console.log(
    BOLD(pl ? `\n━━━ Pogłębianie profilu (sesja ${sessionCount}) ━━━\n` : `\n━━━ Profile Deepening (session ${sessionCount}) ━━━\n`)
  );

  // Show depth map
  for (const [catId, cat] of Object.entries(CATEGORIES)) {
    const depth = depthMap[catId];
    const filled = Math.round(depth / 5);
    const empty = 20 - filled;
    const isTarget = targets.some(([id]) => id === catId);
    const label = pl ? cat.labelPl : cat.label;
    console.log(
      `  ${isTarget ? YELLOW("→") : " "} ${label.padEnd(25)} [${GREEN("█".repeat(filled))}${DIM("░".repeat(empty))}] ${depth}%`
    );
  }
  console.log();

  if (targets.length === 0) {
    console.log(GREEN(pl ? "  ✓ Profil jest już głęboki we wszystkich obszarach!\n" : "  ✓ Profile is already deep in all areas!\n"));
    return;
  }

  const targetLabels = targets.map(([id]) => {
    const cat = CATEGORIES[id];
    return pl ? cat.labelPl : cat.label;
  });

  console.log(
    DIM(pl
      ? `  Dziś skupimy się na: ${targetLabels.join(", ")}\n`
      : `  Today we'll focus on: ${targetLabels.join(", ")}\n`)
  );

  // Build context for AI — what we know and what we need
  const knownDims: Record<string, string> = {};
  for (const [key, val] of Object.entries(profile.explicit)) {
    if (!key.startsWith("_")) {
      knownDims[key] = Array.isArray(val.value) ? val.value.join(", ") : String(val.value);
    }
  }

  // Build the missing dimensions list
  const missingDims: string[] = [];
  for (const [targetCatId] of targets) {
    if (CATEGORIES[targetCatId]) {
      for (const dim of CATEGORIES[targetCatId].dimensions) {
        if (!profile.explicit[dim]) {
          missingDims.push(dim);
        }
      }
    }
  }

  // Create targeted interviewer
  const interviewer = new AIInterviewer({
    client,
    locale: pl ? "pl" : "en",
    knownDimensions: knownDims,
    maxRounds: 6, // Shorter — targeted depth, not broad coverage
  });

  console.log(DIM(pl ? "  /koniec = zakończ wcześniej\n" : "  /done = finish early\n"));

  let round = await interviewer.start();
  console.log(CYAN("  meport: ") + round.aiMessage);
  console.log();

  while (!round.complete) {
    const userInput = await input({ message: "›" });
    if (!userInput.trim()) continue;
    if (userInput.trim().toLowerCase() === "/done" || userInput.trim().toLowerCase() === "/koniec") break;

    const spin = ora({ text: DIM("..."), spinner: "dots" }).start();
    try {
      round = await interviewer.respond(userInput);
      spin.stop();
      console.log(CYAN("  meport: ") + round.aiMessage);
      console.log();
    } catch (err: any) {
      spin.fail("AI error: " + (err.message || "").slice(0, 80));
      break;
    }
  }

  // Merge new dimensions into existing profile
  const newDims = interviewer.getDimensions();
  let addedCount = 0;
  for (const [key, dim] of Object.entries(newDims)) {
    if (key.startsWith("_")) continue;
    const existing = profile.explicit[key];
    if (!existing || (dim.source === "interview" && dim.confidence > 0.7)) {
      profile.explicit[key] = {
        dimension: key,
        value: dim.value,
        confidence: 1.0 as const,
        source: "explicit" as const,
        question_id: `deepen_s${sessionCount}_${key}`,
      };
      addedCount++;
    }
  }

  // Merge export rules
  const newExportRules = interviewer.getExportRules();
  let packRules = new Map<string, string>();
  try {
    const packs = await loadPacks(getAvailablePackIds());
    packRules = collectPackExportRules(packs);
  } catch {}
  for (const [k, v] of newExportRules) packRules.set(k, v);

  // Update meta
  profile.meta.session_count = sessionCount;
  profile.meta.last_session_date = new Date().toISOString();
  profile.meta.depth_per_category = {};
  for (const [catId, cat] of Object.entries(CATEGORIES)) {
    const filled = cat.dimensions.filter(d => profile.explicit[d]).length;
    profile.meta.depth_per_category[catId] = Math.round((filled / cat.dimensions.length) * 100);
  }

  // Recompute
  try {
    const packs = await loadPacks(getAvailablePackIds());
    recomputeProfile(profile, packs);
  } catch {
    recomputeProfile(profile);
  }

  // Save
  await writeFile(options.profile, JSON.stringify(profile, null, 2), "utf-8");
  const { saveSnapshot } = await import("./history.js");
  await saveSnapshot(options.profile);

  console.log(
    GREEN("\n  ✓ ") +
    (pl
      ? `${addedCount} nowych wymiarów dodanych (sesja ${sessionCount})`
      : `${addedCount} new dimensions added (session ${sessionCount})`)
  );

  // Show updated depth
  console.log();
  for (const [catId, cat] of Object.entries(CATEGORIES)) {
    const newDepth = profile.meta.depth_per_category?.[catId] ?? depthMap[catId];
    const oldDepth = depthMap[catId];
    const filled = Math.round(newDepth / 5);
    const empty = 20 - filled;
    const label = pl ? cat.labelPl : cat.label;
    const change = newDepth > oldDepth ? GREEN(` +${newDepth - oldDepth}%`) : "";
    console.log(
      `  ${label.padEnd(25)} [${GREEN("█".repeat(filled))}${DIM("░".repeat(empty))}] ${newDepth}%${change}`
    );
  }

  // Auto re-export
  const doExport = await confirm({
    message: pl ? "Zaktualizować eksporty?" : "Update exports?",
    default: true,
  });

  if (doExport) {
    const { mkdir } = await import("node:fs/promises");
    const exportDir = join(dirname(options.profile), "meport-exports");
    const results = compileAllRules(profile, packRules);
    await mkdir(exportDir, { recursive: true });
    for (const [, res] of results) {
      await writeFile(join(exportDir, res.filename), res.content, "utf-8");
    }
    console.log(GREEN("  ✓ ") + `${results.size} platforms → ${CYAN(exportDir + "/")}`);
  }

  console.log();
}
