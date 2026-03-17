/**
 * meport card — Visual personality card
 *
 * Generates a shareable ASCII art profile summary.
 * Can be screenshotted, tweeted, or printed.
 */

import { readFile } from "node:fs/promises";
import type { PersonaProfile } from "@meport/core";
import {
  GREEN,
  BOLD,
  CYAN,
  DIM,
  RED,
  YELLOW,
} from "../ui/display.js";

interface CardOptions {
  profile: string;
  lang?: string;
}

export async function cardCommand(options: CardOptions): Promise<void> {
  const pl = (options.lang ?? "").startsWith("pl") || (!options.lang && (process.env.LANG ?? "").startsWith("pl"));
  let profile: PersonaProfile;
  try {
    const raw = await readFile(options.profile, "utf-8");
    profile = JSON.parse(raw);
  } catch {
    console.log(RED("✗ ") + (pl ? "Brak profilu." : "No profile found."));
    return;
  }

  const name = getVal(profile, "identity.preferred_name") ?? "User";
  const occupation = getVal(profile, "context.occupation") ?? "";
  const techStack = getVal(profile, "expertise.tech_stack") ?? "";
  const verbosity = getVal(profile, "communication.verbosity_preference") ?? "";
  const energy = getVal(profile, "work.energy_archetype") ?? "";
  const motivation = getVal(profile, "personality.core_motivation") ?? "";
  const style = getVal(profile, "communication.formality") ?? "";
  const expertise = getVal(profile, "expertise.level") ?? "";
  const achievement = getVal(profile, "identity.key_achievement") ?? "";
  const vision = getVal(profile, "identity.vision") ?? "";
  const antiPatterns = getVal(profile, "communication.anti_patterns") ?? "";
  const hobbies = getVal(profile, "lifestyle.hobbies") ?? "";
  const location = getVal(profile, "context.location") ?? "";

  const dims = Object.keys(profile.explicit).length;
  const compounds = Object.keys(profile.compound).length;
  const completeness = Math.round(profile.completeness);

  // Build card
  const w = 52;
  const line = "━".repeat(w);
  const pad = (s: string, len: number) => s.slice(0, len).padEnd(len);

  console.log();
  console.log(CYAN(`  ┌${"─".repeat(w)}┐`));
  console.log(CYAN(`  │${" ".repeat(w)}│`));
  console.log(CYAN(`  │`) + BOLD(`  ${pad(name, w - 4)}`) + CYAN(`  │`));

  if (occupation) {
    console.log(CYAN(`  │`) + DIM(`  ${pad(occupation, w - 4)}`) + CYAN(`  │`));
  }
  if (location) {
    console.log(CYAN(`  │`) + DIM(`  📍 ${pad(location, w - 7)}`) + CYAN(`  │`));
  }

  console.log(CYAN(`  │${" ".repeat(w)}│`));
  console.log(CYAN(`  │`) + `  ${line.slice(0, w - 4)}  ` + CYAN(`│`));
  console.log(CYAN(`  │${" ".repeat(w)}│`));

  // Stats row
  if (techStack) {
    console.log(CYAN(`  │`) + `  🛠️  ${pad(techStack, w - 7)}` + CYAN(`  │`));
  }
  if (expertise) {
    console.log(CYAN(`  │`) + `  📊 ${pad(`Level: ${expertise}`, w - 7)}` + CYAN(`  │`));
  }
  if (energy) {
    console.log(CYAN(`  │`) + `  ⚡ ${pad(`Energy: ${energy}`, w - 7)}` + CYAN(`  │`));
  }
  if (motivation) {
    console.log(CYAN(`  │`) + `  🎯 ${pad(`Driven by: ${motivation}`, w - 7)}` + CYAN(`  │`));
  }
  if (verbosity) {
    console.log(CYAN(`  │`) + `  💬 ${pad(`Communication: ${verbosity}`, w - 7)}` + CYAN(`  │`));
  }
  if (style) {
    console.log(CYAN(`  │`) + `  🎭 ${pad(`Tone: ${style}`, w - 7)}` + CYAN(`  │`));
  }

  console.log(CYAN(`  │${" ".repeat(w)}│`));

  if (achievement) {
    console.log(CYAN(`  │`) + `  ${line.slice(0, w - 4)}  ` + CYAN(`│`));
    console.log(CYAN(`  │`) + DIM(`  🏆 ${pad(achievement, w - 7)}`) + CYAN(`  │`));
  }

  if (vision) {
    console.log(CYAN(`  │`) + DIM(`  🔮 ${pad(vision, w - 7)}`) + CYAN(`  │`));
  }

  if (hobbies) {
    console.log(CYAN(`  │`) + DIM(`  🎮 ${pad(hobbies, w - 7)}`) + CYAN(`  │`));
  }

  if (antiPatterns) {
    console.log(CYAN(`  │${" ".repeat(w)}│`));
    console.log(CYAN(`  │`) + RED(`  🚫 ${pad(`NO: ${antiPatterns}`, w - 7)}`) + CYAN(`  │`));
  }

  console.log(CYAN(`  │${" ".repeat(w)}│`));
  console.log(CYAN(`  │`) + `  ${line.slice(0, w - 4)}  ` + CYAN(`│`));

  // Footer
  const filled = Math.round(completeness / 5);
  const empty = 20 - filled;
  const bar = GREEN("█".repeat(Math.max(0, filled))) + DIM("░".repeat(Math.max(0, empty)));
  console.log(CYAN(`  │`) + `  [${bar}] ${completeness}%` + " ".repeat(Math.max(0, w - 30)) + CYAN(`│`));
  console.log(CYAN(`  │`) + DIM(`  ${dims} dims | ${compounds} signals | meport.app`) + " ".repeat(Math.max(0, w - 40)) + CYAN(`│`));
  console.log(CYAN(`  │${" ".repeat(w)}│`));
  console.log(CYAN(`  └${"─".repeat(w)}┘`));
  console.log();
}

function getVal(profile: PersonaProfile, key: string): string | undefined {
  const val = profile.explicit[key];
  if (!val) return undefined;
  return Array.isArray(val.value) ? val.value.join(", ") : String(val.value);
}
