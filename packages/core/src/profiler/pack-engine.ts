/**
 * Pack-Based Profiling Engine
 *
 * Full Session architecture: micro-setup → pack selection → all packs → export.
 * Replaces tier-based engine for the new "one conversation = full profile" flow.
 *
 * Key features:
 * - Adaptive: skip_if checks, confirm mode for scan-detected dimensions
 * - Pack-aware: loads and sequences packs based on user selection
 * - Export-rule aware: collects export_rules from selected options
 * - Behavioral signals: tracks response time, skip count, selection patterns
 */

import { v4 as uuidv4 } from "uuid";
import type {
  PersonaProfile,
  DimensionValue,
  ProfileMeta,
} from "../schema/types.js";
import type { Pack, PackQuestion, PackOption, PackId } from "./pack-loader.js";

// ─── Engine Events ──────────────────────────────────────────

export type PackEngineEvent =
  | { type: "pack_start"; pack: string; packName: string; intro: string; sensitive: boolean; privacyNote?: string }
  | { type: "question"; question: PackQuestion; index: number; total: number; pack: string }
  | { type: "confirm"; question: PackQuestion; detectedValue: string; detectedSource: string; index: number; total: number; pack: string }
  | { type: "pack_complete"; pack: string; questionsAnswered: number }
  | { type: "preview_ready"; profile: PersonaProfile; exportRules: Map<string, string[]> }
  | { type: "profiling_complete"; profile: PersonaProfile; exportRules: Map<string, string[]> }
  | { type: "pack_selection"; question: PackQuestion };

export type PackAnswerInput = {
  value: string | string[] | number | Record<string, string>;
  skipped?: boolean;
};

// ─── Scan Context (pre-detected dimensions) ─────────────────

export interface ScanContext {
  /** Pre-detected dimensions from system scan */
  dimensions: Map<string, { value: string; confidence: number; source: string }>;
}

// ─── Pack Answer Record ─────────────────────────────────────

interface PackAnswer {
  question_id: string;
  value: string | string[] | number | Record<string, string>;
  timestamp: number;
  response_time_ms: number;
  skipped: boolean;
  pack: string;
}

// ─── Engine ─────────────────────────────────────────────────

export class PackProfilingEngine {
  private packs: Pack[] = [];
  private answers: Map<string, PackAnswer> = new Map();
  private exportRules: Map<string, string[]> = new Map();
  private startTime: number = 0;
  private questionStartTime: number = 0;
  private questionsAnswered = 0;
  private questionsSkipped = 0;
  private totalResponseTimeMs = 0;
  private scanContext: ScanContext;
  private selectedPacks: PackId[] = [];

  constructor(
    microSetupPack: Pack,
    scanContext: ScanContext = { dimensions: new Map() }
  ) {
    this.packs = [microSetupPack];
    this.startTime = Date.now();
    this.scanContext = scanContext;
  }

  /**
   * Add packs after user selects them in Q4.
   */
  addPacks(packs: Pack[]): void {
    this.packs.push(...packs);
  }

  /**
   * Set selected pack IDs (from Q4 answer).
   */
  setSelectedPacks(packIds: PackId[]): void {
    this.selectedPacks = packIds;
  }

  /**
   * Get selected pack IDs.
   */
  getSelectedPacks(): PackId[] {
    return this.selectedPacks;
  }

  /**
   * Generator-based profiling flow.
   * Yields events, receives answers.
   */
  *run(): Generator<PackEngineEvent, PersonaProfile, PackAnswerInput | undefined> {
    for (const pack of this.packs) {
      // Announce pack start
      yield {
        type: "pack_start",
        pack: pack.pack,
        packName: pack.pack_name,
        intro: pack.pack_intro,
        sensitive: pack.sensitive,
        privacyNote: pack.privacy_note,
      };

      const questions = pack.questions;
      let packAnswered = 0;
      let questionIndex = 0;

      for (const question of questions) {
        // Check skip_if — dimension already known with high confidence?
        if (this.shouldSkip(question)) {
          continue;
        }

        questionIndex++;
        this.questionStartTime = Date.now();

        // Special handling for pack selection question
        if (question.id === "setup_q04") {
          const input: PackAnswerInput | undefined = yield {
            type: "pack_selection",
            question,
          };

          if (input) {
            this.recordAnswer(question, input, pack.pack);
            packAnswered++;
          }
          continue;
        }

        // Check if scan detected this dimension → confirm mode
        const confirmCandidate = this.getConfirmCandidate(question);
        const totalActive = questions.filter((q) => !this.shouldSkip(q)).length;

        if (confirmCandidate) {
          const input: PackAnswerInput | undefined = yield {
            type: "confirm",
            question,
            detectedValue: confirmCandidate.value,
            detectedSource: confirmCandidate.source,
            index: questionIndex,
            total: totalActive,
            pack: pack.pack,
          };

          if (input) {
            this.recordAnswer(question, input, pack.pack);
            if (!input.skipped) packAnswered++;
            this.collectExportRule(question, input);
          }
        } else {
          const input: PackAnswerInput | undefined = yield {
            type: "question",
            question,
            index: questionIndex,
            total: totalActive,
            pack: pack.pack,
          };

          if (input) {
            this.recordAnswer(question, input, pack.pack);
            if (!input.skipped) packAnswered++;
            this.collectExportRule(question, input);
          }
        }
      }

      yield {
        type: "pack_complete",
        pack: pack.pack,
        questionsAnswered: packAnswered,
      };

      // After micro-setup, emit preview
      if (pack.pack === "micro-setup") {
        const previewProfile = this.buildProfile();
        yield {
          type: "preview_ready",
          profile: previewProfile,
          exportRules: new Map(this.exportRules),
        };
      }
    }

    // Final profile
    const profile = this.buildProfile();
    yield {
      type: "profiling_complete",
      profile,
      exportRules: new Map(this.exportRules),
    };

    return profile;
  }

  // ─── Adaptive Logic ─────────────────────────────────────

  private shouldSkip(question: PackQuestion): boolean {
    if (!question.skip_if) return false;

    // Parse simple skip_if: "dimension.confidence > 0.8"
    const match = question.skip_if.match(/^(.+?)\.confidence\s*>\s*(\d+\.?\d*)$/);
    if (!match) return false;

    const [, dimension, threshold] = match;
    const scanDim = this.scanContext.dimensions.get(dimension);
    if (scanDim && scanDim.confidence > parseFloat(threshold)) {
      return true;
    }

    return false;
  }

  /**
   * Check if a question's dimension was detected by scan with moderate confidence.
   * If so, we show a confirm prompt instead of the full question.
   * Threshold: confidence 0.5-0.8 (>0.8 = skip entirely via skip_if, <0.5 = ask full question)
   */
  private getConfirmCandidate(
    question: PackQuestion
  ): { value: string; source: string } | null {
    const scanDim = this.scanContext.dimensions.get(question.dimension);
    if (!scanDim) return null;

    // High confidence = should be handled by skip_if, not confirm
    if (scanDim.confidence > 0.8) return null;
    // Low confidence = ask full question
    if (scanDim.confidence < 0.5) return null;

    return { value: scanDim.value, source: scanDim.source };
  }

  // ─── Answer Recording ───────────────────────────────────

  private recordAnswer(
    question: PackQuestion,
    input: PackAnswerInput,
    pack: string
  ): void {
    const responseTime = Date.now() - this.questionStartTime;

    const answer: PackAnswer = {
      question_id: question.id,
      value: input.value,
      timestamp: Date.now() - this.startTime,
      response_time_ms: responseTime,
      skipped: input.skipped ?? false,
      pack,
    };

    this.answers.set(question.id, answer);

    if (input.skipped) {
      this.questionsSkipped++;
    } else {
      this.questionsAnswered++;
      this.totalResponseTimeMs += responseTime;
    }
  }

  private collectExportRule(
    question: PackQuestion,
    input: PackAnswerInput
  ): void {
    if (input.skipped || !question.options) return;

    if (question.type === "multi_select" && Array.isArray(input.value)) {
      // Multi-select: collect export_rules for all selected options
      for (const val of input.value as string[]) {
        const option = question.options.find((o) => o.value === val);
        if (option?.export_rule && option.maps_to) {
          const key = `${option.maps_to.dimension}:${option.maps_to.value}`;
          const existing = this.exportRules.get(key) ?? [];
          if (!existing.includes(option.export_rule)) {
            existing.push(option.export_rule);
          }
          this.exportRules.set(key, existing);
        }
      }
    } else if (typeof input.value === "string") {
      const option = question.options.find((o) => o.value === input.value);
      if (option?.export_rule && option.maps_to) {
        const key = `${option.maps_to.dimension}:${option.maps_to.value}`;
        const existing = this.exportRules.get(key) ?? [];
        if (!existing.includes(option.export_rule)) {
          existing.push(option.export_rule);
        }
        this.exportRules.set(key, existing);
      }
    }
  }

  // ─── Profile Building ───────────────────────────────────

  private buildProfile(): PersonaProfile {
    const explicit: Record<string, DimensionValue> = {};

    // Add scan-detected dimensions
    for (const [dim, scanVal] of this.scanContext.dimensions) {
      explicit[dim] = {
        dimension: dim,
        value: scanVal.value,
        confidence: 1.0,
        source: "explicit",
        question_id: `scan:${scanVal.source}`,
      };
    }

    // Process answers
    for (const [questionId, answer] of this.answers) {
      if (answer.skipped) continue;

      // Find the question definition
      const question = this.findQuestion(questionId);
      if (!question) continue;

      if (question.type === "multi_select" && Array.isArray(answer.value)) {
        // Multi-select
        for (const val of answer.value as string[]) {
          const option = question.options?.find((o) => o.value === val);
          if (option?.maps_to) {
            const dim = option.maps_to.dimension;
            const existing = explicit[dim];
            if (existing && Array.isArray(existing.value)) {
              (existing.value as string[]).push(option.maps_to.value);
            } else {
              explicit[dim] = {
                dimension: dim,
                value: [option.maps_to.value],
                confidence: 1.0,
                source: "explicit",
                question_id: questionId,
              };
            }
          }
        }
      } else if (question.options && typeof answer.value === "string") {
        // Select/scenario
        const option = question.options.find((o) => o.value === answer.value);
        if (option?.maps_to) {
          explicit[option.maps_to.dimension] = {
            dimension: option.maps_to.dimension,
            value: option.maps_to.value,
            confidence: 1.0,
            source: "explicit",
            question_id: questionId,
          };

          if (option.also_maps_to) {
            explicit[option.also_maps_to.dimension] = {
              dimension: option.also_maps_to.dimension,
              value: option.also_maps_to.value,
              confidence: 1.0,
              source: "explicit",
              question_id: questionId,
            };
          }
        }
      } else if (question.type === "open_text" && typeof answer.value === "string") {
        explicit[question.dimension] = {
          dimension: question.dimension,
          value: answer.value,
          confidence: 1.0,
          source: "explicit",
          question_id: questionId,
        };
      } else if (question.type === "scale" && typeof answer.value === "number") {
        explicit[question.dimension] = {
          dimension: question.dimension,
          value: answer.value,
          confidence: 1.0,
          source: "explicit",
          question_id: questionId,
        };
      }
    }

    // Parse Q1 for name + use case
    const q1Answer = this.answers.get("setup_q01");
    if (q1Answer && typeof q1Answer.value === "string" && q1Answer.value) {
      const parsed = this.parseNameAndUseCase(q1Answer.value);
      if (parsed.name) {
        explicit["identity.preferred_name"] = {
          dimension: "identity.preferred_name",
          value: parsed.name,
          confidence: 1.0,
          source: "explicit",
          question_id: "setup_q01",
        };
      }
      if (parsed.useCase) {
        explicit["primary_use_case"] = {
          dimension: "primary_use_case",
          value: parsed.useCase,
          confidence: 1.0,
          source: "explicit",
          question_id: "setup_q01",
        };
      }
    }

    const packsCompleted = [...new Set(
      [...this.answers.values()]
        .filter((a) => !a.skipped)
        .map((a) => a.pack)
    )];

    const meta: ProfileMeta = {
      tiers_completed: packsCompleted.map((_, i) => i),
      tiers_skipped: [],
      total_questions_answered: this.questionsAnswered,
      total_questions_skipped: this.questionsSkipped,
      avg_response_time_ms:
        this.questionsAnswered > 0
          ? Math.round(this.totalResponseTimeMs / this.questionsAnswered)
          : 0,
      profiling_duration_ms: Date.now() - this.startTime,
      profiling_method: "interactive",
      layer3_available: false,
    };

    const totalDimensions = this.countTotalDimensions();
    const filledDimensions = Object.keys(explicit).length;

    return {
      schema_version: "1.0",
      profile_type: "personal",
      profile_id: uuidv4(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completeness: Math.min(100, Math.round((filledDimensions / Math.max(totalDimensions, 1)) * 100)),
      explicit,
      inferred: {},
      compound: {},
      contradictions: [],
      emergent: [],
      meta,
    };
  }

  private findQuestion(questionId: string): PackQuestion | undefined {
    for (const pack of this.packs) {
      const q = pack.questions.find((q) => q.id === questionId);
      if (q) return q;
    }
    return undefined;
  }

  private countTotalDimensions(): number {
    const dims = new Set<string>();
    for (const pack of this.packs) {
      for (const q of pack.questions) {
        dims.add(q.dimension);
      }
    }
    return dims.size;
  }

  private parseNameAndUseCase(input: string): { name?: string; useCase?: string } {
    // Try to parse "Name — use case" or "Name - use case" format
    const dashMatch = input.match(/^(.+?)\s*[—–-]\s*(.+)$/);
    if (dashMatch) {
      return {
        name: dashMatch[1].trim(),
        useCase: dashMatch[2].trim(),
      };
    }

    // If no separator, treat as name only
    return { name: input.trim() };
  }

  // ─── Accessors ──────────────────────────────────────────

  getAnswers(): Map<string, PackAnswer> {
    return new Map(this.answers);
  }

  getExportRules(): Map<string, string[]> {
    return new Map(this.exportRules);
  }

  getAnswer(questionId: string): PackAnswer | undefined {
    return this.answers.get(questionId);
  }

  /**
   * Update an existing answer (for back-navigation in CLI).
   * Overwrites the previous answer and recollects export rules.
   */
  updateAnswer(question: PackQuestion, input: PackAnswerInput, pack: string): void {
    const existing = this.answers.get(question.id);
    if (existing && !existing.skipped) {
      // Undo the previous count
      this.questionsAnswered--;
      this.totalResponseTimeMs -= existing.response_time_ms;
    }
    this.recordAnswer(question, input, pack);
    this.collectExportRule(question, input);
  }

  // ─── Session Serialization (pause/resume) ──────────────

  /**
   * Serialize engine state for session pause.
   * Saves everything needed to resume profiling later.
   */
  toSessionState(): SessionState {
    return {
      version: 1,
      timestamp: Date.now(),
      startTime: this.startTime,
      questionsAnswered: this.questionsAnswered,
      questionsSkipped: this.questionsSkipped,
      totalResponseTimeMs: this.totalResponseTimeMs,
      selectedPacks: this.selectedPacks,
      answers: Object.fromEntries(this.answers),
      exportRules: Object.fromEntries(this.exportRules),
      scanDimensions: Object.fromEntries(this.scanContext.dimensions),
      completedPacks: this.getCompletedPacks(),
    };
  }

  /**
   * Restore engine state from a saved session.
   * Returns the list of pack IDs that still need to be processed.
   */
  static fromSessionState(
    state: SessionState,
    allPacks: Pack[],
    scanContext: ScanContext = { dimensions: new Map() }
  ): { engine: PackProfilingEngine; remainingPackIds: string[] } {
    // Find the first pack to use as constructor arg
    const firstPack = allPacks[0];
    if (!firstPack) throw new Error("No packs provided");

    const engine = new PackProfilingEngine(firstPack, scanContext);

    // Restore state
    engine.startTime = state.startTime;
    engine.questionsAnswered = state.questionsAnswered;
    engine.questionsSkipped = state.questionsSkipped;
    engine.totalResponseTimeMs = state.totalResponseTimeMs;
    engine.selectedPacks = state.selectedPacks;
    engine.answers = new Map(Object.entries(state.answers));
    engine.exportRules = new Map(Object.entries(state.exportRules));

    // Restore scan context
    if (state.scanDimensions) {
      engine.scanContext = {
        dimensions: new Map(Object.entries(state.scanDimensions)),
      };
    }

    // Add all packs
    engine.packs = allPacks;

    // Figure out which packs still need processing
    const completed = new Set(state.completedPacks);
    const remainingPackIds = allPacks
      .map((p) => p.pack)
      .filter((id) => !completed.has(id));

    return { engine, remainingPackIds };
  }

  private getCompletedPacks(): string[] {
    const packAnswerCounts = new Map<string, number>();
    for (const answer of this.answers.values()) {
      const count = packAnswerCounts.get(answer.pack) ?? 0;
      packAnswerCounts.set(answer.pack, count + 1);
    }

    const completed: string[] = [];
    for (const pack of this.packs) {
      if (packAnswerCounts.has(pack.pack)) {
        completed.push(pack.pack);
      }
    }
    return completed;
  }
}

// ─── Session State Type ─────────────────────────────────────

export interface SessionState {
  version: number;
  timestamp: number;
  startTime: number;
  questionsAnswered: number;
  questionsSkipped: number;
  totalResponseTimeMs: number;
  selectedPacks: PackId[];
  answers: Record<string, PackAnswer>;
  exportRules: Record<string, string[]>;
  scanDimensions: Record<string, { value: string; confidence: number; source: string }>;
  completedPacks: string[];
}
