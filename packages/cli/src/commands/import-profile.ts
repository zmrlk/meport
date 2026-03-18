/**
 * meport import — Import and upgrade existing AI custom instructions
 *
 * User already has custom instructions in ChatGPT/Claude/Cursor/etc.
 * They paste or point to a file → meport parses → finds gaps → upgrades.
 *
 * Flow:
 * 1. User provides existing instructions (paste or file)
 * 2. AI analyzes what's there and what's missing
 * 3. Shows gap analysis: "You have X, you're missing Y"
 * 4. Offers to fill gaps via scan + quick interview
 * 5. Exports improved version
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import ora from "ora";
import { select, input, confirm } from "@inquirer/prompts";
import {
  createAIClient,
  runSystemScan,
  recomputeProfile,
  collectPackExportRules,
  collectRules,
  compileAllRules,
  loadPacks,
  getAvailablePackIds,
  type PersonaProfile,
  type AIConfig,
  type DimensionValue,
} from "@meport/core";
import {
  banner,
  completenessBar,
  GREEN,
  BOLD,
  CYAN,
  DIM,
  RED,
  YELLOW,
} from "../ui/display.js";
import { loadConfig } from "./config.js";
import { shellCommand } from "./shell.js";

interface ImportOptions {
  profile: string;
  lang?: string;
  file?: string;
}

export async function importCommand(options: ImportOptions): Promise<void> {
  banner();

  const pl = (options.lang ?? "").startsWith("pl") ||
    (!options.lang && (process.env.LANG ?? "").startsWith("pl"));

  console.log(
    BOLD(pl
      ? "━━━ Import profilu ━━━\n"
      : "━━━ Import Profile ━━━\n")
  );

  console.log(
    pl
      ? DIM("  Masz już custom instructions w ChatGPT, Claude lub innym AI?\n  Wrzuć je tutaj — ulepszymy je i uzupełnimy luki.\n")
      : DIM("  Already have custom instructions in ChatGPT, Claude or other AI?\n  Paste them here — we'll upgrade and fill the gaps.\n")
  );

  // ─── Get existing instructions ──────────────────────
  let existingText = "";

  if (options.file) {
    try {
      existingText = await readFile(options.file, "utf-8");
      console.log(GREEN("  ✓ ") + `Read from ${options.file}`);
    } catch {
      console.log(RED("  ✗ ") + `Could not read ${options.file}`);
    }
  }

  if (!existingText) {
    const source = await select({
      message: pl ? "Skąd masz instrukcje?" : "Where are your instructions from?",
      choices: [
        { name: "ChatGPT Custom Instructions", value: "chatgpt" },
        { name: "Claude Project Instructions", value: "claude" },
        { name: "Cursor (.cursorrules / .mdc)", value: "cursor" },
        { name: "CLAUDE.md", value: "claudemd" },
        { name: pl ? "Inne / wklej tekst" : "Other / paste text", value: "paste" },
        { name: pl ? "Wskaż plik" : "Point to file", value: "file" },
      ],
    });

    if (source === "file") {
      const filePath = await input({
        message: pl ? "Ścieżka do pliku:" : "File path:",
      });
      try {
        existingText = await readFile(filePath.trim(), "utf-8");
      } catch {
        console.log(RED("  ✗ ") + (pl ? "Nie mogę przeczytać pliku." : "Cannot read file."));
        return;
      }
    } else if (source === "claudemd") {
      // Try to find CLAUDE.md automatically
      const paths = ["./CLAUDE.md", "../CLAUDE.md", `${process.env.HOME}/.claude/CLAUDE.md`];
      for (const p of paths) {
        try {
          existingText = await readFile(p, "utf-8");
          console.log(GREEN("  ✓ ") + `Found ${p}`);
          break;
        } catch {}
      }
      if (!existingText) {
        console.log(DIM(pl ? "  Nie znalazłem CLAUDE.md. Wklej treść:" : "  Couldn't find CLAUDE.md. Paste content:"));
        existingText = await input({ message: ">" });
      }
    } else if (source === "cursor") {
      const paths = ["./.cursorrules", "./.cursor/rules/meport.mdc"];
      for (const p of paths) {
        try {
          existingText = await readFile(p, "utf-8");
          console.log(GREEN("  ✓ ") + `Found ${p}`);
          break;
        } catch {}
      }
      if (!existingText) {
        existingText = await input({ message: pl ? "Wklej treść:" : "Paste content:" });
      }
    } else {
      console.log(
        pl
          ? DIM("\n  Wklej swoje custom instructions (Enter 2x żeby zakończyć):\n")
          : DIM("\n  Paste your custom instructions (Enter 2x to finish):\n")
      );
      existingText = await input({ message: ">" });
    }
  }

  if (!existingText.trim()) {
    console.log(RED(pl ? "  Brak tekstu do importu." : "  No text to import."));
    return;
  }

  console.log(DIM(`\n  ${existingText.length} ${pl ? "znaków" : "chars"} imported\n`));

  // ─── AI analysis of existing instructions ───────────
  const config = await loadConfig();
  const hasAI = !!config.ai?.provider;

  if (!hasAI) {
    // Without AI — parse rules manually and create basic profile
    console.log(
      YELLOW(pl
        ? "  Bez AI mogę tylko skopiować Twoje instrukcje do nowego profilu.\n  Skonfiguruj AI (meport config) żeby dostać pełną analizę i uzupełnienie luk.\n"
        : "  Without AI I can only copy your instructions to a new profile.\n  Configure AI (meport config) for full analysis and gap filling.\n")
    );

    const profile = buildProfileFromText(existingText);
    await writeFile(options.profile, JSON.stringify(profile, null, 2), "utf-8");
    const { saveSnapshot } = await import("./history.js");
    await saveSnapshot(options.profile);
    console.log(GREEN("  ✓ ") + (pl ? "Profil zapisany. Uruchom meport update żeby go ulepszyć." : "Profile saved. Run meport update to improve it."));
    return;
  }

  // With AI — full analysis
  const client = createAIClient(config.ai as AIConfig);

  const analysisSpin = ora(
    pl ? "🧠 Analizuję Twoje obecne instrukcje..." : "🧠 Analyzing your current instructions..."
  ).start();

  try {
    const analysisResponse = await client.generate(
      `You are meport — an AI profiling engine. A user has existing custom instructions for AI. Analyze them and:

1. Extract ALL dimensions you can find (name, occupation, communication style, preferences, rules, anti-patterns, tech stack, etc.)
2. Identify what's MISSING that would make a great AI profile
3. Rate the current quality (1-10)
4. Suggest specific improvements

Existing instructions:
"""
${existingText.slice(0, 4000)}
"""

Output JSON:
{
  "quality_score": 7,
  "summary": "1-2 sentence summary of what these instructions contain. ${pl ? "PO POLSKU." : ""}",
  "extracted_dimensions": {
    "identity.preferred_name": "name if found",
    "communication.verbosity": "preference if found",
    "communication.anti_patterns": "patterns if found"
  },
  "strengths": ["what's good about these instructions"],
  "missing": ["critical things missing for a complete AI profile"],
  "improvements": ["specific suggestions to make these better"],
  "upgraded_rules": ["improved versions of their rules + new rules to add"]
}${pl ? "\n\nODPOWIEDZ PO POLSKU (strengths, missing, improvements)." : ""}`
    );

    analysisSpin.succeed(pl ? "Analiza gotowa" : "Analysis complete");

    const analysis = parseJSON(analysisResponse);

    // Show results
    console.log();

    if (analysis.summary) {
      console.log(CYAN("  " + analysis.summary));
      console.log();
    }

    // Quality score
    const score = analysis.quality_score ?? 5;
    console.log(`  ${BOLD(pl ? "Jakość:" : "Quality:")} ${score}/10`);
    console.log();

    // Strengths
    if (analysis.strengths?.length) {
      console.log(GREEN(pl ? "  ✓ Co jest dobrze:" : "  ✓ What's good:"));
      for (const s of analysis.strengths) {
        console.log(`    ${s}`);
      }
      console.log();
    }

    // Missing
    if (analysis.missing?.length) {
      console.log(YELLOW(pl ? "  ⚠ Czego brakuje:" : "  ⚠ What's missing:"));
      for (const m of analysis.missing) {
        console.log(`    ${m}`);
      }
      console.log();
    }

    // Improvements
    if (analysis.improvements?.length) {
      console.log(CYAN(pl ? "  💡 Sugestie:" : "  💡 Suggestions:"));
      for (const imp of analysis.improvements) {
        console.log(`    ${imp}`);
      }
      console.log();
    }

    // Offer to upgrade
    const upgrade = await confirm({
      message: pl
        ? "Chcesz żebym uzupełnił luki? (skan komputera + kilka pytań)"
        : "Want me to fill the gaps? (computer scan + a few questions)",
      default: true,
    });

    if (upgrade) {
      // Build initial profile from extracted dimensions
      const profile = buildProfileFromDimensions(analysis.extracted_dimensions ?? {});

      // Add upgraded rules as export rules
      if (analysis.upgraded_rules?.length) {
        profile.explicit["_imported_rules"] = {
          dimension: "_imported_rules",
          value: analysis.upgraded_rules.join("\n"),
          confidence: 1.0,
          source: "explicit",
          question_id: "import",
        };
      }

      // ─── INLINE GAP-FILL: scan + targeted questions ───
      // Step 1: System scan to auto-fill more dimensions
      const scanSpin = ora(
        pl ? "🔍 Skanuję komputer..." : "🔍 Scanning your computer..."
      ).start();
      try {
        const { context: scanResult } = await runSystemScan(process.cwd());
        let scanFilled = 0;
        for (const [key, val] of scanResult.dimensions) {
          if (key.startsWith("_")) continue;
          if (!profile.explicit[key]) {
            profile.explicit[key] = {
              dimension: key,
              value: val.value,
              confidence: 1 as const,
              source: "explicit",
              question_id: "scan",
            };
            scanFilled++;
          }
        }
        scanSpin.succeed(
          `${scanFilled} ${pl ? "wymiarów z skanowania" : "dimensions from scan"}`
        );
      } catch (err: any) {
        scanSpin.warn((pl ? "Skanowanie pominięte: " : "Scan skipped: ") + (err?.message ?? "unknown"));
      }

      // Step 2: Determine which critical dimensions are still missing
      const criticalDims = [
        "identity.preferred_name",
        "communication.verbosity_preference",
        "communication.directness",
        "primary_use_case",
        "context.occupation",
        "communication.anti_patterns",
        "ai.relationship_model",
        "work.energy_archetype",
        "cognitive.learning_style",
      ];
      const missing = criticalDims.filter((d) => !profile.explicit[d]);

      // Step 3: Ask AI to generate 3-4 targeted questions for gaps
      if (missing.length > 0 && hasAI) {
        const gapQuestions = await askTargetedGapQuestions(
          client, profile, missing, pl
        );

        // Apply answers to profile
        for (const [dim, val] of Object.entries(gapQuestions)) {
          if (val && typeof val === "string" && val.length > 0) {
            profile.explicit[dim] = {
              dimension: dim,
              value: val,
              confidence: 1.0,
              source: "explicit",
              question_id: "import_gap",
            };
          }
        }
      }

      // Step 4: Recompute derived layers
      try {
        const packs = await loadPacks(getAvailablePackIds());
        recomputeProfile(profile, packs);
      } catch {
        recomputeProfile(profile);
      }

      // Step 5: Save final profile
      await writeFile(options.profile, JSON.stringify(profile, null, 2), "utf-8");
      const { saveSnapshot: saveSnapshotUpgrade } = await import("./history.js");
      await saveSnapshotUpgrade(options.profile);

      const dimCount = Object.keys(profile.explicit).filter(
        (k) => !k.startsWith("_") && !k.startsWith("selected")
      ).length;
      console.log(
        GREEN("\n  ✓ ") +
        (pl
          ? `Profil gotowy! ${dimCount} wymiarów, ${Math.round(profile.completeness)}% kompletny`
          : `Profile ready! ${dimCount} dimensions, ${Math.round(profile.completeness)}% complete`)
      );

      // Step 6: Auto-export + deploy
      const doDeploy = await confirm({
        message: pl
          ? "Wdrożyć do platform? (Cursor, Claude Code, Copilot...)"
          : "Deploy to platforms? (Cursor, Claude Code, Copilot...)",
        default: true,
      });

      if (doDeploy) {
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
        console.log(
          GREEN("  ✓ ") +
          `${results.size} ${pl ? "platform" : "platforms"} → ${CYAN(exportDir + "/")}`
        );

        const { deployCommand } = await import("./deploy.js");
        await deployCommand({ profile: options.profile, lang: options.lang, all: true });
      }

      console.log();
      await shellCommand({ profile: options.profile, lang: options.lang });
    } else {
      // Just save what we extracted
      const profile = buildProfileFromDimensions(analysis.extracted_dimensions ?? {});
      await writeFile(options.profile, JSON.stringify(profile, null, 2), "utf-8");
      const { saveSnapshot: saveSnapshotExtracted } = await import("./history.js");
      await saveSnapshotExtracted(options.profile);
      console.log(GREEN("  ✓ ") + (pl ? "Profil zapisany." : "Profile saved."));
      await shellCommand({ profile: options.profile, lang: options.lang });
    }

  } catch (err: any) {
    analysisSpin.fail(err.message);
    console.log(DIM(pl ? "  Sprawdź konfigurację AI: meport config" : "  Check AI config: meport config"));
  }
}

// ─── Helpers ──────────────────────────────────────────

function buildProfileFromText(text: string): PersonaProfile {
  return {
    schema_version: "1.0",
    profile_type: "personal",
    profile_id: `imported-${Date.now()}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completeness: 20,
    explicit: {
      "_imported_text": {
        dimension: "_imported_text",
        value: text.slice(0, 5000),
        confidence: 1.0,
        source: "explicit",
        question_id: "import",
      },
    },
    inferred: {},
    compound: {},
    contradictions: [],
    emergent: [],
    meta: {
      tiers_completed: [],
      tiers_skipped: [],
      total_questions_answered: 0,
      total_questions_skipped: 0,
      avg_response_time_ms: 0,
      profiling_duration_ms: 0,
      profiling_method: "file_scan",
      layer3_available: false,
    },
  };
}

function buildProfileFromDimensions(dims: Record<string, string>): PersonaProfile {
  const explicit: Record<string, DimensionValue> = {};

  for (const [key, value] of Object.entries(dims)) {
    if (value && typeof value === "string" && value.length > 0 && value !== "not found" && value !== "unknown") {
      explicit[key] = {
        dimension: key,
        value,
        confidence: 1.0,
        source: "explicit",
        question_id: "import",
      };
    }
  }

  return {
    schema_version: "1.0",
    profile_type: "personal",
    profile_id: `imported-${Date.now()}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completeness: Math.min(100, Object.keys(explicit).length * 5),
    explicit,
    inferred: {},
    compound: {},
    contradictions: [],
    emergent: [],
    meta: {
      tiers_completed: [],
      tiers_skipped: [],
      total_questions_answered: 0,
      total_questions_skipped: 0,
      avg_response_time_ms: 0,
      profiling_duration_ms: 0,
      profiling_method: "file_scan",
      layer3_available: false,
    },
  };
}

async function askTargetedGapQuestions(
  client: ReturnType<typeof createAIClient>,
  profile: PersonaProfile,
  missing: string[],
  pl: boolean
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  // Ask AI to generate targeted questions for top 4 gaps
  const topMissing = missing.slice(0, 4);

  const existing = Object.entries(profile.explicit)
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => `${k}: ${Array.isArray(v.value) ? v.value.join(", ") : v.value}`)
    .join("\n");

  const questionSpin = ora(
    pl ? "🧠 Przygotowuję pytania..." : "🧠 Preparing questions..."
  ).start();

  try {
    const response = await client.generate(
      `You are meport — an AI profiling engine. You already know this about the user:

${existing}

You need to learn these dimensions: ${topMissing.join(", ")}

Generate ${topMissing.length} SHORT, conversational questions to fill these gaps.
Each question should have 3-4 clickable answer options.
${pl ? "WSZYSTKIE PYTANIA I OPCJE PO POLSKU." : ""}

Output JSON:
{
  "questions": [
    {
      "dimension": "dimension.key",
      "question": "short question text",
      "options": [
        {"label": "option text", "value": "stored_value"},
        {"label": "option text", "value": "stored_value"}
      ]
    }
  ]
}`
    );

    questionSpin.succeed(
      pl ? "Pytania gotowe" : "Questions ready"
    );

    const parsed = parseJSON(response);
    const questions = parsed.questions ?? [];

    console.log(
      DIM(pl
        ? "\n  Kilka szybkich pytań żeby uzupełnić profil:\n"
        : "\n  A few quick questions to complete your profile:\n")
    );

    for (const q of questions) {
      if (!q.dimension || !q.question || !q.options?.length) continue;

      try {
        const choices = q.options.map((o: any) => ({
          name: o.label,
          value: o.value,
        }));
        choices.push({
          name: pl ? "Pomiń" : "Skip",
          value: "__skip__",
        });

        const answer = await select({
          message: q.question,
          choices,
        });

        if (answer !== "__skip__") {
          results[q.dimension] = String(answer);
          console.log(`  ${GREEN("✓")} ${q.dimension.split(".").pop()?.replace(/_/g, " ")}: ${answer}`);
        }
      } catch {
        // User cancelled — skip remaining
        break;
      }
    }
  } catch (err: any) {
    questionSpin.warn(err.message);
  }

  return results;
}

function parseJSON(text: string): any {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return { summary: text };
}
