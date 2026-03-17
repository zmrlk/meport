/**
 * meport edit — Edit individual profile dimensions inline.
 * Shows current values, lets user pick one to change.
 */

import { readFile, writeFile } from "node:fs/promises";
import { select, input } from "@inquirer/prompts";
import type { PersonaProfile } from "@meport/core";
import { GREEN, BOLD, CYAN, DIM, RED, YELLOW } from "../ui/display.js";

interface EditOptions {
  profile: string;
  lang?: string;
}

export async function editCommand(options: EditOptions): Promise<void> {
  const pl = (options.lang ?? "").startsWith("pl") || (!options.lang && (process.env.LANG ?? "").startsWith("pl"));

  let profile: PersonaProfile;
  try {
    const raw = await readFile(options.profile, "utf-8");
    profile = JSON.parse(raw) as PersonaProfile;
  } catch {
    console.log(RED("✗ ") + (pl ? "Brak profilu. Uruchom " : "No profile found. Run ") + CYAN("meport profile") + (pl ? " najpierw." : " first."));
    return;
  }

  let editing = true;
  while (editing) {
    // Build choices from explicit dimensions
    const choices = Object.entries(profile.explicit)
      .filter(([k]) => k !== "selected_packs")
      .map(([key, val]) => {
        const label = key.split(".").pop()?.replace(/_/g, " ") ?? key;
        const displayVal = Array.isArray(val.value)
          ? val.value.join(", ")
          : String(val.value);
        return {
          name: `${label}: ${displayVal}`,
          value: key,
        };
      });

    // "Done" at the TOP so it's always visible
    choices.unshift(
      { name: BOLD(pl ? "← Wróć (zapisz)" : "← Back (save)"), value: "__done__" },
    );
    choices.push(
      { name: YELLOW(pl ? "+ Dodaj nowy wymiar" : "+ Add new dimension"), value: "__add__" },
    );

    const selected = await select({
      message: pl ? "Co edytować?" : "Edit which dimension?",
      choices,
    });

    if (selected === "__done__") {
      editing = false;
      continue;
    }

    if (selected === "__add__") {
      const newKey = await input({ message: pl ? "Klucz wymiaru (np. context.hobby):" : "Dimension key (e.g. context.hobby):" });
      if (!newKey.trim()) continue;

      const newVal = await input({ message: pl ? "Wartość:" : "Value:" });
      if (!newVal.trim()) continue;

      profile.explicit[newKey.trim()] = {
        dimension: newKey.trim(),
        value: newVal.trim(),
        confidence: 1.0,
        source: "explicit",
        question_id: "manual",
      };

      console.log(GREEN("  ✓ ") + (pl ? `Dodano ${newKey.trim()}` : `Added ${newKey.trim()}`));
      continue;
    }

    // Edit existing
    const current = profile.explicit[selected];
    const currentDisplay = Array.isArray(current.value)
      ? current.value.join(", ")
      : String(current.value);

    console.log(DIM(`  ${pl ? "Obecna wartość" : "Current"}: ${currentDisplay}`));

    const action = await select({
      message: pl ? "Co zrobić?" : "What to do?",
      choices: [
        { name: pl ? "Zmień wartość" : "Change value", value: "change" },
        { name: RED(pl ? "Usuń" : "Delete"), value: "delete" },
        { name: DIM(pl ? "Anuluj" : "Cancel"), value: "cancel" },
      ],
    });

    if (action === "change") {
      const newVal = await input({
        message: pl ? "Nowa wartość:" : "New value:",
        default: currentDisplay,
      });
      if (newVal.trim()) {
        profile.explicit[selected] = {
          ...current,
          value: newVal.trim(),
          source: "explicit",
        };
        console.log(GREEN("  ✓ ") + (pl ? "Zaktualizowano" : "Updated"));
      }
    } else if (action === "delete") {
      delete profile.explicit[selected];
      console.log(GREEN("  ✓ ") + (pl ? "Usunięto" : "Removed"));
    }
  }

  // Save
  profile.updated_at = new Date().toISOString();
  const { recomputeProfile } = await import("@meport/core");
  recomputeProfile(profile);
  await writeFile(options.profile, JSON.stringify(profile, null, 2), "utf-8");
  const { saveSnapshot } = await import("./history.js");
  await saveSnapshot(options.profile);
  console.log(GREEN(pl ? "\n  ✓ Profil zapisany." : "\n  ✓ Profile saved.") + DIM(" Re-export: meport export --all\n"));
}
