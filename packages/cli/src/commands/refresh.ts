/**
 * meport refresh — Living profile update
 *
 * Re-scans the system, compares with existing profile,
 * highlights what changed, asks if user wants to update.
 *
 * "Your profile from 2 weeks ago says you use Cursor.
 *  Now I see you also have Windsurf. Want to update?"
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import ora from "ora";
import { confirm, input, select } from "@inquirer/prompts";
import {
  runSystemScan,
  createAIClient,
  collectPackExportRules,
  collectRules,
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

interface RefreshOptions {
  profile: string;
  lang?: string;
}

export async function refreshCommand(options: RefreshOptions): Promise<void> {
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

  const createdAt = new Date(profile.created_at);
  const daysSince = Math.round((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

  console.log(
    BOLD(pl ? "\n━━━ Odświeżanie profilu ━━━\n" : "\n━━━ Profile Refresh ━━━\n")
  );
  console.log(
    DIM(pl
      ? `  Profil utworzony ${daysSince} dni temu (${createdAt.toLocaleDateString("pl")})`
      : `  Profile created ${daysSince} days ago (${createdAt.toLocaleDateString("en")})`)
  );
  console.log(
    DIM(`  ${Object.keys(profile.explicit).length} ${pl ? "wymiarów" : "dimensions"}, ${Math.round(profile.completeness)}% complete\n`)
  );

  // Re-scan system
  const scanSpin = ora(pl ? "Skanuję zmiany..." : "Scanning for changes...").start();
  const { context: newScan } = await runSystemScan(process.cwd());

  // Compare with existing profile
  const changes: { key: string; oldVal: string; newVal: string; type: "new" | "changed" | "removed" }[] = [];

  for (const [key, val] of newScan.dimensions) {
    if (key.startsWith("_")) continue;
    const existing = profile.explicit[key];
    if (!existing) {
      changes.push({ key, oldVal: "", newVal: val.value, type: "new" });
    } else {
      const existingStr = Array.isArray(existing.value) ? existing.value.join(", ") : String(existing.value);
      if (existingStr !== val.value) {
        changes.push({ key, oldVal: existingStr, newVal: val.value, type: "changed" });
      }
    }
  }

  scanSpin.succeed(
    `${changes.length} ${pl ? "zmian wykrytych" : "changes detected"}`
  );

  if (changes.length === 0) {
    console.log(
      GREEN(pl ? "\n  ✓ Profil aktualny — brak zmian.\n" : "\n  ✓ Profile up to date — no changes.\n")
    );
  } else {
    console.log();
    for (const change of changes) {
      const label = change.key.split(".").pop()?.replace(/_/g, " ") ?? change.key;
      if (change.type === "new") {
        console.log(`  ${GREEN("+")} ${label}: ${CYAN(change.newVal)}`);
      } else {
        console.log(`  ${YELLOW("~")} ${label}: ${DIM(change.oldVal)} → ${CYAN(change.newVal)}`);
      }
    }
    console.log();

    const apply = await confirm({
      message: pl ? "Zastosować te zmiany?" : "Apply these changes?",
      default: true,
    });

    if (apply) {
      for (const change of changes) {
        profile.explicit[change.key] = {
          dimension: change.key,
          value: change.newVal,
          confidence: 1.0,
          source: "explicit",
          question_id: "refresh",
        };
      }
    }
  }

  // Ask about life changes
  const lifeChange = await confirm({
    message: pl
      ? "Zmieniło się coś ważnego w Twoim życiu? (praca, projekty, cele)"
      : "Anything important changed in your life? (work, projects, goals)",
    default: false,
  });

  if (lifeChange) {
    const whatChanged = await input({
      message: pl ? "Co się zmieniło?" : "What changed?",
    });

    if (whatChanged.trim()) {
      // Try AI analysis of changes
      const config = await loadConfig();
      if (config.ai?.provider) {
        const client = createAIClient(config.ai as AIConfig);
        const updateSpin = ora(pl ? "🧠 Aktualizuję profil..." : "🧠 Updating profile...").start();

        try {
          const response = await client.generate(
            `User's existing profile has these dimensions:
${Object.entries(profile.explicit).map(([k, v]) => `${k}: ${Array.isArray(v.value) ? v.value.join(", ") : v.value}`).join("\n")}

User says this changed: "${whatChanged}"

Extract updated dimensions as JSON:
{"dimension.key": "new value", ...}
Only include dimensions that CHANGED based on what the user said.${pl ? "\nODPOWIEDZ PO POLSKU." : ""}`
          );

          updateSpin.succeed(pl ? "Zaktualizowano" : "Updated");

          const parsed = parseJSON(response);
          let updatedCount = 0;
          for (const [key, val] of Object.entries(parsed)) {
            if (typeof val === "string" && val.length > 0 && key !== "summary") {
              profile.explicit[key] = {
                dimension: key,
                value: val,
                confidence: 1.0,
                source: "explicit",
                question_id: "refresh",
              };
              updatedCount++;
              const label = key.split(".").pop()?.replace(/_/g, " ") ?? key;
              console.log(`  ${GREEN("✓")} ${label}: ${val}`);
            }
          }

          if (updatedCount > 0) {
            console.log(DIM(`\n  ${updatedCount} ${pl ? "wymiarów zaktualizowanych" : "dimensions updated"}`));
          }
        } catch (err: any) {
          updateSpin.warn((err.message || "").slice(0, 80));
        }
      } else {
        // No AI — manual update
        profile.explicit["context.recent_changes"] = {
          dimension: "context.recent_changes",
          value: whatChanged.trim(),
          confidence: 1.0,
          source: "explicit",
          question_id: "refresh",
        };
      }
    }
  }

  // Save + re-export
  profile.updated_at = new Date().toISOString();
  await writeFile(options.profile, JSON.stringify(profile, null, 2), "utf-8");
  console.log(GREEN("\n  ✓ ") + (pl ? "Profil zaktualizowany." : "Profile updated."));

  // Save snapshot to history
  const { saveSnapshot } = await import("./history.js");
  await saveSnapshot(options.profile);

  // Auto re-export + auto-deploy
  let packRules = new Map<string, string>();
  try {
    const packs = await loadPacks(getAvailablePackIds());
    packRules = collectPackExportRules(packs);
  } catch {}

  const exportDir = join(dirname(options.profile), "meport-exports");
  const results = compileAllRules(profile, packRules);
  await mkdir(exportDir, { recursive: true });
  for (const [, res] of results) {
    await writeFile(join(exportDir, res.filename), res.content, "utf-8");
  }
  console.log(GREEN("  ✓ ") + `${results.size} ${pl ? "platform" : "platforms"} → ${CYAN(exportDir + "/")}`);

  // Auto-deploy to file-based platforms in current directory
  const autoDeploy = await confirm({
    message: pl ? "Wdrożyć do projektów? (Cursor, Claude Code, Copilot...)" : "Deploy to projects? (Cursor, Claude Code, Copilot...)",
    default: true,
  });

  if (autoDeploy) {
    const { deployCommand } = await import("./deploy.js");
    await deployCommand({ profile: options.profile, lang: options.lang, all: true });
  }

  console.log();
}

function parseJSON(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return {};
}
