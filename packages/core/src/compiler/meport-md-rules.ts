/**
 * Meport Standard Export Compiler
 *
 * Generates .meport.md and .meport.json exports from PersonaProfile.
 * Uses converter.ts for PersonaProfile → MeportProfile mapping,
 * then json-to-md.ts for MeportProfile → Markdown.
 *
 * Supports 4 export tiers:
 *   L0: Summary (~150 chars) — API headers, embeddings
 *   L1: Dense (~800 chars) — system prompts, MCP, multi-user
 *   L2: Compact (~1500 chars) — ChatGPT Custom Instructions
 *   L3: Full (~3500 chars) — Grok, Claude, Gemini, Cursor
 */

import type { PersonaProfile, ExportResult, ExportCompilerConfig } from "../schema/types.js";
import { BaseCompiler } from "./base.js";
import { convertV1toV2 } from "../schema/converter.js";
import { jsonToMd } from "../schema/json-to-md.js";
import type { MeportProfile } from "../schema/standard.js";

export type ExportTier = "summary" | "dense" | "compact" | "full";

export interface MeportMdCompilerOptions {
  tier?: ExportTier;
  /** Target platform (affects formatting) */
  target?: "generic" | "chatgpt" | "grok" | "gemini" | "claude" | "cursor";
  /** Include frontmatter */
  frontmatter?: boolean;
  /** Include sharing section */
  includeSharing?: boolean;
}

export class MeportMdCompiler extends BaseCompiler {
  readonly config: ExportCompilerConfig = {
    platform: "Meport Standard",
    format: "markdown",
    charLimit: null,
    tokenLimit: null,
    priority: "P0",
  };

  private options: MeportMdCompilerOptions;

  constructor(options: MeportMdCompilerOptions = {}) {
    super();
    this.options = { tier: "full", target: "generic", frontmatter: true, ...options };
  }

  compile(profile: PersonaProfile): ExportResult {
    // Step 1: Convert PersonaProfile → MeportProfile JSON
    const meport = convertV1toV2(profile, {
      includeIntelligence: this.options.tier === "full",
      includeRules: true,
    });

    // Step 2: Generate output based on tier
    const tier = this.options.tier || "full";
    let content: string;

    switch (tier) {
      case "summary":
        content = this.generateSummary(meport);
        break;
      case "dense":
        content = this.generateDense(meport);
        break;
      case "compact":
        content = this.generateCompact(meport);
        break;
      case "full":
      default:
        content = this.generateFull(meport);
        break;
    }

    return {
      content,
      filename: tier === "full" ? "meport.md" : `meport-${tier}.md`,
      instructions: `Meport Standard v1.0 (${tier} tier, ${content.length} chars)`,
      charCount: content.length,
      dimensionsCovered: Object.keys(meport).length,
      dimensionsOmitted: 0,
      confidence_floor: 0.5,
    };
  }

  /** L0: Summary — one-line context (~150 chars) */
  private generateSummary(p: MeportProfile): string {
    const parts: string[] = [p.identity.name];

    if (p.lifeContext?.stage) parts.push(denorm(p.lifeContext.stage));
    if (p.communication?.directness) parts.push(denorm(p.communication.directness));
    if (p.communication?.verbosity) parts.push(denorm(p.communication.verbosity));
    if (p.identity.language) parts.push(p.identity.language.toUpperCase());
    if (p.aiPreferences?.relationshipModel) parts.push(`${denorm(p.aiPreferences.relationshipModel)} not assistant`);

    const instructions = p.instructions?.slice(0, 2).map(i => i.rule) || [];
    const nevers = p.never?.slice(0, 2).map(n => `Never: ${n.rule}`) || [];

    return `${parts.join(". ")}. ${instructions.join(". ")}. ${nevers.join(". ")}`.slice(0, 200);
  }

  /** L1: Dense — comma-separated key:value (~800 chars) */
  private generateDense(p: MeportProfile): string {
    const lines: string[] = [];

    // Header
    lines.push(`# ${p.identity.name}`);

    // Summary line
    const summaryParts: string[] = [];
    if (p.lifeContext?.stage) summaryParts.push(denorm(p.lifeContext.stage));
    if (p.neurodivergent?.traits?.length) summaryParts.push(p.neurodivergent.traits.join("+").toUpperCase());
    if (p.identity.language) summaryParts.push(p.identity.language.toUpperCase());
    if (p.identity.location) summaryParts.push(p.identity.location);
    if (p.communication?.directness) summaryParts.push(denorm(p.communication.directness));
    if (p.communication?.verbosity) summaryParts.push(denorm(p.communication.verbosity));
    if (p.work?.peakHours) summaryParts.push(`Peak ${p.work.peakHours}`);
    lines.push(`> ${summaryParts.join(", ")}.`);
    lines.push("");

    // Dense key:value pairs
    const id = p.identity;
    lines.push(`Identity: ${id.preferredName || id.name}, ${id.language}${id.timezone ? `, ${id.timezone}` : ""}${id.pronouns ? `, ${id.pronouns}` : ""}`);

    if (p.communication) {
      const c = p.communication;
      const commParts = [c.directness, c.verbosity, c.formality, c.feedbackStyle ? `${denorm(c.feedbackStyle)} feedback` : null, c.humor ? `${denorm(c.humor)} humor` : null, c.formatPreference ? denorm(c.formatPreference) : null].filter(Boolean).map(v => denorm(v!));
      lines.push(`Style: ${commParts.join(", ")}`);
    }

    if (p.aiPreferences) {
      const a = p.aiPreferences;
      const aiParts = [a.relationshipModel ? `${denorm(a.relationshipModel)} not assistant` : null, a.proactivity ? denorm(a.proactivity) : null, a.correctionStyle ? `${denorm(a.correctionStyle)} corrections` : null, a.explanationDepth ? `${denorm(a.explanationDepth)} not theoretical` : null].filter(Boolean);
      lines.push(`AI: ${aiParts.join(", ")}`);
    }

    if (p.neurodivergent?.adaptations?.length) {
      lines.push(`ADHD: ${p.neurodivergent.adaptations.slice(0, 4).join(", ")}`);
    }

    if (p.work) {
      const w = p.work;
      const workParts = [w.energyPattern ? `${denorm(w.energyPattern)} energy` : null, w.peakHours ? `peak ${w.peakHours}` : null, w.taskSize ? `${denorm(w.taskSize)} tasks` : null, w.deadlineStyle ? denorm(w.deadlineStyle) : null, w.collaboration ? denorm(w.collaboration) : null].filter(Boolean);
      lines.push(`Work: ${workParts.join(", ")}`);
    }

    if (p.expertise?.techStack?.length) {
      lines.push(`Expertise: ${p.expertise.techStack.join(", ")}${p.expertise.experienceYears ? `, ${p.expertise.experienceYears}yr` : ""}${p.expertise.level ? ` ${p.expertise.level}` : ""}`);
    }

    if (p.instructions?.length) {
      const doRules = p.instructions.slice(0, 5).map(i => i.rule);
      lines.push(`Do: ${doRules.join(", ")}`);
    }

    if (p.never?.length) {
      const neverRules = p.never.slice(0, 5).map(n => n.rule);
      lines.push(`Never: ${neverRules.join(", ")}`);
    }

    return lines.join("\n");
  }

  /** L2: Compact — bullet format (~1500 chars) */
  private generateCompact(p: MeportProfile): string {
    return jsonToMd(p, {
      frontmatter: false,
      excludeSections: ["cognitive", "neurodivergent", "expertise", "lifeContext", "financial"],
    });
  }

  /** L3: Full — complete .meport.md (~3500 chars) */
  private generateFull(p: MeportProfile): string {
    return jsonToMd(p, {
      frontmatter: this.options.frontmatter,
      includeSharing: this.options.includeSharing,
    });
  }
}

// ─── Helpers ────────────────────────────────────────────

function denorm(value: string): string {
  return value.replace(/_/g, " ");
}

// ─── JSON export ────────────────────────────────────────

export class MeportJsonCompiler extends BaseCompiler {
  readonly config: ExportCompilerConfig = {
    platform: "Meport Standard JSON",
    format: "json",
    charLimit: null,
    tokenLimit: null,
    priority: "P0",
  };

  compile(profile: PersonaProfile): ExportResult {
    const meport = convertV1toV2(profile, {
      includeIntelligence: true,
      includeRules: true,
    });

    const content = JSON.stringify(meport, null, 2);

    return {
      content,
      filename: "meport.json",
      instructions: `Meport Standard v1.0 JSON (${content.length} chars)`,
      charCount: content.length,
      dimensionsCovered: Object.keys(meport).length,
      dimensionsOmitted: 0,
      confidence_floor: 0.5,
    };
  }
}
