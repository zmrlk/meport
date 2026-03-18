/**
 * Export Compiler Base
 *
 * Shared logic for all platform-specific compilers:
 * - Dimension collection + sorting
 * - Confidence filtering
 * - Character budget management
 * - Greedy allocation
 */

import type {
  PersonaProfile,
  ExportResult,
  ExportCompilerConfig,
  ExportableDimension,
  CompoundValue,
  EmergentObservation,
} from "../schema/types.js";
import { getDimensionWeight } from "../schema/types.js";

export abstract class BaseCompiler {
  abstract readonly config: ExportCompilerConfig;

  abstract compile(profile: PersonaProfile): ExportResult;

  /** Override in subclasses that support pack export rules */
  setPackExportRules?(rules: Map<string, string[]>): void;

  /**
   * Collect all exportable dimensions from a profile, sorted by weight then confidence.
   */
  protected collectDimensions(
    profile: PersonaProfile,
    minConfidence = 0.5
  ): ExportableDimension[] {
    const dims: ExportableDimension[] = [];

    // Layer 1: Explicit
    for (const [key, val] of Object.entries(profile.explicit)) {
      dims.push({
        dimension: key,
        value: Array.isArray(val.value) ? val.value.join(", ") : String(val.value),
        confidence: val.confidence,
        weight: getDimensionWeight(key),
        source: "explicit",
      });
    }

    // Layer 2A: Inferred (secondary only — flag_only excluded from exports)
    for (const [key, val] of Object.entries(profile.inferred)) {
      if (val.override === "flag_only") continue;
      // Don't add if explicit already covers this dimension
      if (profile.explicit[key]) continue;

      dims.push({
        dimension: key,
        value: val.value,
        confidence: val.confidence,
        weight: getDimensionWeight(key),
        source: "inferred",
      });
    }

    // Layer 2B: Compound
    for (const [key, val] of Object.entries(profile.compound)) {
      dims.push({
        dimension: key,
        value: val.value,
        confidence: val.confidence,
        weight: getDimensionWeight(key),
        source: "compound",
        export_instruction: val.export_instruction,
      });
    }

    // Layer 3: Emergent (accepted only)
    for (const obs of profile.emergent) {
      if (obs.status !== "accepted" && obs.status !== "edited") continue;
      dims.push({
        dimension: `emergent.${obs.observation_id}`,
        value: obs.status === "edited" ? obs.user_edit! : obs.observation,
        confidence: obs.status === "edited" ? 1.0 : 0.95,
        weight: 5, // mid-range, included in most exports
        source: "emergent",
        export_instruction: obs.export_instruction,
      });
    }

    return dims
      .filter((d) => d.confidence >= minConfidence)
      .sort((a, b) => {
        if (b.weight !== a.weight) return b.weight - a.weight;
        return b.confidence - a.confidence;
      });
  }

  /**
   * Get the user's name from explicit dimensions
   */
  protected getName(profile: PersonaProfile): string {
    return String(
      profile.explicit["identity.preferred_name"]?.value ?? "User"
    );
  }

  /**
   * Get pronouns
   */
  protected getPronouns(profile: PersonaProfile): string | undefined {
    const val = profile.explicit["identity.pronouns"]?.value;
    return val ? String(val) : undefined;
  }

  /**
   * Get language
   */
  protected getLanguage(profile: PersonaProfile): string {
    return String(profile.explicit["identity.language"]?.value ?? "en");
  }

  /**
   * Format a dimension as a single line for constrained exports
   */
  protected dimToLine(dim: ExportableDimension): string {
    if (dim.export_instruction) {
      return dim.export_instruction;
    }

    const dimName = dim.dimension.split(".").pop() ?? dim.dimension;
    const readable = dimName.replace(/_/g, " ");
    return `${readable}: ${dim.value}`;
  }

  /**
   * Build result metadata
   */
  protected buildResult(
    content: string,
    filename: string,
    instructions: string,
    allDims: ExportableDimension[],
    includedCount: number
  ): ExportResult {
    // confidence_floor: use all dims up to includedCount (sorted by weight DESC),
    // but clamp to actual array length to avoid out-of-bounds
    const safeCount = Math.min(includedCount, allDims.length);
    const included = allDims.slice(0, safeCount);
    const minConf =
      included.length > 0
        ? Math.min(...included.map((d) => d.confidence))
        : 1.0;

    return {
      content,
      filename,
      instructions,
      charCount: content.length,
      dimensionsCovered: safeCount,
      dimensionsOmitted: Math.max(0, allDims.length - safeCount),
      confidence_floor: minConf,
    };
  }
}
