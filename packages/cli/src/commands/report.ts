/**
 * meport report — Me Report
 *
 * Generates a personal insight report based on your profile.
 * Shows: who you are, patterns, strengths, blind spots, recommendations.
 * Can be saved as markdown or displayed in terminal.
 *
 * With AI: deep analysis + personalized insights
 * Without AI: structured summary from profile data
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import ora from "ora";
import { select, confirm } from "@inquirer/prompts";
import {
  createAIClient,
  collectRules,
  collectPackExportRules,
  loadPacks,
  getAvailablePackIds,
  type PersonaProfile,
  type AIConfig,
} from "@meport/core";
import { loadConfig } from "./config.js";
import {
  GREEN,
  BOLD,
  CYAN,
  DIM,
  RED,
  YELLOW,
} from "../ui/display.js";

interface ReportOptions {
  profile: string;
  lang?: string;
  output?: string;
}

export async function reportCommand(options: ReportOptions): Promise<void> {
  const pl = (options.lang ?? "").startsWith("pl") ||
    (!options.lang && (process.env.LANG ?? "").startsWith("pl"));

  let profile: PersonaProfile;
  try {
    const raw = await readFile(options.profile, "utf-8");
    profile = JSON.parse(raw);
  } catch {
    console.log(RED("✗ ") + (pl ? "Brak profilu." : "No profile found."));
    return;
  }

  const config = await loadConfig();
  const hasAI = !!config.ai?.provider;

  if (hasAI) {
    await generateAIReport(profile, config.ai as AIConfig, pl, options.output, options.profile);
  } else {
    generateLocalReport(profile, pl, options.output);
  }
}

async function generateAIReport(
  profile: PersonaProfile,
  aiConfig: AIConfig,
  pl: boolean,
  outputPath?: string,
  profilePath?: string
): Promise<void> {
  const client = createAIClient(aiConfig);

  const spin = ora(pl ? "🧠 Generuję Me Report..." : "🧠 Generating Me Report...").start();

  // Build profile summary for AI
  const dims = Object.entries(profile.explicit)
    .filter(([k]) => !k.startsWith("_") && !k.startsWith("selected"))
    .map(([k, v]) => `${k}: ${Array.isArray(v.value) ? v.value.join(", ") : v.value}`)
    .join("\n");

  const compounds = Object.entries(profile.compound)
    .map(([k, v]) => `${k}: ${v.value} (${Math.round(v.confidence * 100)}%)`)
    .join("\n");

  try {
    const response = await client.generate(
      `You are meport — an AI profiling engine. Generate a comprehensive "Me Report" for this person.

Profile data:
${dims}

Compound signals:
${compounds || "none"}

Profile completeness: ${Math.round(profile.completeness)}%
Created: ${profile.created_at}
Updated: ${profile.updated_at}

Generate a RICH, INSIGHTFUL report with these sections:
1. **Who You Are** — 3-4 sentence narrative summary (not a list)
2. **Your Superpowers** — 3-4 things that make you unique based on the data
3. **Your Patterns** — behavioral patterns AI detected (work style + communication + energy)
4. **Blind Spots** — things to watch out for based on patterns (honest, not mean)
5. **How AI Should Work With You** — the 5 most important rules, in order
6. **One Thing to Try** — one actionable suggestion based on the full profile

${pl ? "WRITE ENTIRELY IN POLISH." : "Write in English."}
Be specific. Reference actual data points. Don't be generic.
Format as clean markdown with headers and bullet points.`
    );

    spin.succeed(pl ? "Me Report gotowy" : "Me Report ready");

    console.log();
    console.log(BOLD(pl ? "━━━ ME REPORT ━━━\n" : "━━━ ME REPORT ━━━\n"));
    console.log(response);
    console.log();

    // Save if requested
    if (outputPath) {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, response, "utf-8");
      console.log(GREEN("  ✓ ") + `Saved to ${CYAN(outputPath)}`);
    } else {
      const save = await confirm({
        message: pl ? "Zapisać jako plik?" : "Save to file?",
        default: false,
      });

      if (save) {
        const reportDir = join(dirname(profilePath ?? "./meport-profile.json"), "meport-reports");
        const date = new Date().toISOString().slice(0, 10);
        const filePath = join(reportDir, `me-report-${date}.md`);
        await mkdir(reportDir, { recursive: true });
        await writeFile(filePath, response, "utf-8");
        console.log(GREEN("  ✓ ") + `Saved to ${CYAN(filePath)}`);
      }
    }
  } catch (err: any) {
    spin.fail(err.message);
  }
}

function generateLocalReport(
  profile: PersonaProfile,
  pl: boolean,
  outputPath?: string
): void {
  const name = getVal(profile, "identity.preferred_name") ?? "User";
  const occupation = getVal(profile, "context.occupation") ?? "";
  const verbosity = getVal(profile, "communication.verbosity_preference") ?? "";
  const energy = getVal(profile, "work.energy_archetype") ?? "";
  const motivation = getVal(profile, "personality.core_motivation") ?? "";
  const deadline = getVal(profile, "work.deadline_behavior") ?? "";
  const expertise = getVal(profile, "expertise.level") ?? "";
  const antiPatterns = getVal(profile, "communication.anti_patterns") ?? "";
  const achievement = getVal(profile, "identity.key_achievement") ?? "";
  const vision = getVal(profile, "identity.vision") ?? "";
  const fear = getVal(profile, "personality.core_fear") ?? "";
  const humor = getVal(profile, "communication.humor") ?? "";
  const risk = getVal(profile, "personality.risk_tolerance") ?? "";

  console.log();
  console.log(BOLD(pl ? "━━━ ME REPORT ━━━\n" : "━━━ ME REPORT ━━━\n"));

  // Who you are
  console.log(BOLD(pl ? "  Kim jesteś\n" : "  Who You Are\n"));
  const parts = [name];
  if (occupation) parts.push(occupation);
  if (expertise) parts.push(`${expertise} level`);
  if (motivation) parts.push(`driven by ${motivation}`);
  console.log(`  ${parts.join(" — ")}`);
  if (achievement) console.log(DIM(`  Achievement: ${achievement}`));
  if (vision) console.log(DIM(`  Vision: ${vision}`));
  console.log();

  // Patterns
  console.log(BOLD(pl ? "  Twoje wzorce\n" : "  Your Patterns\n"));
  if (energy) console.log(`  ⚡ Energy: ${energy}`);
  if (deadline) console.log(`  ⏰ Deadlines: ${deadline}`);
  if (verbosity) console.log(`  💬 Communication: ${verbosity}`);
  if (humor) console.log(`  😄 Humor: ${humor}`);
  if (risk) console.log(`  🎲 Risk: ${risk}`);
  console.log();

  // Anti-patterns
  if (antiPatterns) {
    console.log(BOLD(pl ? "  Twoje zasady\n" : "  Your Rules\n"));
    const patterns = antiPatterns.split(", ");
    for (const p of patterns) {
      console.log(`  🚫 ${p.replace("no_", "No ")}`);
    }
    console.log();
  }

  // Blind spots
  if (fear) {
    console.log(BOLD(pl ? "  Na co uważać\n" : "  Watch Out For\n"));
    console.log(`  ${DIM(fear)}`);
    console.log();
  }

  // Completeness
  const dims = Object.keys(profile.explicit).length;
  console.log(DIM(`  ${dims} dimensions | ${Math.round(profile.completeness)}% complete`));
  console.log(DIM(pl ? "  Skonfiguruj AI (meport config) żeby dostać głębszy raport.\n" : "  Configure AI (meport config) for a deeper report.\n"));
}

function getVal(profile: PersonaProfile, key: string): string | undefined {
  const val = profile.explicit[key];
  if (!val) return undefined;
  return Array.isArray(val.value) ? val.value.join(", ") : String(val.value);
}
