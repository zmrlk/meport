/**
 * meport view — Visible Memory Bank
 *
 * Shows what meport knows about you, organized by pack.
 * User can see all dimensions, edit inline, and re-export.
 */

import { readFile } from "node:fs/promises";
import {
  getAvailablePackIds,
  loadPacks,
  type PersonaProfile,
  type Pack,
} from "@meport/core";
import {
  banner,
  completenessBar,
  BRAND,
  BOLD,
  DIM,
  CYAN,
  GREEN,
  RED,
  YELLOW,
} from "../ui/display.js";
import { checkFreshness } from "../ui/freshness.js";

interface ViewOptions {
  profile: string;
  lang?: string;
}

// Dimension → pack mapping for organized display
const SECTION_LABELS_PL: Record<string, string> = {
  "Identity": "Tożsamość",
  "Communication": "Komunikacja",
  "AI Relationship": "Relacja z AI",
  "Life Context": "Kontekst",
  "Work & Productivity": "Praca",
  "Lifestyle": "Styl życia",
  "Health": "Zdrowie",
  "Finance": "Finanse",
  "Learning": "Nauka",
};

const PACK_DIMENSIONS: Record<string, string[]> = {
  "Identity": ["identity.preferred_name", "primary_use_case", "identity.language", "identity.timezone", "expertise.tech_stack"],
  "Communication": ["communication.verbosity_preference", "communication.directness", "communication.anti_patterns", "communication.feedback_style", "communication.format_preference"],
  "AI Relationship": ["ai.relationship_model", "ai.correction_style"],
  "Life Context": ["context.occupation", "context.industry", "context.location", "context.life_stage", "context.current_focus", "context.tools"],
  "Work & Productivity": ["work.deadline_behavior", "work.energy_archetype", "work.perfectionism", "cognitive.learning_style", "personality.stress_response"],
  "Lifestyle": ["lifestyle.travel_style", "lifestyle.food_openness", "lifestyle.social_energy", "lifestyle.routine_preference", "lifestyle.dietary"],
  "Health": ["health.fitness_level", "health.sleep_pattern", "health.conditions"],
  "Finance": ["finance.financial_goal", "finance.spending_style", "finance.ai_advice_level"],
  "Learning": ["learning.format_preference", "learning.current_goals", "learning.time_commitment"],
};

export async function viewCommand(options: ViewOptions): Promise<void> {
  const pl = (options.lang ?? "").startsWith("pl") || (!options.lang && (process.env.LANG ?? "").startsWith("pl"));
  let profile: PersonaProfile;

  try {
    const raw = await readFile(options.profile, "utf-8");
    profile = JSON.parse(raw) as PersonaProfile;
  } catch {
    console.log(
      RED("✗ ") +
        (pl ? `Nie można odczytać profilu z ${options.profile}` : `Could not read profile from ${options.profile}`)
    );
    console.log(
      DIM("  ") +
        (pl
          ? DIM("Uruchom ") + CYAN("meport profile") + DIM(" najpierw.")
          : DIM("Run ") + CYAN("meport profile") + DIM(" first to create one."))
    );
    return;
  }

  banner();

  // Compact view with boxes
  const name = profile.explicit["identity.preferred_name"]?.value ?? "User";
  const occupation = profile.explicit["context.occupation"]?.value ?? "";
  const totalDimsCount = Object.keys(profile.explicit).filter(k => !k.startsWith("_") && !k.startsWith("selected")).length;
  const compoundsCount = Object.keys(profile.compound).length;

  checkFreshness(profile.updated_at);

  // Header box
  console.log(CYAN("  ┌──────────────────────────────────────────┐"));
  console.log(CYAN("  │") + ` ${BOLD(String(name))}${occupation ? ` — ${occupation}` : ""}`.padEnd(43) + CYAN("│"));
  console.log(CYAN("  │") + ` ${completenessBar(profile.completeness)} ${totalDimsCount} dims`.padEnd(43) + CYAN("│"));
  console.log(CYAN("  └──────────────────────────────────────────┘"));
  console.log();

  // Compact sections — 2 dims per line where possible
  let totalDims = 0;
  let filledDims = 0;

  for (const [section, dims] of Object.entries(PACK_DIMENSIONS)) {
    const sectionDims = dims
      .map((dim) => ({ dim, val: profile.explicit[dim] }))
      .filter((d) => d.val !== undefined);

    if (sectionDims.length === 0) continue;

    totalDims += dims.length;
    filledDims += sectionDims.length;

    const isSensitive = section === "Health" || section === "Finance";
    const sectionLabel = pl ? (SECTION_LABELS_PL[section] ?? section) : section;
    console.log(
      `  ${BOLD(sectionLabel)}` + DIM(` ${sectionDims.length}/${dims.length}`) +
      (isSensitive ? YELLOW(" 🔒") : "")
    );

    // Compact: short values on one line, long values on own line
    for (const { dim, val } of sectionDims) {
      const label = dim.split(".").pop()?.replace(/_/g, " ") ?? dim;
      const value = formatValue(val.value);
      const truncated = value.length > 70 ? value.slice(0, 70) + "..." : value;
      console.log(`    ${DIM(label)}: ${truncated}`);
    }
  }

  // Uncategorized — compact
  const categorizedDims = new Set(Object.values(PACK_DIMENSIONS).flat());
  const uncategorized = Object.entries(profile.explicit)
    .filter(([k]) => !categorizedDims.has(k) && !k.startsWith("selected") && !k.startsWith("_"));

  if (uncategorized.length > 0) {
    console.log(`  ${BOLD(pl ? "Inne" : "Other")} ${DIM(String(uncategorized.length))}`);
    for (const [key, val] of uncategorized) {
      const label = key.split(".").pop()?.replace(/_/g, " ") ?? key;
      const value = formatValue(val.value);
      const truncated = value.length > 70 ? value.slice(0, 70) + "..." : value;
      console.log(`    ${DIM(label)}: ${truncated}`);
    }
  }

  // Compound signals — inline
  const compounds = Object.entries(profile.compound);
  if (compounds.length > 0) {
    console.log();
    console.log(`  ${BOLD(pl ? "🧠 Sygnały" : "🧠 Signals")} ${DIM(String(compounds.length))}`);
    for (const [key, val] of compounds) {
      const label = key.split(".").pop()?.replace(/_/g, " ") ?? key;
      console.log(`    ${label}: ${CYAN(val.value)} ${DIM(`${Math.round(val.confidence * 100)}%`)}`);
    }
  }

  // Footer — compact actions
  console.log();
  console.log(DIM(pl
    ? `  wdroz ${CYAN("→")} edytuj ${CYAN("→")} odswiez ${CYAN("→")} raport ${CYAN("→")} karta`
    : `  deploy ${CYAN("→")} edit ${CYAN("→")} refresh ${CYAN("→")} report ${CYAN("→")} card`
  ));
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(String).join(", ");
  }
  return String(value);
}
