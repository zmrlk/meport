/**
 * Profiling session state — wraps ProfilingEngine with Svelte 5 runes.
 * Supports card mode, AI conversational mode, and hybrid (card + background AI enrichment).
 */
import { ProfilingEngine, type EngineEvent, type AnswerInput } from "@meport/core/engine";
import { AIInterviewer, type InterviewRound } from "@meport/core/interviewer";
import { AIEnricher, calculateCompleteness, type SynthesisResult, type FollowUpQuestion, type MegaSynthesisResult, type MicroQuestion, type MicroAnswerMeta, type ImportSource, type BehavioralSignals } from "@meport/core/enricher";
import { detectBrowserSignals } from "@meport/core/browser-detect";
import { isFileScanAvailable, scanDirectory, scanResultToText, type ScanResult } from "@meport/core/file-scanner";
import { createAIClient } from "@meport/core/client";
import { detectBrowserContext, type BrowserContext } from "../browser-intelligence.js";
import type { PersonaProfile } from "@meport/core/types";
import { quickTiers, personalTiers, aiTiers, essentialTiers } from "../../data/questions.js";
import { getApiKey, getApiProvider, getOllamaUrl } from "./app.svelte.js";
import { getLocale } from "../i18n.svelte.js";

let engine = $state<ProfilingEngine | null>(null);
let currentEvent = $state<EngineEvent | null>(null);
let answeredCount = $state(0);
let isComplete = $state(false);
let profile = $state<PersonaProfile | null>(null);
let animating = $state(false);
let totalQuestions = $state(0);
let currentQuestionNumber = $state(0);

// AI mode state
let aiMode = $state(false);
let aiInterviewer = $state<AIInterviewer | null>(null);
let aiMessages = $state<{ role: "user" | "assistant"; content: string }[]>([]);
let aiLoading = $state(false);
let aiDepth = $state(0);
let aiPhaseLabel = $state("");
let aiStreamingText = $state(""); // Live streaming text before JSON parse
let aiOptions = $state<string[]>([]); // Clickable options from AI

// Hybrid enrichment state
let aiEnricher = $state<AIEnricher | null>(null);
let aiEnriching = $state(false);
let browserSignals = $state<Record<string, string>>({});
let synthesizing = $state(false);
let synthesisResult = $state<SynthesisResult | null>(null);
let answersSinceLastEnrich = $state(0);
let accumulatedInferred = $state<Record<string, any>>({});
let followUpQuestions = $state<FollowUpQuestion[]>([]);
let followUpIndex = $state(0);
let inFollowUpPhase = $state(false);
let loadingFollowUps = $state(false);

// Iterative refinement state
let refinementRound = $state(0);
let inSummaryPhase = $state(false);
let intermediateSummary = $state<SynthesisResult | null>(null);
let summaryLoading = $state(false);

const MAX_REFINEMENT_ROUNDS = 2;

// Accumulated export rules across enrichment/synthesis rounds
let accumulatedExportRules = $state<string[]>([]);

// Profiling mode — used to skip tier transitions in AI/essential mode
let profilingMode = $state<"quick" | "full" | "ai" | "essential">("quick");

// Paste / instruction import state
let pasteAnalyzing = $state(false);
let pasteDone = $state(false);
let pasteExtractedCount = $state(0);

// ─── Rapid Mode State ─────────────────────────────────────
let rapidMode = $state(false);
let rapidPhase = $state<"import" | "synthesizing" | "micro" | "done" | "error">("import");
let importedText = $state("");
let importedPlatform = $state("");
let importedFiles = $state<string[]>([]); // file contents as strings
let megaResult = $state<MegaSynthesisResult | null>(null);
let microAnswers = $state<Record<string, string>>({});
let microAnswerMeta = $state<Record<string, MicroAnswerMeta>>({});
let microQuestionShownAt = $state(0);
let microIndex = $state(0);
let microRound = $state(1);
let synthesisProgress = $state("");
let synthesisError = $state("");
let synthesisElapsed = $state(0);

// Module-scope handles for synthesis abort/timers
let synthAbortController: AbortController | null = null;
let synthTimeoutId: ReturnType<typeof setTimeout> | null = null;
let synthElapsedInterval: ReturnType<typeof setInterval> | null = null;

// Multi-source import state
let importSources = $state<ImportSource[]>([]);

// Behavioral signals captured from UI interactions
let behavioralSignals = $state<BehavioralSignals>({});
let importScreenEnteredAt = $state(0);

// Cached browser context for auto-answering
let cachedBrowserCtx: BrowserContext | null = null;

// ─── Pack selection ────────────────────────────────────────
export type PackId = "story" | "context" | "work" | "lifestyle" | "health" | "finance" | "learning";

function loadSelectedPacks(): PackId[] {
  try {
    const raw = localStorage.getItem("meport:selectedPacks");
    return raw ? JSON.parse(raw) : ["story", "context", "work"];
  } catch { return ["story", "context", "work"]; }
}

let selectedPacks = $state<PackId[]>(loadSelectedPacks());

export function getSelectedPacks() { return selectedPacks; }

export function setSelectedPacks(packs: PackId[]) {
  selectedPacks = packs;
  localStorage.setItem("meport:selectedPacks", JSON.stringify(packs));
}

export function togglePack(id: PackId) {
  if (selectedPacks.includes(id)) {
    selectedPacks = selectedPacks.filter(p => p !== id);
  } else {
    selectedPacks = [...selectedPacks, id];
  }
  localStorage.setItem("meport:selectedPacks", JSON.stringify(selectedPacks));
}

/** Map pack ids to tier question category keywords for filtering */
export const PACK_TIER_MAP: Record<PackId, string[]> = {
  story:     ["personality", "values", "background", "identity"],
  context:   ["life_context", "location", "occupation", "life_stage"],
  work:      ["work", "productivity", "deadlines", "energy"],
  lifestyle: ["lifestyle", "routines", "hobbies", "social"],
  health:    ["neurodivergent", "wellness", "health", "adhd"],
  finance:   ["finance", "budget", "spending"],
  learning:  ["learning", "cognitive", "study", "reading"],
};

/**
 * Check if a question can be auto-answered from browser intelligence.
 * Returns the option value to auto-submit, "skip" to auto-skip, or null to show normally.
 */
function getAutoAnswer(questionId: string): string | "skip" | null {
  if (!cachedBrowserCtx) cachedBrowserCtx = detectBrowserContext();
  const ctx = cachedBrowserCtx;

  switch (questionId) {
    case "t0_q02": // Language — browser knows this
      return ctx.languageOption ?? null;
    case "t0_q03": // Location — browser timezone maps to region
      return ctx.locationOption ?? null;
    case "t0_q05": // Pronouns — useless, auto-skip
      return "skip";
    default:
      return null;
  }
}

// File scan state
let fileScanResult = $state<ScanResult | null>(null);
let fileScanText = $state("");
let fileScanAvailable = $state(false);

export function getEvent() { return currentEvent; }
export function getAnswered() { return answeredCount; }
export function getIsComplete() { return isComplete; }
export function getProfilingProfile() { return profile; }
export function getAnimating() { return animating; }
export function getTotalQuestions() { return totalQuestions; }
export function getCurrentQuestionNumber() { return currentQuestionNumber; }
export function isAIMode() { return aiMode; }
export function getAIMessages() { return aiMessages; }
export function getAILoading() { return aiLoading; }
export function getAIDepth() { return aiDepth; }
export function getAIPhaseLabel() { return aiPhaseLabel; }
export function getAIStreamingText() { return aiStreamingText; }
export function getAIOptions() { return aiOptions; }
export function getAIEnriching() { return aiEnriching; }
export function getSynthesizing() { return synthesizing; }
export function getSynthesisResult() { return synthesisResult; }
export function getBrowserSignals() { return browserSignals; }
export function hasEnricher() { return aiEnricher !== null; }
export function getFollowUpQuestions() { return followUpQuestions; }
export function getFollowUpIndex() { return followUpIndex; }
export function getInFollowUpPhase() { return inFollowUpPhase; }
export function getLoadingFollowUps() { return loadingFollowUps; }
export function getFileScanResult() { return fileScanResult; }
export function getFileScanText() { return fileScanText; }
export function getIsFileScanAvailable() { return fileScanAvailable; }
export function getRefinementRound() { return refinementRound; }
export function getInSummaryPhase() { return inSummaryPhase; }
export function getIntermediateSummary() { return intermediateSummary; }
export function getSummaryLoading() { return summaryLoading; }
export function getAccumulatedExportRules() { return accumulatedExportRules; }
export function getAccumulatedInferredCount() { return Object.keys(accumulatedInferred).length; }
export function getProfilingMode() { return profilingMode; }
export function getPasteAnalyzing() { return pasteAnalyzing; }
export function getPasteDone() { return pasteDone; }
export function getPasteExtractedCount() { return pasteExtractedCount; }

// Rapid mode getters
export function isRapidMode() { return rapidMode; }
export function getRapidPhase() { return rapidPhase; }
export function getMegaResult() { return megaResult; }
export function getMicroQuestions(): MicroQuestion[] { return megaResult?.microQuestions ?? []; }
export function getMicroIndex() { return microIndex; }
export function getMicroRound() { return microRound; }
export function getSynthesisProgress() { return synthesisProgress; }
export function getSynthesisError() { return synthesisError; }
export function getSynthesisElapsed() { return synthesisElapsed; }
export function getImportSources() { return importSources; }
export function getBehavioralSignals() { return behavioralSignals; }

/** Cancel an in-progress synthesis (abort + return to import phase) */
export function cancelRapidSynthesis() {
  synthAbortController?.abort("cancel");
  if (synthTimeoutId !== null) { clearTimeout(synthTimeoutId); synthTimeoutId = null; }
  if (synthElapsedInterval !== null) { clearInterval(synthElapsedInterval); synthElapsedInterval = null; }
  synthesisElapsed = 0;
  synthesisError = "";
  rapidPhase = "import";
}

/** Retry synthesis after an error */
export function retrySynthesis() {
  synthesisError = "";
  synthesisElapsed = 0;
  rapidPhase = "import"; // will be set to "synthesizing" inside runMegaSynthesis
  void runMegaSynthesis();
}

/** Record a behavioral signal from the UI */
export function recordBehavioralSignal(key: keyof BehavioralSignals, value: any) {
  behavioralSignals = { ...behavioralSignals, [key]: value };
}

/** Submit pasted instructions for AI extraction. Returns true on success. */
export async function submitPaste(text: string, platform: string): Promise<boolean> {
  if (!aiEnricher || pasteAnalyzing) return false;
  pasteAnalyzing = true;
  pasteDone = false;
  pasteExtractedCount = 0;
  try {
    const result = await aiEnricher.extractFromInstructions(text, platform, browserSignals);
    if (result.inferred && Object.keys(result.inferred).length > 0) {
      accumulatedInferred = { ...accumulatedInferred, ...result.inferred };
      pasteExtractedCount = Object.keys(result.inferred).length;
    }
    if (result.exportRules?.length > 0) {
      accumulatedExportRules = mergeExportRules(accumulatedExportRules, result.exportRules);
    }
    // Only mark done if we actually extracted something
    pasteDone = pasteExtractedCount > 0;
    return pasteDone;
  } catch {
    pasteDone = false;
    return false;
  } finally {
    pasteAnalyzing = false;
  }
}

/** Skip paste — user starts fresh */
export function skipPaste() {
  pasteAnalyzing = false;
  pasteDone = false;
  pasteExtractedCount = 0;
}

// ─── Rapid Mode Functions ─────────────────────────────────

/** Initialize rapid profiling — data-first pipeline. Requires API key. */
export function initRapidProfiling() {
  const apiKey = getApiKey();
  const provider = getApiProvider();
  if (!apiKey) {
    // Fallback to quick mode without API key
    initProfiling("quick");
    return;
  }

  // Reset all state
  engine = null;
  currentEvent = null;
  answeredCount = 0;
  currentQuestionNumber = 0;
  isComplete = false;
  profile = null;
  aiMode = false;

  // Rapid mode state
  rapidMode = true;
  rapidPhase = "import";
  importedText = "";
  importedPlatform = "";
  importedFiles = [];
  importSources = [];
  megaResult = null;
  microAnswers = {};
  microAnswerMeta = {};
  microQuestionShownAt = 0;
  microIndex = 0;
  microRound = 1;
  synthesisProgress = "";
  behavioralSignals = {};
  importScreenEnteredAt = Date.now();

  // Browser signals
  browserSignals = detectBrowserSignals();
  cachedBrowserCtx = null;

  // AI enricher
  const clientProvider = provider;
  const client = createAIClient({
    provider: clientProvider,
    apiKey: clientProvider !== "ollama" ? apiKey : undefined,
    baseUrl: clientProvider === "ollama" ? getOllamaUrl() : undefined,
  });
  aiEnricher = new AIEnricher(client, getLocale());

  // Reset synthesis state
  synthesizing = false;
  synthesisResult = null;
  accumulatedInferred = {};
  accumulatedExportRules = [];
}

/** Submit import data and trigger MegaSynthesis (legacy single-source) */
export async function submitRapidImport(text: string, platform: string, fileContents: string[]) {
  if (!aiEnricher) return;

  importedText = text;
  importedPlatform = platform;
  importedFiles = fileContents;

  // Calculate dwell time
  if (importScreenEnteredAt > 0) {
    behavioralSignals = {
      ...behavioralSignals,
      importDwellTimeSec: Math.round((Date.now() - importScreenEnteredAt) / 1000),
    };
  }

  await runMegaSynthesis();
}

/** Submit multi-source import data and trigger MegaSynthesis */
export async function submitMultiSourceImport(sources: ImportSource[]) {
  if (!aiEnricher) return;

  importSources = sources;

  // Calculate dwell time
  if (importScreenEnteredAt > 0) {
    behavioralSignals = {
      ...behavioralSignals,
      importDwellTimeSec: Math.round((Date.now() - importScreenEnteredAt) / 1000),
    };
  }

  await runMegaSynthesis();
}

/** Skip import — run MegaSynthesis with browser context only */
export async function skipRapidImport() {
  if (!aiEnricher) return;
  await runMegaSynthesis();
}

async function runMegaSynthesis() {
  if (!aiEnricher) return;

  rapidPhase = "synthesizing";
  synthesisProgress = "";
  synthesisError = "";
  synthesisElapsed = 0;

  // Set up AbortController for cancel/timeout
  synthAbortController = new AbortController();
  const signal = synthAbortController.signal;

  // 60s timeout — abort if AI hangs
  synthTimeoutId = setTimeout(() => {
    synthAbortController?.abort("timeout");
  }, 60_000);

  // Elapsed counter — tick every second
  synthElapsedInterval = setInterval(() => {
    synthesisElapsed += 1;
  }, 1_000);

  try {
    const hasSources = importSources.length > 0;
    const hasBehavior = Object.keys(behavioralSignals).length > 0;

    const result = await aiEnricher.megaSynthesize({
      browserContext: browserSignals,
      // Use multi-source path if available, else legacy
      ...(hasSources ? { sources: importSources } : {
        pastedText: importedText || undefined,
        pastedPlatform: importedPlatform || undefined,
        uploadedFileContents: importedFiles.length > 0 ? importedFiles : undefined,
      }),
      ...(hasBehavior ? { behavioralSignals } : {}),
      locale: getLocale(),
    });

    megaResult = result;

    // If AI returned micro questions, show them
    if (result.microQuestions.length > 0) {
      rapidPhase = "micro";
      microIndex = 0;
      microAnswers = {};
      microAnswerMeta = {};
      microQuestionShownAt = Date.now();
    } else {
      // No questions needed — go straight to done
      await finalizeRapidProfile();
    }
  } catch (err) {
    console.error("[meport] MegaSynthesis error:", err, "signal.aborted:", signal.aborted, "signal.reason:", signal.reason);
    // Distinguish user cancel vs timeout vs API error
    if (signal.aborted) {
      if (signal.reason === "timeout") {
        synthesisError = getLocale() === "pl"
          ? "AI nie odpowiada. Sprawdź połączenie i spróbuj ponownie."
          : "AI is not responding. Check your connection and try again.";
      } else {
        // User-initiated cancel — go back to import phase silently
        rapidPhase = "import";
        return;
      }
    } else {
      const msg = (err as any)?.message ?? String(err);
      synthesisError = getLocale() === "pl"
        ? `Błąd połączenia z AI: ${msg}`
        : `AI connection error: ${msg}`;
    }
    rapidPhase = "error";
  } finally {
    if (synthTimeoutId !== null) { clearTimeout(synthTimeoutId); synthTimeoutId = null; }
    if (synthElapsedInterval !== null) { clearInterval(synthElapsedInterval); synthElapsedInterval = null; }
  }
}

/** Submit answer to a micro question */
export async function submitMicroAnswer(questionId: string, answer: string, changedMind: boolean = false) {
  const now = Date.now();
  microAnswers[questionId] = answer;
  microAnswerMeta[questionId] = {
    responseTimeMs: microQuestionShownAt > 0 ? now - microQuestionShownAt : 0,
    changedMind,
  };
  answeredCount++;
  microIndex++;
  microQuestionShownAt = now; // Reset timer for next question

  const questions = megaResult?.microQuestions ?? [];
  if (microIndex >= questions.length) {
    // All micro questions answered — refine and finalize
    await refineAndFinalize();
  }
}

/** Skip remaining micro questions */
export async function skipMicroQuestions() {
  await finalizeRapidProfile();
}

async function refineAndFinalize() {
  if (!aiEnricher || !megaResult) {
    await finalizeRapidProfile();
    return;
  }

  rapidPhase = "synthesizing";
  synthesisProgress = "";

  try {
    const refined = await aiEnricher.refineMicroAnswers(megaResult, microAnswers, microRound, microAnswerMeta);
    megaResult = refined;

    // Multi-round: if refinement returned new micro questions and we haven't exceeded max rounds
    if (refined.microQuestions.length > 0 && microRound < 2) {
      microRound++;
      rapidPhase = "micro";
      microIndex = 0;
      microAnswers = {};
      microAnswerMeta = {};
      microQuestionShownAt = Date.now();
      return; // Don't finalize yet — show next round of questions
    }
  } catch {
    // Refinement failed — use original mega result
  }

  await finalizeRapidProfile();
}

async function finalizeRapidProfile() {
  if (!megaResult) return;

  rapidPhase = "done";

  // Build a PersonaProfile from MegaSynthesisResult
  const now = new Date().toISOString();
  const builtProfile: PersonaProfile = {
    schema_version: "1.0",
    profile_type: "personal",
    profile_id: crypto.randomUUID?.() ?? `profile-${Date.now()}`,
    created_at: now,
    updated_at: now,
    completeness: 0,

    explicit: {},
    inferred: {},
    compound: {},
    contradictions: [],
    emergent: [],
    synthesis: {
      narrative: megaResult.narrative,
      archetype: megaResult.archetype,
      archetypeDescription: megaResult.archetypeDescription,
      exportRules: megaResult.exportRules,
      cognitiveProfile: megaResult.cognitiveProfile ? {
        thinkingStyle: megaResult.cognitiveProfile,
        learningMode: "",
        decisionPattern: "",
        attentionType: "",
      } : undefined,
      communicationDNA: megaResult.communicationDNA ? {
        tone: megaResult.communicationDNA,
        formality: "",
        directness: "",
        adaptations: [],
      } : undefined,
      contradictions: megaResult.contradictions.map(c => ({
        area: "",
        observation: c,
        resolution: "",
      })),
      predictions: megaResult.predictions.map(p => ({
        context: "",
        prediction: p,
        confidence: 0.7,
      })),
      strengths: megaResult.strengths,
      blindSpots: megaResult.blindSpots,
    },
    meta: {
      tiers_completed: [],
      tiers_skipped: [],
      total_questions_answered: answeredCount,
      total_questions_skipped: 0,
      avg_response_time_ms: 0,
      profiling_duration_ms: 0,
      profiling_method: "hybrid",
      layer3_available: true,
    },
  };

  // Convert mega dimensions to inferred
  for (const [key, dim] of Object.entries(megaResult.dimensions)) {
    if (dim.confidence >= 0.85) {
      // High confidence → treat as explicit
      builtProfile.explicit[key] = {
        dimension: key,
        value: dim.value,
        confidence: 1.0 as const,
        source: "explicit" as const,
        question_id: "mega_synthesis",
      };
    } else {
      builtProfile.inferred[key] = {
        dimension: key,
        value: dim.value,
        confidence: dim.confidence,
        source: "behavioral" as const,
        signal_id: "mega_synthesis",
        override: "secondary" as const,
      };
    }
  }

  // Add browser signals as explicit
  for (const [key, val] of Object.entries(browserSignals)) {
    if (key.startsWith("_")) continue;
    if (!builtProfile.explicit[key]) {
      builtProfile.explicit[key] = {
        dimension: key,
        value: val,
        confidence: 1.0 as const,
        source: "explicit" as const,
        question_id: "browser_auto_detect",
      };
    }
  }

  // Add micro question answers as explicit
  for (const [qId, answer] of Object.entries(microAnswers)) {
    const mq = megaResult.microQuestions.find(q => q.id === qId);
    if (mq?.dimension) {
      builtProfile.explicit[mq.dimension] = {
        dimension: mq.dimension,
        value: answer,
        confidence: 1.0 as const,
        source: "explicit" as const,
        question_id: qId,
      };
    }
  }

  // Emergent from mega result
  builtProfile.emergent = megaResult.emergent.map((e, i) => ({
    observation_id: crypto.randomUUID?.() ?? `emergent-${Date.now()}-${i}`,
    category: "personality_pattern" as const,
    title: typeof e === "string" ? e.split(":")[0] || e : "",
    observation: typeof e === "string" ? e : "",
    evidence: [],
    confidence: 0.6,
    export_instruction: "",
    status: "pending_review" as const,
  }));

  // Calculate completeness using the rich scoring function
  const completenessResult = calculateCompleteness(megaResult);
  builtProfile.completeness = completenessResult.score;

  // Also store as synthesisResult for RevealScreen compatibility
  synthesisResult = {
    narrative: megaResult.narrative,
    additionalInferred: megaResult.dimensions,
    exportRules: megaResult.exportRules,
    emergent: megaResult.emergent.map(e => ({
      title: typeof e === "string" ? e.split(":")[0] || "Pattern" : "",
      observation: typeof e === "string" ? e : "",
    })),
    archetype: megaResult.archetype,
    archetypeDescription: megaResult.archetypeDescription,
    strengths: megaResult.strengths,
    blindSpots: megaResult.blindSpots,
  };

  profile = builtProfile;
  isComplete = true;
  clearSessionState();
}

/** Return up to N human-readable discovered dimension labels */
export function getDiscoveredDimensions(max = 3): string[] {
  if (!engine) return [];
  const profile = engine.buildCurrentProfile();
  const allInferred = { ...profile.inferred, ...accumulatedInferred };
  const labels: Record<string, string> = {
    "work.decision_style": "decision style",
    "communication.code_preference": "code preference",
    "communication.response_length": "response length",
    "communication.preamble": "preamble preference",
    "communication.answer_first": "answer-first",
    "communication.jargon_level": "jargon level",
    "communication.pleasantries": "pleasantries",
    "communication.filler_tolerance": "filler tolerance",
    "communication.hedge_words": "hedge words",
    "work.automation_preference": "automation preference",
    "work.context_switching": "context switching",
    "work.planning_style": "planning style",
    "work.feedback_style": "feedback style",
    "communication.personalization": "personalization",
    "communication.summary_preference": "summary style",
    "communication.explanation_depth": "explanation depth",
  };
  const result: string[] = [];
  for (const key of Object.keys(allInferred)) {
    const label = labels[key];
    if (label) result.push(label);
    if (result.length >= max) break;
  }
  return result;
}

/** Deduplicate export rules — keeps order, removes near-duplicates */
function mergeExportRules(existing: string[], incoming: string[]): string[] {
  const result = [...existing];
  for (const rule of incoming) {
    const normalized = rule.toLowerCase().trim();
    const isDupe = result.some(r => r.toLowerCase().trim() === normalized);
    if (!isDupe) result.push(rule);
  }
  return result;
}

let fileScanError = $state(false);
export function getFileScanError() { return fileScanError; }

export async function runFileScan(): Promise<boolean> {
  fileScanError = false;
  try {
    const result = await scanDirectory(2);
    fileScanResult = result;
    fileScanText = scanResultToText(result);
    return true;
  } catch {
    fileScanError = true;
    return false;
  }
}

// ─── Session persistence ────────────────────────────────────

interface ProfilingSessionState {
  answeredCount: number;
  mode: "quick" | "full" | "ai" | "essential";
  savedAt: number; // epoch ms
}

export function saveSessionState() {
  const state: ProfilingSessionState = {
    answeredCount,
    mode: profilingMode,
    savedAt: Date.now(),
  };
  localStorage.setItem("meport:profiling-session", JSON.stringify(state));
}

export function loadSessionState(): ProfilingSessionState | null {
  try {
    const raw = localStorage.getItem("meport:profiling-session");
    if (!raw) return null;
    const state = JSON.parse(raw) as ProfilingSessionState;
    // Discard sessions older than 24 hours
    if (Date.now() - state.savedAt > 24 * 60 * 60 * 1000) {
      localStorage.removeItem("meport:profiling-session");
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function clearSessionState() {
  localStorage.removeItem("meport:profiling-session");
}

export function initProfiling(mode: "quick" | "full" | "ai" | "essential" = "quick") {
  profilingMode = mode;
  cachedBrowserCtx = null; // Reset for fresh detection
  const tiers = mode === "ai" ? aiTiers : mode === "essential" ? essentialTiers : mode === "quick" ? quickTiers : personalTiers;
  engine = new ProfilingEngine(tiers);
  currentEvent = engine.getNextQuestion();

  // AI/essential mode: auto-skip initial tier_start (single tier, no need for intro card)
  if ((mode === "ai" || mode === "essential") && currentEvent?.type === "tier_start") {
    currentEvent = engine.getNextQuestion();
  }
  answeredCount = 0;
  currentQuestionNumber = 0;
  isComplete = false;
  profile = null;

  // Count questions — essential mode includes follow-ups (single synthetic tier),
  // other modes count only main questions (follow-ups are conditional)
  totalQuestions = mode === "essential"
    ? tiers.reduce((sum, tier) => sum + tier.questions.length, 0)
    : tiers.reduce((sum, tier) => sum + tier.questions.filter((q: any) => !q.is_followup).length, 0);

  // Browser auto-detection
  browserSignals = detectBrowserSignals();

  // Paste state reset
  pasteAnalyzing = false;
  pasteDone = false;
  pasteExtractedCount = 0;

  // File scan state reset
  fileScanResult = null;
  fileScanText = "";
  fileScanAvailable = isFileScanAvailable();

  // Initialize AI enricher if API key available
  aiEnriching = false;
  synthesizing = false;
  synthesisResult = null;
  answersSinceLastEnrich = 0;
  accumulatedInferred = {};
  refinementRound = 0;
  inSummaryPhase = false;
  intermediateSummary = null;
  summaryLoading = false;
  followUpQuestions = [];
  followUpIndex = 0;
  inFollowUpPhase = false;
  loadingFollowUps = false;
  accumulatedExportRules = [];

  const apiKey = getApiKey();
  const provider = getApiProvider();
  if (apiKey) {
    const clientProvider = provider;
    const client = createAIClient({
      provider: clientProvider as "claude" | "openai" | "ollama",
      apiKey,
    });
    aiEnricher = new AIEnricher(client, getLocale());
  } else {
    aiEnricher = null;
  }
}

export async function submitAnswer(questionId: string, value: AnswerInput["value"], skipped = false) {
  if (!engine) return;

  // Card exit animation
  animating = true;
  await new Promise(r => setTimeout(r, 250));

  engine.submitAnswer(questionId, { value, skipped });
  if (!skipped) answeredCount++;
  currentQuestionNumber++;
  saveSessionState();

  answersSinceLastEnrich++;
  if (answersSinceLastEnrich >= 3 && aiEnricher && !aiEnriching) {
    answersSinceLastEnrich = 0;
    backgroundEnrich(); // Fire and forget — no await
  }

  advance();

  // Card enter animation
  await new Promise(r => setTimeout(r, 50));
  animating = false;
}

/** Advance past tier_start / tier_complete events without submitting an answer. */
export async function advanceEvent() {
  if (!engine) return;

  animating = true;
  await new Promise(r => setTimeout(r, 250));

  advance();

  await new Promise(r => setTimeout(r, 50));
  animating = false;
}

function advance() {
  if (!engine) return;
  let next = engine.getNextQuestion();

  // AI/essential mode: auto-skip tier_complete (single tier, go straight to follow-ups)
  if ((profilingMode === "ai" || profilingMode === "essential") && next?.type === "tier_complete") {
    next = engine.getNextQuestion();
  }

  // Auto-answer/auto-skip questions where browser context gives confident data
  // Also skip questions whose dimension was already covered by paste import
  while (next && (next.type === "question" || next.type === "follow_up")) {
    const auto = getAutoAnswer(next.question.id);
    if (auto === "skip") {
      engine.submitAnswer(next.question.id, { value: "", skipped: true });
      currentQuestionNumber++;
      next = engine.getNextQuestion();
      continue;
    }
    if (auto) {
      engine.submitAnswer(next.question.id, { value: auto, skipped: false });
      answeredCount++;
      currentQuestionNumber++;
      answersSinceLastEnrich++;
      next = engine.getNextQuestion();
      continue;
    }
    // Skip questions whose dimension is already covered by paste with high confidence
    const dim = (next.question as any).dimension;
    if (dim && accumulatedInferred[dim]?.confidence >= 0.7) {
      engine.submitAnswer(next.question.id, { value: "", skipped: true });
      currentQuestionNumber++;
      next = engine.getNextQuestion();
      continue;
    }
    break;
  }

  if (next === null) {
    currentEvent = null;
    // If AI enricher available, generate follow-up questions first
    if (aiEnricher) {
      startFollowUpPhase();
    } else {
      finalizeProfile();
    }
  } else {
    currentEvent = next;
  }
}

async function startFollowUpPhase() {
  if (!engine || !aiEnricher) return;
  loadingFollowUps = true;
  inFollowUpPhase = true;
  followUpIndex = 0;
  followUpQuestions = [];

  try {
    const currentProfile = engine.buildCurrentProfile();
    const followUpSignals = { ...browserSignals };
    if (fileScanText) {
      followUpSignals["_file_scan"] = fileScanText;
    }

    // Merge engine-inferred (rule-based) with AI-inferred so AI sees everything
    const allInferred = { ...currentProfile.inferred, ...accumulatedInferred };

    // Run enrichment and follow-up generation in PARALLEL (saves 3-5s)
    const enrichPromise = !aiEnriching
      ? aiEnricher.enrichBatch(currentProfile.explicit, followUpSignals, allInferred).catch(() => null)
      : Promise.resolve(null);

    const followUpPromise = aiEnricher.generateFollowUps(
      currentProfile.explicit,
      allInferred,
      followUpSignals
    );

    const [enrichResult, questions] = await Promise.all([enrichPromise, followUpPromise]);

    // Merge enrichment results (arrived in parallel)
    if (enrichResult) {
      accumulatedInferred = { ...accumulatedInferred, ...enrichResult.inferred };
      if (enrichResult.exportRules.length > 0) {
        accumulatedExportRules = mergeExportRules(accumulatedExportRules, enrichResult.exportRules);
      }
    }

    followUpQuestions = guardFollowUpQuality(questions);
    loadingFollowUps = false;

    // If AI returned no usable questions, go straight to synthesis
    if (followUpQuestions.length === 0) {
      inFollowUpPhase = false;
      finalizeProfile();
    }
  } catch {
    // AI failed — skip follow-ups, go to synthesis
    loadingFollowUps = false;
    inFollowUpPhase = false;
    finalizeProfile();
  }
}

/** Quality guard: drop malformed follow-ups, inject fallbacks if too few survive */
const FALLBACK_FOLLOWUPS: FollowUpQuestion[] = [
  {
    id: "fb_1",
    question: "When you're stuck on a problem, what's your instinct?",
    options: ["Break it into smaller pieces", "Ask someone for a different perspective", "Step away and let it simmer", "Push through until it clicks"],
    dimension: "cognitive.problem_solving",
    why: "Reveals problem-solving strategy",
  },
  {
    id: "fb_2",
    question: "How do you prefer AI to handle uncertainty?",
    options: ["Give me the best guess confidently", "Show me the options and tradeoffs", "Ask me clarifying questions first", "Flag what's uncertain but still decide"],
    dimension: "ai.uncertainty_handling",
    why: "Calibrates AI communication style",
  },
  {
    id: "fb_3",
    question: "What frustrates you most about AI responses?",
    options: ["Too long and verbose", "Too cautious or hedging", "Missing the actual point", "Generic advice that ignores context"],
    dimension: "ai.frustration_trigger",
    why: "Identifies communication anti-patterns",
  },
];

function guardFollowUpQuality(questions: FollowUpQuestion[]): FollowUpQuestion[] {
  // Filter out malformed questions (no options or all options too short)
  const valid = questions.filter(q =>
    q.options.length >= 2 &&
    q.options.some(opt => opt.length >= 5) &&
    q.question.length >= 10
  );

  // If enough survived, use them
  if (valid.length >= 2) return valid;

  // Not enough quality questions — use fallbacks (skip dimensions we already know)
  const knownDims = new Set(Object.keys(accumulatedInferred));
  const usable = FALLBACK_FOLLOWUPS.filter(fb => !knownDims.has(fb.dimension));
  return [...valid, ...usable].slice(0, 4);
}

export function submitFollowUp(questionId: string, value: string) {
  // Store the answer as an explicit dimension
  const q = followUpQuestions.find(fq => fq.id === questionId);
  if (q) {
    accumulatedInferred[q.dimension] = {
      value,
      confidence: 0.9,
      evidence: `Follow-up answer: ${value}`,
    };
    answeredCount++;
  }

  followUpIndex++;

  // If more follow-ups, stay in phase
  if (followUpIndex < followUpQuestions.length) {
    return;
  }

  // All follow-ups done
  inFollowUpPhase = false;
  refinementRound++;

  // AI mode: skip intermediate summary, go straight to final (saves ~20s)
  // Quick/Full mode: show intermediate for user review
  if (profilingMode === "ai") {
    finalizeProfile();
  } else if (refinementRound <= MAX_REFINEMENT_ROUNDS) {
    showIntermediateSummary();
  } else {
    finalizeProfile();
  }
}

/** Skip remaining follow-ups and go straight to synthesis */
export function skipFollowUps() {
  if (!inFollowUpPhase) return;
  inFollowUpPhase = false;
  finalizeProfile();
}

/** Generate intermediate summary for user review before final synthesis */
async function showIntermediateSummary() {
  if (!engine || !aiEnricher) {
    finalizeProfile();
    return;
  }

  summaryLoading = true;
  inSummaryPhase = true;

  try {
    const currentProfile = engine.buildCurrentProfile();
    const synthesisSignals = { ...browserSignals };
    if (fileScanText) {
      synthesisSignals["_file_scan"] = fileScanText;
    }
    const result = await aiEnricher.synthesizeIntermediate(
      currentProfile.explicit,
      { ...currentProfile.inferred, ...accumulatedInferred },
      synthesisSignals
    );
    intermediateSummary = result;

    // Merge any new inferred dimensions from this round
    for (const [key, dim] of Object.entries(result.additionalInferred)) {
      accumulatedInferred[key] = dim;
    }
    // Accumulate export rules
    if (result.exportRules.length > 0) {
      accumulatedExportRules = mergeExportRules(accumulatedExportRules, result.exportRules);
    }
  } catch {
    // AI failed — go straight to finalize
    inSummaryPhase = false;
    finalizeProfile();
  } finally {
    summaryLoading = false;
  }
}

/** User confirms the intermediate summary — finalize the profile */
export function confirmSummary() {
  inSummaryPhase = false;
  finalizeProfile();
}

/** User wants corrections — send feedback and get more follow-ups */
export async function requestCorrections(feedback: string) {
  if (!engine || !aiEnricher) return;

  inSummaryPhase = false;
  loadingFollowUps = true;
  inFollowUpPhase = true;
  followUpIndex = 0;
  followUpQuestions = [];

  try {
    const currentProfile = engine.buildCurrentProfile();
    const followUpSignals = { ...browserSignals };
    if (fileScanText) {
      followUpSignals["_file_scan"] = fileScanText;
    }
    // Add user correction as context
    followUpSignals["_user_correction"] = feedback;

    const allInferred = { ...currentProfile.inferred, ...accumulatedInferred };
    const questions = await aiEnricher.generateFollowUps(
      currentProfile.explicit,
      allInferred,
      followUpSignals
    );
    followUpQuestions = guardFollowUpQuality(questions);
    loadingFollowUps = false;

    if (followUpQuestions.length === 0) {
      inFollowUpPhase = false;
      finalizeProfile();
    }
  } catch {
    loadingFollowUps = false;
    inFollowUpPhase = false;
    finalizeProfile();
  }
}

async function backgroundEnrich() {
  if (!engine || !aiEnricher || aiEnriching) return;
  aiEnriching = true;
  try {
    const currentProfile = engine.buildCurrentProfile();
    // Include file scan data in signals for AI context
    const enrichSignals = { ...browserSignals };
    if (fileScanText) {
      enrichSignals["_file_scan"] = fileScanText;
    }
    const result = await aiEnricher.enrichBatch(currentProfile.explicit, enrichSignals, accumulatedInferred);
    accumulatedInferred = { ...accumulatedInferred, ...result.inferred };
    if (result.exportRules.length > 0) {
      accumulatedExportRules = mergeExportRules(accumulatedExportRules, result.exportRules);
    }
  } catch {
    // Silent — AI enrichment is optional
  } finally {
    aiEnriching = false;
  }
}

async function finalizeProfile() {
  if (!engine) return;

  const builtProfile = engine.buildCurrentProfile();

  // Merge browser signals into explicit (skip internal _ prefixed keys)
  for (const [key, val] of Object.entries(browserSignals)) {
    if (key.startsWith("_")) continue;
    if (!builtProfile.explicit[key]) {
      builtProfile.explicit[key] = {
        dimension: key,
        value: val,
        confidence: 1.0 as const,
        source: "explicit" as const,
        question_id: "browser_auto_detect",
      };
    }
  }

  // Merge accumulated inferred from background enrichments
  for (const [key, dim] of Object.entries(accumulatedInferred)) {
    builtProfile.inferred[key] = {
      dimension: key,
      value: dim.value,
      confidence: dim.confidence || 0.7,
      source: "behavioral" as const,
      signal_id: "ai_enrichment",
      override: "secondary" as const,
    };
  }

  // If AI enricher available, do final synthesis
  if (aiEnricher) {
    synthesizing = true;
    try {
      const synthesisSignals = { ...browserSignals };
      if (fileScanText) {
        synthesisSignals["_file_scan"] = fileScanText;
      }
      // Pass accumulated export rules so synthesis can build on them
      if (accumulatedExportRules.length > 0) {
        synthesisSignals["_accumulated_rules"] = accumulatedExportRules.join("\n");
      }
      const result = await aiEnricher.synthesize(
        builtProfile.explicit,
        builtProfile.inferred,
        synthesisSignals
      );
      synthesisResult = result;

      // Merge additional inferred
      for (const [key, dim] of Object.entries(result.additionalInferred)) {
        builtProfile.inferred[key] = {
          dimension: key,
          value: dim.value,
          confidence: dim.confidence || 0.6,
          source: "behavioral" as const,
          signal_id: "ai_synthesis",
          override: "secondary" as const,
        };
      }

      // Set emergent observations
      builtProfile.emergent = result.emergent.map((e, i) => ({
        observation_id: crypto.randomUUID?.() ?? `emergent-${Date.now()}-${i}`,
        category: "personality_pattern" as const,
        title: e.title,
        observation: e.observation,
        evidence: [],
        confidence: 0.6,
        export_instruction: "",
        status: "pending_review" as const,
      }));

      // Store synthesis on profile for compiler access
      // Merge accumulated + synthesis export rules (dedup)
      const allRules = mergeExportRules(accumulatedExportRules, result.exportRules);
      builtProfile.synthesis = {
        narrative: result.narrative,
        archetype: result.archetype,
        archetypeDescription: result.archetypeDescription,
        exportRules: allRules,
        cognitiveProfile: result.cognitiveProfile,
        communicationDNA: result.communicationDNA,
        contradictions: result.contradictions,
        predictions: result.predictions,
        strengths: result.strengths,
        blindSpots: result.blindSpots,
      };

      builtProfile.meta.profiling_method = "hybrid";
    } catch {
      // AI failed — profile still valid without enrichment
    } finally {
      synthesizing = false;
    }
  }

  // AI mode: recalculate completeness against full dimension space (not just 5 seed questions)
  if (profilingMode === "ai") {
    const totalDims = Object.keys(builtProfile.explicit).length
      + Object.keys(builtProfile.inferred).length
      + Object.keys(builtProfile.compound).length;
    // Full profiling has ~142 questions mapping to ~80 unique dimensions
    builtProfile.completeness = Math.min(100, Math.round((totalDims / 80) * 100));
  }

  profile = builtProfile;
  isComplete = true;
  clearSessionState();
}

export async function finishEarly(): Promise<PersonaProfile | null> {
  if (!engine) return null;

  // Stop question flow
  currentEvent = null;
  inFollowUpPhase = false;
  inSummaryPhase = false;

  // Use finalizeProfile which handles synthesis, browser signals, inferred merge
  await finalizeProfile();
  return profile;
}

export function initDeepening(existingProfile: PersonaProfile) {
  profilingMode = "full";
  const skipDims = new Set(Object.keys(existingProfile.explicit));
  engine = new ProfilingEngine(personalTiers, skipDims, existingProfile.explicit);
  currentEvent = engine.getNextQuestion();
  answeredCount = Object.keys(existingProfile.explicit).length;
  currentQuestionNumber = 0;
  isComplete = false;
  profile = null;
  aiMode = false;

  // Estimate remaining questions (total minus already-covered dimensions)
  const allMainQs = personalTiers.reduce(
    (sum: number, tier: any) => sum + tier.questions.filter((q: any) => !q.is_followup).length,
    0
  );
  totalQuestions = Math.max(0, allMainQs - skipDims.size);

  // Browser auto-detection
  browserSignals = detectBrowserSignals();

  // Initialize AI enricher if API key available
  aiEnriching = false;
  synthesizing = false;
  // Carry over existing synthesis so deepening builds on it
  synthesisResult = null;
  answersSinceLastEnrich = 0;
  // Carry over existing inferred dimensions so enricher sees them
  accumulatedInferred = {};
  for (const [key, val] of Object.entries(existingProfile.inferred)) {
    accumulatedInferred[key] = {
      value: val.value,
      confidence: val.confidence,
      evidence: `Previous session: ${val.signal_id}`,
    };
  }
  refinementRound = 0;
  inSummaryPhase = false;
  intermediateSummary = null;
  summaryLoading = false;
  followUpQuestions = [];
  followUpIndex = 0;
  inFollowUpPhase = false;
  loadingFollowUps = false;
  // Carry over existing export rules from synthesis
  accumulatedExportRules = existingProfile.synthesis?.exportRules ?? [];

  const apiKey = getApiKey();
  const provider = getApiProvider();
  if (apiKey) {
    const clientProvider = provider;
    const client = createAIClient({
      provider: clientProvider as "claude" | "openai" | "ollama",
      apiKey,
    });
    aiEnricher = new AIEnricher(client, getLocale());
  } else {
    aiEnricher = null;
  }
}

// Category ID → tier index mapping (tiers are 1:1 with categories)
const categoryTierIndex: Record<string, number> = {
  identity: 0,
  communication: 1,
  cognitive: 2,
  work: 3,
  personality: 4,
  neurodivergent: 5,
  expertise: 6,
  life: 7,
  ai: 8,
};

/** Highest-signal question IDs per category — curated for maximum value */
const highSignalQuestions: Record<string, string[]> = {
  identity: ["t0_q01", "t0_q06", "t0_q07"],
  communication: ["t1_q01", "t1_q09", "t1_q03"],
  cognitive: ["t2_q15", "t2_q01", "t2_q06"],
  work: ["t3_q01", "t3_q04", "t3_q07"],
  personality: ["t4_q01", "t4_q03", "t4_q06"],
  neurodivergent: ["t5_q01", "t5_q03"],
  expertise: ["t6_q01", "t6_q03"],
  life: ["t7_q01", "t7_q03"],
  ai: ["t8_q01", "t8_q03"],
};

/**
 * Smart deepen — picks the top 5-7 highest-signal MISSING questions.
 * Prioritizes categories with lowest completion. Uses essential-like mode.
 */
export function initSmartDeepen(existingProfile: PersonaProfile) {
  const skipDims = new Set(Object.keys(existingProfile.explicit));

  // Collect all questions from all tiers
  const allQ = personalTiers.flatMap(tier => tier.questions);

  // Find unfilled high-signal questions, sorted by category weakness
  const catFilled: Record<string, number> = {};
  for (const key of Object.keys(existingProfile.explicit)) {
    const cat = key.split(".")[0];
    catFilled[cat] = (catFilled[cat] || 0) + 1;
  }

  // Build pool of candidate questions (high-signal + not yet answered)
  const candidates: { q: any; catFill: number }[] = [];
  for (const [cat, ids] of Object.entries(highSignalQuestions)) {
    for (const id of ids) {
      const q = allQ.find((qq: any) => qq.id === id);
      if (!q) continue;
      const dim = (q as any).dimension;
      // Skip if dimension already filled
      if (dim && skipDims.has(dim)) continue;
      // Check if options map to already-filled dimensions
      if ((q as any).options?.length) {
        const optDims = (q as any).options.map((o: any) => o.maps_to?.dimension).filter(Boolean);
        if (optDims.length > 0 && optDims.every((d: string) => skipDims.has(d))) continue;
      }
      candidates.push({ q, catFill: catFilled[cat] || 0 });
    }
  }

  // Sort by category weakness (least filled first), take top 7
  candidates.sort((a, b) => a.catFill - b.catFill);
  const picked = candidates.slice(0, 7).map(c => c.q);

  // Also include follow-ups for picked questions
  const pickedIds = new Set(picked.map((q: any) => q.id));
  const followUps = allQ.filter(
    (q: any) => q.is_followup && q.parent_question && pickedIds.has(q.parent_question)
  );

  // Build synthetic tier
  const smartTier = {
    tier: 0,
    tier_name: "Smart deepen",
    tier_intro: "",
    tier_complete: { headline: "", body: "" },
    questions: [...picked, ...followUps],
  };

  profilingMode = "essential";
  cachedBrowserCtx = null;
  engine = new ProfilingEngine([smartTier as any], skipDims, existingProfile.explicit);
  currentEvent = engine.getNextQuestion();

  // Auto-skip tier_start
  if (currentEvent?.type === "tier_start") {
    currentEvent = engine.getNextQuestion();
  }

  answeredCount = Object.keys(existingProfile.explicit).length;
  currentQuestionNumber = 0;
  isComplete = false;
  profile = null;
  totalQuestions = picked.length + followUps.length;

  // Browser auto-detection
  browserSignals = detectBrowserSignals();

  // Reset state
  pasteAnalyzing = false;
  pasteDone = false;
  pasteExtractedCount = 0;
  fileScanResult = null;
  fileScanText = "";
  fileScanAvailable = isFileScanAvailable();
  aiEnriching = false;
  synthesizing = false;
  synthesisResult = null;
  answersSinceLastEnrich = 0;
  accumulatedInferred = {};
  // Carry over existing inferred
  for (const [key, val] of Object.entries(existingProfile.inferred)) {
    accumulatedInferred[key] = {
      value: val.value,
      confidence: val.confidence,
      evidence: `Previous session: ${val.signal_id}`,
    };
  }
  refinementRound = 0;
  inSummaryPhase = false;
  intermediateSummary = null;
  summaryLoading = false;
  followUpQuestions = [];
  followUpIndex = 0;
  inFollowUpPhase = false;
  loadingFollowUps = false;
  accumulatedExportRules = existingProfile.synthesis?.exportRules ?? [];

  const apiKey = getApiKey();
  const provider = getApiProvider();
  if (apiKey) {
    const clientProvider = provider;
    const client = createAIClient({
      provider: clientProvider as "claude" | "openai" | "ollama",
      apiKey,
    });
    aiEnricher = new AIEnricher(client, getLocale());
  } else {
    aiEnricher = null;
  }
}

/**
 * Start profiling for a SPECIFIC category only.
 * Filters tiers to just the one matching the category, skips already-filled dimensions.
 */
export function initCategoryDeepening(existingProfile: PersonaProfile, categoryId: string) {
  const tierIdx = categoryTierIndex[categoryId];
  if (tierIdx === undefined) {
    // Fallback to full deepening if category not found
    initDeepening(existingProfile);
    return;
  }

  const targetTiers = [personalTiers[tierIdx]];
  const skipDims = new Set(Object.keys(existingProfile.explicit));

  profilingMode = "full";
  engine = new ProfilingEngine(targetTiers, skipDims, existingProfile.explicit);
  currentEvent = engine.getNextQuestion();
  answeredCount = Object.keys(existingProfile.explicit).length;
  currentQuestionNumber = 0;
  isComplete = false;
  profile = null;
  aiMode = false;

  // Count remaining questions in this category only
  const mainQs = targetTiers[0].questions.filter((q: any) => !q.is_followup);
  const unskipped = mainQs.filter((q: any) => {
    const dim = q.dimension;
    if (dim && skipDims.has(dim)) return false;
    if (q.options?.length) {
      const optDims = q.options.map((o: any) => o.maps_to?.dimension).filter(Boolean);
      if (optDims.length > 0 && optDims.every((d: string) => skipDims.has(d))) return false;
    }
    return true;
  });
  totalQuestions = unskipped.length;

  // Browser auto-detection
  browserSignals = detectBrowserSignals();

  // Reset AI/synthesis state
  aiEnriching = false;
  synthesizing = false;
  synthesisResult = null;
  answersSinceLastEnrich = 0;
  accumulatedInferred = {};
  for (const [key, val] of Object.entries(existingProfile.inferred)) {
    accumulatedInferred[key] = {
      value: val.value,
      confidence: val.confidence,
      evidence: `Previous session: ${val.signal_id}`,
    };
  }
  refinementRound = 0;
  inSummaryPhase = false;
  intermediateSummary = null;
  summaryLoading = false;
  followUpQuestions = [];
  followUpIndex = 0;
  inFollowUpPhase = false;
  loadingFollowUps = false;
  accumulatedExportRules = existingProfile.synthesis?.exportRules ?? [];

  const apiKey = getApiKey();
  const provider = getApiProvider();
  if (apiKey) {
    const clientProvider = provider;
    const client = createAIClient({
      provider: clientProvider as "claude" | "openai" | "ollama",
      apiKey,
    });
    aiEnricher = new AIEnricher(client, getLocale());
  } else {
    aiEnricher = null;
  }
}

/** Extract readable message from partial/complete JSON streaming text */
function extractMessageFromStream(raw: string): string {
  // Try to extract "message": "..." from partial JSON
  const match = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (match) return match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
  // Fallback: if we see the start of message field, show what we have
  const partialMatch = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (partialMatch) return partialMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
  return "";
}

export async function initAIProfiling() {
  const apiKey = getApiKey();
  const provider = getApiProvider();
  const locale = getLocale();

  const clientProvider = provider;

  const client = createAIClient({
    provider: clientProvider,
    apiKey: clientProvider !== "ollama" ? apiKey : undefined,
    baseUrl: clientProvider === "ollama" ? getOllamaUrl() : undefined,
  });

  // Reset all state first
  engine = null;
  currentEvent = null;
  answeredCount = 0;
  currentQuestionNumber = 0;
  isComplete = false;
  profile = null;
  aiMode = true;
  aiMessages = [];
  aiLoading = true;
  aiDepth = 0;
  aiPhaseLabel = "";
  aiStreamingText = "";
  aiOptions = [];

  let rawStream = "";

  // Auto-detect what we can from the browser
  const autoDetected: Record<string, string> = {};
  autoDetected["identity.locale"] = locale;
  autoDetected["identity.timezone"] = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const platform = navigator.platform || navigator.userAgent;
  if (platform.includes("Mac")) autoDetected["context.platform"] = "macOS";
  else if (platform.includes("Win")) autoDetected["context.platform"] = "Windows";
  else if (platform.includes("Linux")) autoDetected["context.platform"] = "Linux";

  const interviewer = new AIInterviewer({
    client,
    locale,
    knownDimensions: autoDetected,
    onStreamChunk: (chunk: string) => {
      rawStream += chunk;
      aiStreamingText = extractMessageFromStream(rawStream);
    },
  });

  aiInterviewer = interviewer;

  // Start the interview
  try {
    const round = await interviewer.start();
    aiStreamingText = "";
    rawStream = "";
    aiMessages = [{ role: "assistant", content: round.aiMessage }];
    aiOptions = round.options;
    aiDepth = round.depth;
    aiPhaseLabel = round.phaseLabel;
    if (round.complete) {
      profile = interviewer.buildProfile();
      isComplete = true;
    }
  } catch (err) {
    aiStreamingText = "";
    aiOptions = [];
    const msg = (err as Error).message;
    aiMessages = [{ role: "assistant", content: msg.includes("fetch") ? "Nie udało się połączyć z AI. Sprawdź klucz API i połączenie." : msg }];
  } finally {
    aiLoading = false;
  }
}

export async function sendAIMessage(text: string) {
  if (!aiInterviewer || aiLoading) return;

  aiMessages = [...aiMessages, { role: "user", content: text }];
  aiLoading = true;
  aiStreamingText = "";

  try {
    const round = await aiInterviewer.respond(text);
    aiStreamingText = "";
    aiMessages = [...aiMessages, { role: "assistant", content: round.aiMessage }];
    aiOptions = round.options;
    aiDepth = round.depth;
    aiPhaseLabel = round.phaseLabel;
    answeredCount = Object.keys(round.dimensions).length;

    if (round.complete) {
      profile = aiInterviewer.buildProfile();
      isComplete = true;
    }
  } catch (err) {
    aiStreamingText = "";
    aiOptions = [];
    const msg = (err as Error).message;
    aiMessages = [...aiMessages, { role: "assistant", content: msg.includes("fetch") ? "Nie udało się połączyć z AI. Sprawdź klucz API." : msg }];
  } finally {
    aiLoading = false;
  }
}

export function finishAIEarly(): PersonaProfile | null {
  if (!aiInterviewer) return null;
  profile = aiInterviewer.buildProfile();
  isComplete = true;
  return profile;
}
