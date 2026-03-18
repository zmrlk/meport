/**
 * meport profile (v2) — Full Session Profiling
 *
 * One conversation = maximum profile.
 *
 * Flow:
 * 1. System scan (silent) — detect what we can automatically
 * 2. Intro — name + age only (everything else from scan or packs)
 * 3. File scan consent — scan files OR broad questions
 * 4. Summary #1 — "here's what I know" + corrections
 * 5. Pack questions — communication, work, lifestyle, etc. (skip what's already known)
 * 6. Summary #2 — final profile + inline export preview
 * 7. Confirm → auto-export
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import ora from "ora";
import { select, input, confirm } from "@inquirer/prompts";
import {
  PackProfilingEngine,
  loadPack,
  loadPacks,
  collectPackExportRules,
  runPackLayer2,
  collectRules,
  compileAllRules,
  runSystemScan,
  runFileScan,
  detectLocale,
  type PackEngineEvent,
  type PackAnswerInput,
  type PackId,
  type PersonaProfile,
  type Pack,
  type Locale,
  type ScanContext,
} from "@meport/core";
import {
  banner,
  packHeader,
  packComplete,
  packProgress,
  finalSummary,
  completenessBar,
  GREEN,
  BOLD,
  CYAN,
  DIM,
  RED,
  YELLOW,
} from "../ui/display.js";
import { askPackQuestion, askPackSelection, askConfirm } from "../ui/pack-prompts.js";
import { saveSession } from "./continue.js";
import { shellCommand } from "./shell.js";

interface ProfileV2Options {
  output: string;
  exportDir?: string;
  lang?: string;
  scan?: string[];
  quick?: boolean;
}

export async function profileV2Command(
  options: ProfileV2Options
): Promise<void> {
  banner((options.lang ?? "").startsWith("pl") || (!options.lang && (process.env.LANG ?? "").startsWith("pl")));

  const locale = detectLocale(options.lang);
  const pl = locale === "pl";

  const collectedDims = new Map<
    string,
    { value: string; confidence: number; source: string }
  >();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE 0: SYSTEM SCAN — detect everything automatically
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const scanSpinner = ora(pl ? "Skanuję system..." : "Scanning your system...").start();
  const { context: sysContext, sources: sysSources } = await runSystemScan(process.cwd());

  for (const [dim, val] of sysContext.dimensions) {
    collectedDims.set(dim, val);
  }

  if (sysContext.dimensions.size > 0) {
    scanSpinner.succeed(
      pl
        ? `Wykryłem ${sysContext.dimensions.size} rzeczy automatycznie`
        : `Auto-detected ${sysContext.dimensions.size} dimensions`
    );
  } else {
    scanSpinner.succeed(pl ? "Gotowe" : "Ready");
  }

  console.log();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE 1: INTRO — only what we can't detect
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Show what system scan detected
  if (collectedDims.size > 0) {
    const detectedName = collectedDims.get("identity.preferred_name")?.value;
    if (detectedName) {
      console.log(
        pl
          ? BOLD(`Cześć${detectedName ? ` ${detectedName}` : ""}! Poznajmy się.\n`)
          : BOLD(`Hey${detectedName ? ` ${detectedName}` : ""}! Let's get to know each other.\n`)
      );
    } else {
      console.log(
        pl ? BOLD("Cześć! Poznajmy się.\n") : BOLD("Hey! Let's get to know each other.\n")
      );
    }
  } else {
    console.log(
      pl ? BOLD("Cześć! Poznajmy się.\n") : BOLD("Hey! Let's get to know each other.\n")
    );
  }

  // Show detected dimensions so user sees the value of scan
  const showDims = [...collectedDims.entries()].filter(([k]) => !k.startsWith("_") && !k.startsWith("identity.timezone"));
  if (showDims.length > 2) {
    console.log(DIM(pl ? "  Wykryłem:" : "  Detected:"));
    for (const [k, v] of showDims.slice(0, 5)) {
      const label = k.split(".").pop()?.replace(/_/g, " ") ?? k;
      console.log(DIM(`    ${label}: ${v.value}`));
    }
    if (showDims.length > 5) console.log(DIM(pl ? `    +${showDims.length - 5} więcej` : `    +${showDims.length - 5} more`));
  }

  console.log();

  // File scan only via --scan flag in classic mode
  // (AI mode handles file scan with LLM analysis — much better)
  if (options.scan && options.scan.length > 0) {
    await doFileScan(options.scan, collectedDims, pl);
  }

  console.log();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE 2b: FIRST SUMMARY — show auto-detected profile
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Show what we've gathered so far
  if (collectedDims.size > 2) { // more than just name+age
    showCurrentProfile(collectedDims, pl);

    const isCorrect = await confirm({
      message: pl ? "Zgadza się?" : "Correct?",
      default: true,
    });

    if (!isCorrect) {
      await fixDimension(collectedDims, pl);
    }
    console.log();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHASE 3: PACK QUESTIONS — deep dive
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log(
    pl
      ? BOLD("Teraz pytania — chcę zrozumieć jak pracujesz i myślisz.\n")
        + "\n"
        + `  ${BOLD("Jak to działa:")}\n`
        + `  ${DIM("1.")} Micro-setup — 4 pytania (imię, styl, anty-wzorce, pakiety)\n`
        + `  ${DIM("2.")} Komunikacja — 15 pytań scenariuszowych\n`
        + `  ${DIM("3.")} Praca + Kontekst — 10-20 pytań (zależy od pakietów)\n`
        + `  ${DIM("4.")} Podsumowanie + eksport\n`
        + "\n"
        + `  ${DIM("Łącznie ~40 pytań, ~10 minut. Większość to click-click-click.")}\n`
        + `  ${DIM("Ctrl+C w dowolnym momencie = postęp zapisany.")}\n`
      : BOLD("Now questions — I want to understand how you work and think.\n")
        + "\n"
        + `  ${BOLD("How it works:")}\n`
        + `  ${DIM("1.")} Micro-setup — 4 questions (name, style, anti-patterns, packs)\n`
        + `  ${DIM("2.")} Communication — 15 scenario questions\n`
        + `  ${DIM("3.")} Work + Context — 10-20 questions (depends on packs)\n`
        + `  ${DIM("4.")} Summary + export\n`
        + "\n"
        + `  ${DIM("Total ~40 questions, ~10 minutes. Most are click-click-click.")}\n`
        + `  ${DIM("Ctrl+C anytime = progress saved.")}\n`
  );

  const scanContext: ScanContext = { dimensions: collectedDims };
  const microSetup = await loadPack("micro-setup", undefined, locale);
  if (!microSetup) {
    console.log(RED("Could not load micro-setup pack."));
    return;
  }

  const engine = new PackProfilingEngine(microSetup, scanContext);
  const allLoadedPacks: Pack[] = [microSetup];

  // Ctrl+C handler
  const sigintHandler = async () => {
    console.log("\n");
    const s = ora("Saving session...").start();
    try {
      await saveSession(engine, options.output);
      s.succeed("Session saved. Resume: " + CYAN("meport continue"));
    } catch { s.fail("Could not save session"); }
    process.exit(0);
  };
  process.on("SIGINT", sigintHandler);

  type QHistoryEntry = { event: PackEngineEvent; answer: PackAnswerInput };
  const history: QHistoryEntry[] = [];

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
        // Skip dimensions already collected with high confidence
        if (isAlreadyCollected(event.question.dimension, collectedDims)) {
          result = gen.next(undefined);
          break;
        }

        let answer: PackAnswerInput;
        while (true) {
          const prog = packProgress(event.index, event.total, event.pack);
          answer = await askPackQuestion(event.question, prog, pl);

          if (answer.value === "__back__" && history.length === 0) {
            console.log(DIM("  (already at start)\n"));
            continue;
          }

          if (answer.value === "__back__" && history.length > 0) {
            const prev = history.pop()!;
            console.log(DIM("  ↩\n"));
            const prevProg = packProgress(
              (prev.event as any).index ?? 0,
              (prev.event as any).total ?? 0,
              (prev.event as any).pack ?? ""
            );
            const newAns = await askPackQuestion((prev.event as any).question, prevProg, pl);
            if (newAns.value !== "__back__") {
              engine.updateAnswer((prev.event as any).question, newAns, (prev.event as any).pack);
              history.push({ event: prev.event, answer: newAns });
            }
            continue;
          }
          break;
        }
        history.push({ event, answer });
        result = gen.next(answer);
        break;
      }

      case "confirm": {
        const prog = packProgress(event.index, event.total, event.pack);
        const answer = await askConfirm(event.question, event.detectedValue, event.detectedSource, prog, pl);
        history.push({ event, answer });
        result = gen.next(answer);
        break;
      }

      case "pack_selection": {
        let answer: PackAnswerInput;
        if (options.quick) {
          // Quick mode — core + context packs (fast but useful)
          answer = { value: ["core", "context"] };
          console.log(DIM(pl ? "  Quick mode — kluczowe pytania\n" : "  Quick mode — key questions only\n"));
        } else {
          answer = await askPackSelection(event.question, pl);
        }
        const selectedIds = answer.value as string[];
        engine.setSelectedPacks(selectedIds as PackId[]);

        const toLoad: PackId[] = ["core" as PackId];
        for (const id of selectedIds) {
          if (id !== "core") toLoad.push(id as PackId);
        }

        const loadSpin = ora(pl ? "Ładuję..." : "Loading...").start();
        try {
          const packs = await loadPacks(toLoad, undefined, locale);
          engine.addPacks(packs);
          allLoadedPacks.push(...packs);
          loadSpin.succeed(`${packs.length} packs loaded`);
        } catch (err: any) { loadSpin.warn("Some packs failed: " + (err?.message ?? "unknown")); }

        result = gen.next(answer);
        break;
      }

      case "pack_complete":
        packComplete(event.pack, event.questionsAnswered, pl);
        result = gen.next(undefined);
        break;

      case "preview_ready":
        result = gen.next(undefined);
        break;

      case "profiling_complete": {
        const profile = event.profile;
        const exportRules = event.exportRules;

        const allPackExportRules = await collectAllExportRules(engine.getSelectedPacks(), locale);
        for (const [k, v] of exportRules) allPackExportRules.set(k, v);

        // Run inference
        const infSpin = ora(pl ? "Analizuję odpowiedzi..." : "Analyzing...").start();
        const enriched = runPackLayer2(profile, engine.getAnswers(), allLoadedPacks);
        infSpin.succeed(pl ? "Analiza gotowa" : "Analysis complete");

        const rules = collectRules(enriched, allPackExportRules);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // PHASE 4: FINAL SUMMARY + INLINE EXPORT PREVIEW
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        console.log();
        console.log(BOLD(pl ? "━━━ Twój profil AI ━━━\n" : "━━━ Your AI Profile ━━━\n"));

        // Show dimensions grouped
        const dimsByCategory = groupDimensions(enriched);
        for (const [cat, dims] of dimsByCategory) {
          console.log(`  ${BOLD(cat)}`);
          for (const [key, val] of dims) {
            const label = key.split(".").pop()?.replace(/_/g, " ") ?? key;
            const displayVal = Array.isArray(val.value) ? val.value.join(", ") : String(val.value);
            console.log(`    ${DIM(label + ":")} ${displayVal}`);
          }
          console.log();
        }

        // Show compound signals (AI inferences)
        const compounds = Object.entries(enriched.compound);
        if (compounds.length > 0) {
          console.log(`  ${BOLD(pl ? "🧠 AI wnioski" : "🧠 AI Insights")}`);
          for (const [, val] of compounds) {
            const label = val.dimension.split(".").pop()?.replace(/_/g, " ") ?? "";
            console.log(`    ${label}: ${CYAN(val.value)} ${DIM(`(${Math.round(val.confidence * 100)}%)`)}`);
          }
          console.log();
        }

        // Show contradictions
        if (enriched.contradictions.length > 0) {
          console.log(`  ${BOLD(pl ? "⚡ Sprzeczności" : "⚡ Contradictions")}`);
          for (const c of enriched.contradictions) {
            console.log(`    ${DIM(c.description)}`);
          }
          console.log();
        }

        // Stats bar
        finalSummary({
          dimensions: Object.keys(enriched.explicit).length,
          completeness: enriched.completeness,
          rules: rules.length,
          packs: engine.getSelectedPacks().length + 1,
          compounds: compounds.length,
        }, pl);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // PHASE 5: INLINE EXPORT PREVIEW
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        console.log(BOLD(pl ? "\n━━━ Twoje reguły dla AI ━━━\n" : "\n━━━ Your AI Rules ━━━\n"));
        console.log(DIM(pl ? "  To jest to co Twoje AI dostanie:\n" : "  This is what your AI will get:\n"));

        for (let i = 0; i < Math.min(rules.length, 8); i++) {
          console.log(`  ${GREEN(`${i + 1}.`)} ${rules[i].rule}`);
        }
        if (rules.length > 8) {
          console.log(DIM(`  ... +${rules.length - 8} ${pl ? "więcej" : "more"}`));
        }
        console.log();

        // Final confirmation
        const isOk = await confirm({
          message: pl ? "Wygląda dobrze? Eksportować?" : "Looks good? Export?",
          default: true,
        });

        if (!isOk) {
          const correction = await input({
            message: pl ? "Co zmienić? (np. 'nie mów per Pan')" : "What to change?",
          });
          if (correction.trim()) {
            allPackExportRules.set("custom_correction", correction.trim());
          }
        }

        // Save profile
        const saveSpin = ora(pl ? "Zapisuję..." : "Saving...").start();
        try {
          await writeFile(options.output, JSON.stringify(enriched, null, 2), "utf-8");
          const { saveSnapshot } = await import("./history.js");
          await saveSnapshot(options.output);
          saveSpin.succeed((pl ? "Profil: " : "Profile: ") + CYAN(options.output));
        } catch (saveErr) {
          saveSpin.fail(pl ? "Nie udało się zapisać pliku!" : "Failed to save profile file!");
          console.error(pl
            ? "\n  Awaryjna kopia profilu (skopiuj i zapisz ręcznie):\n"
            : "\n  Emergency profile dump (copy and save manually):\n"
          );
          console.log(JSON.stringify(enriched, null, 2));
          throw saveErr;
        }

        // ─── Reveal ─────────────────────────────────────
        console.log(BOLD(pl ? "\n  ━━━ Twój profil AI ━━━\n" : "\n  ━━━ Your AI Profile ━━━\n"));

        // Name + completeness
        const name = enriched.explicit["identity.preferred_name"]?.value ?? "You";
        console.log(`  ${GREEN("●")} ${BOLD(String(name))} — ${enriched.completeness}% ${pl ? "kompletny" : "complete"}`);

        // Top 5 rules (from compiled rules)
        const topRules = rules.slice(0, 5);
        if (topRules.length > 0) {
          console.log(pl ? "\n  Twoje reguły AI:\n" : "\n  Your AI rules:\n");
          for (const r of topRules) {
            console.log(`  ${DIM("→")} ${r.rule}`);
          }
        }

        // Dimension count
        const dimCount = Object.keys(enriched.explicit).length + Object.keys(enriched.inferred).length;
        console.log(`\n  ${DIM(pl ? `${dimCount} wymiarów · ${Object.keys(enriched.explicit).length} jawnych · ${Object.keys(enriched.inferred).length} wnioskowanych` : `${dimCount} dimensions · ${Object.keys(enriched.explicit).length} explicit · ${Object.keys(enriched.inferred).length} inferred`)}`);
        console.log();

        // AUTO-EXPORT — generate all formats right now
        const exportDir = options.exportDir || join(dirname(options.output), "meport-exports");
        const exportSpin = ora(pl ? "Generuję eksporty..." : "Generating exports...").start();
        try {
          const results = compileAllRules(enriched, allPackExportRules);
          await mkdir(exportDir, { recursive: true });

          for (const [, res] of results) {
            const filePath = join(exportDir, res.filename);
            await writeFile(filePath, res.content, "utf-8");
          }

          exportSpin.succeed(
            `${results.size} ${pl ? "platform" : "platforms"} → ${CYAN(exportDir + "/")}`
          );

          // Show export files
          console.log();
          for (const [platform, res] of results) {
            console.log(
              `  ${GREEN("✓")} ${BOLD(platform)} → ${res.filename} ${DIM(`(${res.charCount} chars)`)}`
            );
          }
        } catch (err: any) {
          exportSpin.warn((pl ? "Eksport nie powiódł się: " : "Export failed: ") + (err?.message ?? "unknown") + (pl ? " — profil zapisany" : " — profile saved"));
        }

        // Show how to use
        console.log();
        console.log(BOLD(pl ? "━━━ Co dalej? ━━━\n" : "━━━ What's next? ━━━\n"));
        console.log(
          `  ${CYAN("ChatGPT")} → ${pl ? "Skopiuj" : "Copy"} ${exportDir}/chatgpt-instructions.txt → Settings → Personalization`
        );
        console.log(
          `  ${CYAN("Claude")}  → ${pl ? "Skopiuj" : "Copy"} ${exportDir}/meport-profile.md → Projects → Instructions`
        );
        console.log(
          `  ${CYAN("Cursor")} → ${pl ? "Skopiuj" : "Copy"} ${exportDir}/meport.mdc → ${pl ? "root projektu" : "project root"}`
        );
        console.log(
          `  ${CYAN("Ollama")} → ${pl ? "Użyj" : "Use"} ${exportDir}/Modelfile`
        );
        console.log();
        console.log(
          GREEN("✓ ") + BOLD(pl ? "Gotowe!" : "Done!") +
          DIM(pl ? " Twoje AI Cię teraz zna." : " Your AI knows you now.")
        );
        console.log(DIM(pl
          ? "  Meport jest darmowy i open source. Jeśli Ci pomógł:"
          : "  Meport is free and open source. If it helped:"));
        console.log(DIM("  https://buymeacoffee.com/zmrlk"));
        console.log();

        process.removeListener("SIGINT", sigintHandler);

        // Stay in the app — show interactive menu
        await shellCommand({ profile: options.output, lang: options.lang });

        result = gen.next(undefined);
        break;
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────

async function doFileScan(
  paths: string[],
  dims: Map<string, { value: string; confidence: number; source: string }>,
  pl: boolean
): Promise<boolean> {
  const spinner = ora(pl ? "Skanuję pliki..." : "Scanning files...").start();
  const result = await runFileScan({ paths });

  if (result.context.dimensions.size === 0) {
    spinner.warn(pl ? "Nic nie znalazłem" : "Nothing found");
    return false;
  }

  spinner.succeed(
    `${result.context.dimensions.size} ${pl ? "wymiarów" : "dimensions"} ← ${result.sources.join(", ")}`
  );

  for (const [dim, val] of result.context.dimensions) {
    const label = formatDimLabel(dim);
    console.log(`  ${DIM(label + ":")} ${CYAN(val.value)}`);
    if (!dims.has(dim)) dims.set(dim, val);
  }
  console.log();
  return true;
}

function formatDimLabel(dim: string): string {
  const labels: Record<string, string> = {
    "context.occupation": "occupation",
    "context.industry": "industry",
    "context.location": "location",
    "context.life_stage": "life stage",
    "context.current_focus": "focus",
    "context.tools": "tools",
    "expertise.tech_stack": "tech stack",
    "expertise.ai_tools": "AI tools",
    "identity.language": "language",
    "identity.timezone": "timezone",
    "identity.preferred_name": "name",
    "identity.age": "age",
    "work.energy_archetype": "energy",
  };
  return labels[dim] ?? dim.split(".").pop()?.replace(/_/g, " ") ?? dim;
}

function showCurrentProfile(
  dims: Map<string, { value: string; confidence: number; source: string }>,
  pl: boolean
): void {
  console.log(
    pl ? BOLD("━━━ Co o Tobie wiem ━━━\n") : BOLD("━━━ What I know ━━━\n")
  );

  for (const [dim, val] of dims) {
    if (dim.startsWith("_")) continue;
    const label = formatDimLabel(dim);
    const conf = Math.round(val.confidence * 100);
    const src = val.source !== "intro" ? DIM(` ← ${val.source}`) : "";
    const confStr = conf < 90 ? DIM(` ~${conf}%`) : "";
    console.log(`  ${label}: ${CYAN(val.value)}${confStr}${src}`);
  }
  console.log();
}

async function fixDimension(
  dims: Map<string, { value: string; confidence: number; source: string }>,
  pl: boolean
): Promise<void> {
  const choices = [
    { name: pl ? "← Anuluj" : "← Cancel", value: "__cancel__" },
    ...[...dims.entries()]
      .filter(([k]) => !k.startsWith("_"))
      .map(([key, val]) => ({
        name: `${formatDimLabel(key)}: ${val.value}`,
        value: key,
      })),
  ];

  if (choices.length === 1) return; // only Cancel

  const toFix = await select({
    message: pl ? "Co poprawić?" : "What to fix?",
    choices,
  });

  if (toFix === "__cancel__") return;

  const newVal = await input({ message: pl ? "Nowa wartość:" : "New value:" });
  if (newVal.trim()) {
    dims.set(toFix, { value: newVal.trim(), confidence: 1.0, source: "correction" });
  }
}

function isAlreadyCollected(
  dimension: string,
  dims: Map<string, { value: string; confidence: number; source: string }>
): boolean {
  const existing = dims.get(dimension);
  return existing !== undefined && existing.confidence >= 0.9;
}

function groupDimensions(profile: PersonaProfile): Map<string, [string, any][]> {
  const groups = new Map<string, [string, any][]>();
  const categoryLabels: Record<string, string> = {
    identity: "Identity",
    context: "Context",
    communication: "Communication",
    ai: "AI Preferences",
    work: "Work Style",
    cognitive: "Cognitive",
    personality: "Personality",
    lifestyle: "Lifestyle",
    health: "Health",
    finance: "Finance",
    learning: "Learning",
    expertise: "Expertise",
  };

  for (const [key, val] of Object.entries(profile.explicit)) {
    if (key === "selected_packs") continue;
    const category = key.split(".")[0];
    const label = categoryLabels[category] ?? "Other";

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push([key, val]);
  }

  return groups;
}

async function collectAllExportRules(
  packIds: PackId[],
  locale?: Locale
): Promise<Map<string, string>> {
  const toLoad: PackId[] = ["micro-setup", "core", ...packIds];
  const unique = [...new Set(toLoad)];
  try {
    const packs = await loadPacks(unique);
    return collectPackExportRules(packs);
  } catch {
    return new Map();
  }
}
