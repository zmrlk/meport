/**
 * Profiling session state — Svelte 5 runes.
 *
 * PRIMARY path: PackProfilingEngine (pack-based, same as CLI profile-v2).
 * ADDITIONAL modes: AI interview, rapid synthesis — unchanged.
 *
 * Pack engine flow (mirrors packages/cli/src/commands/profile-v2.ts):
 *   1. runSystemScan equivalent — browser signals as ScanContext
 *   2. loadPackBrowser("micro-setup") → PackProfilingEngine
 *   3. Generator loop: yield PackEngineEvent, receive PackAnswerInput
 *   4. pack_selection event → loadPacksBrowser for selected packs → engine.addPacks
 *   5. profiling_complete → runPackLayer2 → Layer 2 inference
 *   6. Optional AI enrichment (synthesis, follow-ups) — unchanged
 */
import {
  PackProfilingEngine,
  type PackEngineEvent,
  type PackAnswerInput,
  type ScanContext,
} from "@meport/core/pack-engine";
import { runPackLayer2 } from "@meport/core/inference";
import type { PackId, Pack } from "@meport/core/pack-loader";
import { AIInterviewer, type InterviewRound } from "@meport/core/interviewer";
import {
  AIEnricher,
  calculateCompleteness,
  type SynthesisResult,
  type FollowUpQuestion,
  type MegaSynthesisResult,
  type MicroQuestion,
  type MicroAnswerMeta,
  type ImportSource,
  type BehavioralSignals,
} from "@meport/core/enricher";
import { detectBrowserSignals } from "@meport/core/browser-detect";
import { isFileScanAvailable, scanDirectory, scanResultToText, type ScanResult } from "@meport/core/file-scanner";
import { createAIClient } from "@meport/core/client";
import { detectBrowserContext, type BrowserContext } from "../browser-intelligence.js";
import type { PersonaProfile } from "@meport/core/types";
import { getApiKey, getApiProvider, getOllamaUrl } from "./app.svelte.js";
import { getLocale } from "../i18n.svelte.js";
import { loadPackBrowser, loadPacksBrowser } from "../pack-loader-browser.js";

// ─── Pack Engine State ──────────────────────────────────────

let packEngine = $state<PackProfilingEngine | null>(null);
let packGenerator: Generator<PackEngineEvent, PersonaProfile, PackAnswerInput | undefined> | null = null;

// The unified "current event" — now typed as PackEngineEvent
let currentEvent = $state<PackEngineEvent | null>(null);

let answeredCount = $state(0);
let isComplete = $state(false);
let profile = $state<PersonaProfile | null>(null);
let animating = $state(false);

// Pack engine tracks question index internally; we mirror it for the progress bar
let totalQuestions = $state(0);
let currentQuestionNumber = $state(0);

// ScanContext built from browser signals (replaces runSystemScan for browser env)
let packScanContext = $state<ScanContext>({ dimensions: new Map() });

// Selected packs — set when pack_selection event is confirmed
let selectedPackIds = $state<PackId[]>([]);

// All loaded packs for layer 2
let allLoadedPacks = $state<Pack[]>([]);

// Export rules collected from pack answers
let packExportRules = $state<Map<string, string>>(new Map());

// Question history for back navigation
let questionHistory = $state<PackEngineEvent[]>([]);

// ─── AI mode state ─────────────────────────────────────────

let aiMode = $state(false);
let aiInterviewer = $state<AIInterviewer | null>(null);
let aiMessages = $state<{ role: "user" | "assistant"; content: string }[]>([]);
let aiLoading = $state(false);
let aiDepth = $state(0);
let aiPhaseLabel = $state("");
let aiStreamingText = $state("");
let aiOptions = $state<string[]>([]);

// ─── Hybrid enrichment state ────────────────────────────────

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

// ─── Iterative refinement ───────────────────────────────────

let refinementRound = $state(0);
let inSummaryPhase = $state(false);
let intermediateSummary = $state<SynthesisResult | null>(null);
let summaryLoading = $state(false);

const MAX_REFINEMENT_ROUNDS = 2;

let accumulatedExportRules = $state<string[]>([]);

// ─── Profiling mode ─────────────────────────────────────────

let profilingMode = $state<"quick" | "full" | "ai" | "essential">("quick");

// ─── Paste / instruction import ─────────────────────────────

let pasteAnalyzing = $state(false);
let pasteDone = $state(false);
let pasteExtractedCount = $state(0);

// ─── Rapid Mode State ───────────────────────────────────────

let rapidMode = $state(false);
let rapidPhase = $state<"import" | "synthesizing" | "micro" | "done" | "error">("import");
let importedText = $state("");
let importedPlatform = $state("");
let importedFiles = $state<string[]>([]);
let megaResult = $state<MegaSynthesisResult | null>(null);
let microAnswers = $state<Record<string, string>>({});
let microAnswerMeta = $state<Record<string, MicroAnswerMeta>>({});
let microQuestionShownAt = $state(0);
let microIndex = $state(0);
let microRound = $state(1);
let synthesisProgress = $state("");
let synthesisError = $state("");
let synthesisElapsed = $state(0);

let synthAbortController: AbortController | null = null;
let synthTimeoutId: ReturnType<typeof setTimeout> | null = null;
let synthElapsedInterval: ReturnType<typeof setInterval> | null = null;

let importSources = $state<ImportSource[]>([]);
let behavioralSignals = $state<BehavioralSignals>({});
let importScreenEnteredAt = $state(0);

let cachedBrowserCtx: BrowserContext | null = null;

// ─── Pack selection (persisted) ─────────────────────────────

// NOTE: PackId from @meport/core excludes "micro-setup" and "core" (those are always included).
// The user-facing pack selection is the same subset as the CLI.
export type { PackId };

export function getDefaultPacks(mode: "quick" | "full" | "ai" | "essential"): PackId[] {
  if (mode === "quick") return ["context"];
  // full / ai / essential — all non-sensitive optional packs
  return ["story", "context", "work", "lifestyle", "learning"] as PackId[];
}

function loadSelectedPacksFromStorage(): PackId[] {
  try {
    const raw = localStorage.getItem("meport:selectedPacks");
    return raw ? JSON.parse(raw) : getDefaultPacks("quick");
  } catch {
    return getDefaultPacks("quick");
  }
}

let selectedPacks = $state<PackId[]>(loadSelectedPacksFromStorage());

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

/** Legacy map — kept for backwards compatibility with ProfilingScreen pack UI */
export const PACK_TIER_MAP: Record<string, string[]> = {
  story:     ["personality", "values", "background", "identity"],
  context:   ["life_context", "location", "occupation", "life_stage"],
  work:      ["work", "productivity", "deadlines", "energy"],
  lifestyle: ["lifestyle", "routines", "hobbies", "social"],
  health:    ["neurodivergent", "wellness", "health", "adhd"],
  finance:   ["finance", "budget", "spending"],
  learning:  ["learning", "cognitive", "study", "reading"],
};

// ─── File scan state ────────────────────────────────────────

let fileScanResult = $state<ScanResult | null>(null);
let fileScanText = $state("");
let fileScanAvailable = $state(false);
let fileScanError = $state(false);

// ─── Getters ────────────────────────────────────────────────

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
export function getFileScanError() { return fileScanError; }
export function getPackExportRules() { return packExportRules; }
export function canGoBack() { return questionHistory.length > 0; }

export function goBack() {
  if (questionHistory.length === 0) return;
  const prev = questionHistory[questionHistory.length - 1];
  questionHistory = questionHistory.slice(0, -1);
  currentEvent = prev;
  if (answeredCount > 0) answeredCount--;
  if (currentQuestionNumber > 0) currentQuestionNumber--;
}

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

// ─── Utility: build ScanContext from browser signals ────────

function buildScanContext(signals: Record<string, string>): ScanContext {
  const dims = new Map<string, { value: string; confidence: number; source: string }>();
  for (const [key, val] of Object.entries(signals)) {
    if (!key.startsWith("_") && val) {
      dims.set(key, { value: val, confidence: 0.9, source: "browser" });
    }
  }
  return { dimensions: dims };
}

// ─── initProfiling — PRIMARY PACK PATH ─────────────────────

/**
 * Initialize the pack-based profiling flow.
 * Matches the CLI profile-v2 flow but adapted for the browser:
 * - System scan → browser signals (no node:fs)
 * - Pack loading → static JSON imports via loadPackBrowser
 * - Generator loop → driven by submitAnswer / advanceEvent
 */
export async function initProfiling(_mode: "quick" | "full" | "ai" | "essential" = "quick") {
  // mode param kept for API compatibility but pack engine runs the same flow for all modes
  profilingMode = _mode;
  cachedBrowserCtx = null;

  // Apply mode-based pack defaults if no user preference stored
  if (!localStorage.getItem("meport:selectedPacks")) {
    selectedPacks = getDefaultPacks(_mode);
  }

  // Reset all state
  packEngine = null;
  packGenerator = null;
  currentEvent = null;
  answeredCount = 0;
  currentQuestionNumber = 0;
  isComplete = false;
  profile = null;
  aiMode = false;
  selectedPackIds = [];
  allLoadedPacks = [];
  packExportRules = new Map();
  questionHistory = [];

  // Browser signals → ScanContext (replaces runSystemScan)
  browserSignals = detectBrowserSignals();
  packScanContext = buildScanContext(browserSignals);

  // Paste state reset
  pasteAnalyzing = false;
  pasteDone = false;
  pasteExtractedCount = 0;

  // File scan state reset
  fileScanResult = null;
  fileScanText = "";
  fileScanAvailable = isFileScanAvailable();

  // AI enricher state reset
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

  // Load micro-setup pack (always first)
  const locale = getLocale();
  const microSetup = await loadPackBrowser("micro-setup", locale);
  if (!microSetup) {
    // Fallback: nothing to show — go to error state gracefully
    console.error("[meport] Failed to load micro-setup pack");
    return;
  }

  allLoadedPacks = [microSetup];

  // Create engine with micro-setup and scan context
  packEngine = new PackProfilingEngine(microSetup, packScanContext);

  // Start generator
  packGenerator = packEngine.run();
  const first = packGenerator.next();
  if (!first.done) {
    currentEvent = first.value as PackEngineEvent;
  }

  // Estimate total questions — micro-setup + core always loaded; count their questions
  // We'll update this when packs are loaded after pack_selection
  totalQuestions = microSetup.questions.length;

  // Initialize AI enricher if API key present
  const apiKey = getApiKey();
  const provider = getApiProvider();
  if (apiKey) {
    const client = createAIClient({
      provider: provider as "claude" | "openai" | "ollama",
      apiKey: provider !== "ollama" ? apiKey : undefined,
      baseUrl: provider === "ollama" ? getOllamaUrl() : undefined,
    });
    aiEnricher = new AIEnricher(client, locale);
  } else {
    aiEnricher = null;
  }
}

// ─── submitAnswer — feeds answer to the generator ───────────

export async function submitAnswer(
  questionId: string,
  value: PackAnswerInput["value"],
  skipped = false
) {
  if (!packGenerator || !packEngine) return;

  animating = true;
  await new Promise(r => setTimeout(r, 250));

  // Track current event in history for back navigation
  if (currentEvent?.type === "question" || currentEvent?.type === "confirm") {
    questionHistory = [...questionHistory, currentEvent];
  }

  const input: PackAnswerInput = { value, skipped };
  if (!skipped) {
    answeredCount++;
    answersSinceLastEnrich++;
  }
  currentQuestionNumber++;
  saveSessionState();

  // Background enrichment every 3 answers
  if (answersSinceLastEnrich >= 3 && aiEnricher && !aiEnriching) {
    answersSinceLastEnrich = 0;
    void backgroundEnrich();
  }

  const result = packGenerator.next(input);
  await handleGeneratorResult(result);

  await new Promise(r => setTimeout(r, 50));
  animating = false;
}

// ─── advanceEvent — advance past non-question events ────────

export async function advanceEvent() {
  if (!packGenerator) return;

  animating = true;
  await new Promise(r => setTimeout(r, 250));

  const result = packGenerator.next(undefined);
  await handleGeneratorResult(result);

  await new Promise(r => setTimeout(r, 50));
  animating = false;
}

// ─── handleGeneratorResult — processes each yielded event ───

async function handleGeneratorResult(
  result: IteratorResult<PackEngineEvent, PersonaProfile>
) {
  if (result.done) {
    // Generator finished — profile returned as value
    await onProfilingComplete(result.value, packExportRules);
    return;
  }

  const event = result.value as PackEngineEvent;

  switch (event.type) {
    case "pack_start":
    case "pack_complete":
    case "preview_ready":
      // These are informational — surface to the UI then auto-advance for non-interactive events.
      // pack_start and pack_complete are analogous to tier_start/tier_complete — screen advanceEvent.
      // preview_ready is internal — auto-advance immediately (no UI needed for it).
      if (event.type === "preview_ready") {
        const next = packGenerator!.next(undefined);
        await handleGeneratorResult(next);
      } else {
        currentEvent = event;
      }
      break;

    case "pack_selection":
      // Surface to UI — the ProfilingScreen renders a pack picker for this event.
      currentEvent = event;
      break;

    case "confirm":
    case "question":
      currentEvent = event;
      break;

    case "profiling_complete": {
      await onProfilingComplete(event.profile, event.exportRules);
      break;
    }
  }
}

// ─── selectPacksAndContinue — called from UI on pack_selection ──

/**
 * Called when user confirms pack selection from the pack_selection event.
 * Loads the selected packs, adds them to the engine, then continues the generator.
 */
export async function selectPacksAndContinue(packIds: PackId[]) {
  if (!packEngine || !packGenerator) return;

  selectedPackIds = packIds;
  packEngine.setSelectedPacks(packIds);

  // Always load "core" + selected packs (mirrors CLI: toLoad = ["core", ...selected])
  const toLoad: PackId[] = ["core"];
  for (const id of packIds) {
    if (id !== "core") toLoad.push(id);
  }

  const locale = getLocale();
  try {
    const packs = await loadPacksBrowser(toLoad, locale);
    packEngine.addPacks(packs);
    allLoadedPacks = [...allLoadedPacks, ...packs];

    // Update total question estimate
    totalQuestions = allLoadedPacks.reduce((sum, p) => sum + p.questions.length, 0);
  } catch (err) {
    console.warn("[meport] Some packs failed to load:", err);
  }

  // Feed the pack_selection answer to the generator
  const input: PackAnswerInput = { value: packIds };
  const result = packGenerator.next(input);
  await handleGeneratorResult(result);
}

// ─── onProfilingComplete — runs Layer 2, finalizes profile ──

async function onProfilingComplete(
  rawProfile: PersonaProfile,
  exportRules: Map<string, string>
) {
  packExportRules = exportRules;
  currentEvent = null;

  // Layer 2 inference (rule-based, offline)
  const enriched = runPackLayer2(rawProfile, packEngine?.getAnswers() ?? new Map(), allLoadedPacks);

  // Merge browser signals as explicit dims
  for (const [key, val] of Object.entries(browserSignals)) {
    if (key.startsWith("_")) continue;
    if (!enriched.explicit[key]) {
      enriched.explicit[key] = {
        dimension: key,
        value: val,
        confidence: 1.0,
        source: "explicit",
        question_id: "browser_auto_detect",
      };
    }
  }

  // If AI enricher present, run follow-ups then synthesis
  if (aiEnricher) {
    await startFollowUpPhase(enriched);
  } else {
    profile = enriched;
    isComplete = true;
    clearSessionState();
  }
}

// ─── Paste / instruction import ─────────────────────────────

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
    pasteDone = pasteExtractedCount > 0;
    return pasteDone;
  } catch {
    pasteDone = false;
    return false;
  } finally {
    pasteAnalyzing = false;
  }
}

export function skipPaste() {
  pasteAnalyzing = false;
  pasteDone = false;
  pasteExtractedCount = 0;
}

// ─── Rapid Mode ─────────────────────────────────────────────

export function initRapidProfiling() {
  const apiKey = getApiKey();
  const provider = getApiProvider();
  if (!apiKey) {
    void initProfiling("quick");
    return;
  }

  packEngine = null;
  packGenerator = null;
  currentEvent = null;
  answeredCount = 0;
  currentQuestionNumber = 0;
  isComplete = false;
  profile = null;
  aiMode = false;

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

  browserSignals = detectBrowserSignals();
  cachedBrowserCtx = null;

  const client = createAIClient({
    provider: provider as "claude" | "openai" | "ollama",
    apiKey: provider !== "ollama" ? apiKey : undefined,
    baseUrl: provider === "ollama" ? getOllamaUrl() : undefined,
  });
  aiEnricher = new AIEnricher(client, getLocale());

  synthesizing = false;
  synthesisResult = null;
  accumulatedInferred = {};
  accumulatedExportRules = [];
}

export async function submitRapidImport(text: string, platform: string, fileContents: string[]) {
  if (!aiEnricher) return;
  importedText = text;
  importedPlatform = platform;
  importedFiles = fileContents;
  if (importScreenEnteredAt > 0) {
    behavioralSignals = {
      ...behavioralSignals,
      importDwellTimeSec: Math.round((Date.now() - importScreenEnteredAt) / 1000),
    };
  }
  await runMegaSynthesis();
}

export async function submitMultiSourceImport(sources: ImportSource[]) {
  if (!aiEnricher) return;
  importSources = sources;
  if (importScreenEnteredAt > 0) {
    behavioralSignals = {
      ...behavioralSignals,
      importDwellTimeSec: Math.round((Date.now() - importScreenEnteredAt) / 1000),
    };
  }
  await runMegaSynthesis();
}

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

  synthAbortController = new AbortController();
  const signal = synthAbortController.signal;

  synthTimeoutId = setTimeout(() => {
    synthAbortController?.abort("timeout");
  }, 60_000);

  synthElapsedInterval = setInterval(() => {
    synthesisElapsed += 1;
  }, 1_000);

  try {
    const hasSources = importSources.length > 0;
    const hasBehavior = Object.keys(behavioralSignals).length > 0;

    const result = await aiEnricher.megaSynthesize({
      browserContext: browserSignals,
      ...(hasSources ? { sources: importSources } : {
        pastedText: importedText || undefined,
        pastedPlatform: importedPlatform || undefined,
        uploadedFileContents: importedFiles.length > 0 ? importedFiles : undefined,
      }),
      ...(hasBehavior ? { behavioralSignals } : {}),
      locale: getLocale(),
    });

    megaResult = result;

    if (result.microQuestions.length > 0) {
      rapidPhase = "micro";
      microIndex = 0;
      microAnswers = {};
      microAnswerMeta = {};
      microQuestionShownAt = Date.now();
    } else {
      await finalizeRapidProfile();
    }
  } catch (err) {
    console.error("[meport] MegaSynthesis error:", err, "signal.aborted:", signal.aborted, "signal.reason:", signal.reason);
    if (signal.aborted) {
      if (signal.reason === "timeout") {
        synthesisError = getLocale() === "pl"
          ? "AI nie odpowiada. Sprawdź połączenie i spróbuj ponownie."
          : "AI is not responding. Check your connection and try again.";
      } else {
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

export async function submitMicroAnswer(questionId: string, answer: string, changedMind = false) {
  const now = Date.now();
  microAnswers[questionId] = answer;
  microAnswerMeta[questionId] = {
    responseTimeMs: microQuestionShownAt > 0 ? now - microQuestionShownAt : 0,
    changedMind,
  };
  answeredCount++;
  microIndex++;
  microQuestionShownAt = now;

  const questions = megaResult?.microQuestions ?? [];
  if (microIndex >= questions.length) {
    await refineAndFinalize();
  }
}

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

    if (refined.microQuestions.length > 0 && microRound < 2) {
      microRound++;
      rapidPhase = "micro";
      microIndex = 0;
      microAnswers = {};
      microAnswerMeta = {};
      microQuestionShownAt = Date.now();
      return;
    }
  } catch {
    // Refinement failed — use original
  }

  await finalizeRapidProfile();
}

async function finalizeRapidProfile() {
  if (!megaResult) return;

  rapidPhase = "done";

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

  for (const [key, dim] of Object.entries(megaResult.dimensions)) {
    if (dim.confidence >= 0.85) {
      builtProfile.explicit[key] = {
        dimension: key,
        value: dim.value,
        confidence: 1.0,
        source: "explicit",
        question_id: "mega_synthesis",
      };
    } else {
      builtProfile.inferred[key] = {
        dimension: key,
        value: dim.value,
        confidence: dim.confidence,
        source: "behavioral",
        signal_id: "mega_synthesis",
        override: "secondary",
      };
    }
  }

  for (const [key, val] of Object.entries(browserSignals)) {
    if (key.startsWith("_")) continue;
    if (!builtProfile.explicit[key]) {
      builtProfile.explicit[key] = {
        dimension: key,
        value: val,
        confidence: 1.0,
        source: "explicit",
        question_id: "browser_auto_detect",
      };
    }
  }

  for (const [qId, answer] of Object.entries(microAnswers)) {
    const mq = megaResult.microQuestions.find(q => q.id === qId);
    if (mq?.dimension) {
      builtProfile.explicit[mq.dimension] = {
        dimension: mq.dimension,
        value: answer,
        confidence: 1.0,
        source: "explicit",
        question_id: qId,
      };
    }
  }

  builtProfile.emergent = megaResult.emergent.map((e, i) => ({
    observation_id: crypto.randomUUID?.() ?? `emergent-${Date.now()}-${i}`,
    category: "personality_pattern",
    title: typeof e === "string" ? e.split(":")[0] || e : "",
    observation: typeof e === "string" ? e : "",
    evidence: [],
    confidence: 0.6,
    export_instruction: "",
    status: "pending_review",
  }));

  const completenessResult = calculateCompleteness(megaResult);
  builtProfile.completeness = completenessResult.score;

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

// ─── cancelRapidSynthesis / retrySynthesis ──────────────────

export function cancelRapidSynthesis() {
  synthAbortController?.abort("cancel");
  if (synthTimeoutId !== null) { clearTimeout(synthTimeoutId); synthTimeoutId = null; }
  if (synthElapsedInterval !== null) { clearInterval(synthElapsedInterval); synthElapsedInterval = null; }
  synthesisElapsed = 0;
  synthesisError = "";
  rapidPhase = "import";
}

export function retrySynthesis() {
  synthesisError = "";
  synthesisElapsed = 0;
  rapidPhase = "import";
  void runMegaSynthesis();
}

export function recordBehavioralSignal(key: keyof BehavioralSignals, value: any) {
  behavioralSignals = { ...behavioralSignals, [key]: value };
}

// ─── File scan ──────────────────────────────────────────────

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

// ─── Follow-ups (AI enrichment after pack questions) ────────

async function startFollowUpPhase(currentProfile: PersonaProfile) {
  if (!aiEnricher) {
    profile = currentProfile;
    isComplete = true;
    clearSessionState();
    return;
  }

  loadingFollowUps = true;
  inFollowUpPhase = true;
  followUpIndex = 0;
  followUpQuestions = [];

  try {
    const followUpSignals = { ...browserSignals };
    if (fileScanText) followUpSignals["_file_scan"] = fileScanText;

    const allInferred = { ...currentProfile.inferred, ...accumulatedInferred };

    const enrichPromise = !aiEnriching
      ? aiEnricher.enrichBatch(currentProfile.explicit, followUpSignals, allInferred).catch(() => null)
      : Promise.resolve(null);

    const followUpPromise = aiEnricher.generateFollowUps(
      currentProfile.explicit,
      allInferred,
      followUpSignals
    );

    const [enrichResult, questions] = await Promise.all([enrichPromise, followUpPromise]);

    if (enrichResult) {
      accumulatedInferred = { ...accumulatedInferred, ...enrichResult.inferred };
      if (enrichResult.exportRules.length > 0) {
        accumulatedExportRules = mergeExportRules(accumulatedExportRules, enrichResult.exportRules);
      }
    }

    followUpQuestions = guardFollowUpQuality(questions);
    loadingFollowUps = false;

    if (followUpQuestions.length === 0) {
      inFollowUpPhase = false;
      await finalizePackProfile(currentProfile);
    }
  } catch {
    loadingFollowUps = false;
    inFollowUpPhase = false;
    await finalizePackProfile(currentProfile);
  }
}

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
  const valid = questions.filter(q =>
    q.options.length >= 2 &&
    q.options.some(opt => opt.length >= 5) &&
    q.question.length >= 10
  );

  if (valid.length >= 2) return valid;

  const knownDims = new Set(Object.keys(accumulatedInferred));
  const usable = FALLBACK_FOLLOWUPS.filter(fb => !knownDims.has(fb.dimension));
  return [...valid, ...usable].slice(0, 4);
}

export function submitFollowUp(questionId: string, value: string) {
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

  if (followUpIndex < followUpQuestions.length) return;

  inFollowUpPhase = false;
  refinementRound++;

  if (refinementRound <= MAX_REFINEMENT_ROUNDS) {
    void showIntermediateSummary();
  } else {
    void finalizePackProfile(null);
  }
}

export function skipFollowUps() {
  if (!inFollowUpPhase) return;
  inFollowUpPhase = false;
  void finalizePackProfile(null);
}

async function showIntermediateSummary() {
  if (!aiEnricher) {
    await finalizePackProfile(null);
    return;
  }

  summaryLoading = true;
  inSummaryPhase = true;

  try {
    // Build a partial profile from pack engine answers + accumulated inferred
    const partialProfile = buildCurrentPackProfile();
    const synthesisSignals = { ...browserSignals };
    if (fileScanText) synthesisSignals["_file_scan"] = fileScanText;

    const result = await aiEnricher.synthesizeIntermediate(
      partialProfile.explicit,
      { ...partialProfile.inferred, ...accumulatedInferred },
      synthesisSignals
    );
    intermediateSummary = result;

    for (const [key, dim] of Object.entries(result.additionalInferred)) {
      accumulatedInferred[key] = dim;
    }
    if (result.exportRules.length > 0) {
      accumulatedExportRules = mergeExportRules(accumulatedExportRules, result.exportRules);
    }
  } catch {
    inSummaryPhase = false;
    await finalizePackProfile(null);
  } finally {
    summaryLoading = false;
  }
}

export function confirmSummary() {
  inSummaryPhase = false;
  void finalizePackProfile(null);
}

export async function requestCorrections(feedback: string) {
  if (!aiEnricher) return;

  inSummaryPhase = false;
  loadingFollowUps = true;
  inFollowUpPhase = true;
  followUpIndex = 0;
  followUpQuestions = [];

  try {
    const partialProfile = buildCurrentPackProfile();
    const followUpSignals = { ...browserSignals };
    if (fileScanText) followUpSignals["_file_scan"] = fileScanText;
    followUpSignals["_user_correction"] = feedback;

    const allInferred = { ...partialProfile.inferred, ...accumulatedInferred };
    const questions = await aiEnricher.generateFollowUps(
      partialProfile.explicit,
      allInferred,
      followUpSignals
    );
    followUpQuestions = guardFollowUpQuality(questions);
    loadingFollowUps = false;

    if (followUpQuestions.length === 0) {
      inFollowUpPhase = false;
      await finalizePackProfile(null);
    }
  } catch {
    loadingFollowUps = false;
    inFollowUpPhase = false;
    await finalizePackProfile(null);
  }
}

// ─── Background enrichment ──────────────────────────────────

async function backgroundEnrich() {
  if (!aiEnricher || aiEnriching) return;
  aiEnriching = true;
  try {
    const partialProfile = buildCurrentPackProfile();
    const enrichSignals = { ...browserSignals };
    if (fileScanText) enrichSignals["_file_scan"] = fileScanText;
    const result = await aiEnricher.enrichBatch(partialProfile.explicit, enrichSignals, accumulatedInferred);
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

// ─── finalizePackProfile — runs AI synthesis if available ───

async function finalizePackProfile(baseProfile: PersonaProfile | null) {
  // Use the pack engine's built profile if no base passed
  const builtProfile = baseProfile ?? buildCurrentPackProfile();

  // Merge browser signals
  for (const [key, val] of Object.entries(browserSignals)) {
    if (key.startsWith("_")) continue;
    if (!builtProfile.explicit[key]) {
      builtProfile.explicit[key] = {
        dimension: key,
        value: val,
        confidence: 1.0,
        source: "explicit",
        question_id: "browser_auto_detect",
      };
    }
  }

  // Merge accumulated AI inferred
  for (const [key, dim] of Object.entries(accumulatedInferred)) {
    builtProfile.inferred[key] = {
      dimension: key,
      value: dim.value,
      confidence: dim.confidence || 0.7,
      source: "behavioral",
      signal_id: "ai_enrichment",
      override: "secondary",
    };
  }

  if (aiEnricher) {
    synthesizing = true;
    try {
      const synthesisSignals = { ...browserSignals };
      if (fileScanText) synthesisSignals["_file_scan"] = fileScanText;
      if (accumulatedExportRules.length > 0) {
        synthesisSignals["_accumulated_rules"] = accumulatedExportRules.join("\n");
      }

      const result = await aiEnricher.synthesize(
        builtProfile.explicit,
        builtProfile.inferred,
        synthesisSignals
      );
      synthesisResult = result;

      for (const [key, dim] of Object.entries(result.additionalInferred)) {
        builtProfile.inferred[key] = {
          dimension: key,
          value: dim.value,
          confidence: dim.confidence || 0.6,
          source: "behavioral",
          signal_id: "ai_synthesis",
          override: "secondary",
        };
      }

      builtProfile.emergent = result.emergent.map((e, i) => ({
        observation_id: crypto.randomUUID?.() ?? `emergent-${Date.now()}-${i}`,
        category: "personality_pattern",
        title: e.title,
        observation: e.observation,
        evidence: [],
        confidence: 0.6,
        export_instruction: "",
        status: "pending_review",
      }));

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
      // AI failed — profile valid without synthesis
    } finally {
      synthesizing = false;
    }
  }

  profile = builtProfile;
  isComplete = true;
  clearSessionState();
}

// ─── buildCurrentPackProfile — snapshot from pack engine ────

function buildCurrentPackProfile(): PersonaProfile {
  if (!packEngine) {
    // No engine yet (e.g. rapid mode) — return minimal profile
    const now = new Date().toISOString();
    return {
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
      meta: {
        tiers_completed: [],
        tiers_skipped: [],
        total_questions_answered: answeredCount,
        total_questions_skipped: 0,
        avg_response_time_ms: 0,
        profiling_duration_ms: 0,
        profiling_method: "interactive",
        layer3_available: false,
      },
    };
  }

  // Trigger a "build" by running Layer 2 on current answers.
  // PackProfilingEngine doesn't expose buildCurrentProfile() (that's the legacy engine).
  // We reconstruct by calling runPackLayer2 with the engine's current answer state.
  // For a mid-session snapshot this is approximate — good enough for follow-ups.
  const answers = packEngine.getAnswers();
  const tempProfile: PersonaProfile = {
    schema_version: "1.0",
    profile_type: "personal",
    profile_id: crypto.randomUUID?.() ?? `profile-${Date.now()}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completeness: 0,
    explicit: {},
    inferred: {},
    compound: {},
    contradictions: [],
    emergent: [],
    meta: {
      tiers_completed: [],
      tiers_skipped: [],
      total_questions_answered: answeredCount,
      total_questions_skipped: 0,
      avg_response_time_ms: 0,
      profiling_duration_ms: 0,
      profiling_method: "interactive",
      layer3_available: false,
    },
  };

  // Add scan-detected dimensions
  for (const [dim, val] of packScanContext.dimensions) {
    tempProfile.explicit[dim] = {
      dimension: dim,
      value: val.value,
      confidence: 1.0,
      source: "explicit",
      question_id: `scan:${val.source}`,
    };
  }

  return runPackLayer2(tempProfile, answers, allLoadedPacks);
}

// ─── getDiscoveredDimensions ────────────────────────────────

export function getDiscoveredDimensions(max = 3): string[] {
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
  for (const key of Object.keys(accumulatedInferred)) {
    const label = labels[key];
    if (label) result.push(label);
    if (result.length >= max) break;
  }
  return result;
}

// ─── finishEarly ────────────────────────────────────────────

export async function finishEarly(): Promise<PersonaProfile | null> {
  currentEvent = null;
  inFollowUpPhase = false;
  inSummaryPhase = false;

  const baseProfile = buildCurrentPackProfile();
  await finalizePackProfile(baseProfile);
  return profile;
}

// ─── Deepen modes (use legacy ProfilingEngine internally) ───
//
// Deepening operates on an EXISTING profile — it adds questions for unfilled
// dimensions. The pack engine starts from scratch (micro-setup) and can't easily
// resume mid-profile. For deepening we keep the legacy ProfilingEngine to minimize
// risk and scope.
//
// These functions import the legacy engine lazily so it doesn't affect the primary
// pack path bundle.

async function getLegacyEngine() {
  const [
    { ProfilingEngine },
    { personalTiers, essentialTiers },
  ] = await Promise.all([
    import("@meport/core/engine"),
    import("../../data/questions.js"),
  ]);
  return { ProfilingEngine, personalTiers, essentialTiers };
}

// Legacy engine instance for deepen modes
let legacyEngine: any = null;
let legacyMode = $state(false); // true when using legacy engine for deepening

export async function initDeepening(existingProfile: PersonaProfile) {
  profilingMode = "full";
  legacyMode = true;
  packEngine = null;
  packGenerator = null;
  currentEvent = null;

  const { ProfilingEngine, personalTiers } = await getLegacyEngine();
  const skipDims = new Set(Object.keys(existingProfile.explicit));
  legacyEngine = new ProfilingEngine(personalTiers, skipDims, existingProfile.explicit);
  currentEvent = legacyEngine.getNextQuestion();
  answeredCount = Object.keys(existingProfile.explicit).length;
  currentQuestionNumber = 0;
  isComplete = false;
  profile = null;
  aiMode = false;

  const allMainQs = personalTiers.reduce(
    (sum: number, tier: any) => sum + tier.questions.filter((q: any) => !q.is_followup).length,
    0
  );
  totalQuestions = Math.max(0, allMainQs - skipDims.size);

  browserSignals = detectBrowserSignals();
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
    const client = createAIClient({
      provider: provider as "claude" | "openai" | "ollama",
      apiKey,
    });
    aiEnricher = new AIEnricher(client, getLocale());
  } else {
    aiEnricher = null;
  }
}

/** Legacy submitAnswer for deepen modes */
export async function submitAnswerLegacy(questionId: string, value: any, skipped = false) {
  if (!legacyEngine) return;

  animating = true;
  await new Promise(r => setTimeout(r, 250));

  legacyEngine.submitAnswer(questionId, { value, skipped });
  if (!skipped) answeredCount++;
  currentQuestionNumber++;
  saveSessionState();

  answersSinceLastEnrich++;
  if (answersSinceLastEnrich >= 3 && aiEnricher && !aiEnriching) {
    answersSinceLastEnrich = 0;
    void backgroundEnrichLegacy();
  }

  advanceLegacy();

  await new Promise(r => setTimeout(r, 50));
  animating = false;
}

export async function advanceEventLegacy() {
  if (!legacyEngine) return;
  animating = true;
  await new Promise(r => setTimeout(r, 250));
  advanceLegacy();
  await new Promise(r => setTimeout(r, 50));
  animating = false;
}

function advanceLegacy() {
  if (!legacyEngine) return;
  let next = legacyEngine.getNextQuestion();

  if ((profilingMode === "ai" || profilingMode === "essential") && next?.type === "tier_complete") {
    next = legacyEngine.getNextQuestion();
  }

  while (next && (next.type === "question" || next.type === "follow_up")) {
    const dim = (next.question as any).dimension;
    if (dim && accumulatedInferred[dim]?.confidence >= 0.7) {
      legacyEngine.submitAnswer(next.question.id, { value: "", skipped: true });
      currentQuestionNumber++;
      next = legacyEngine.getNextQuestion();
      continue;
    }
    break;
  }

  if (next === null) {
    currentEvent = null;
    if (aiEnricher) {
      const p = legacyEngine.buildCurrentProfile();
      void startFollowUpPhase(p);
    } else {
      void finalizeLegacyProfile();
    }
  } else {
    // Map legacy EngineEvent to a compatible shape for the screen.
    // Legacy events: { type: "question"|"follow_up"|"tier_start"|"tier_complete", question }
    // The screen checks event?.type so we pass through as-is.
    currentEvent = next as any;
  }
}

async function backgroundEnrichLegacy() {
  if (!legacyEngine || !aiEnricher || aiEnriching) return;
  aiEnriching = true;
  try {
    const p = legacyEngine.buildCurrentProfile();
    const enrichSignals = { ...browserSignals };
    if (fileScanText) enrichSignals["_file_scan"] = fileScanText;
    const result = await aiEnricher.enrichBatch(p.explicit, enrichSignals, accumulatedInferred);
    accumulatedInferred = { ...accumulatedInferred, ...result.inferred };
    if (result.exportRules.length > 0) {
      accumulatedExportRules = mergeExportRules(accumulatedExportRules, result.exportRules);
    }
  } catch {
    // Silent
  } finally {
    aiEnriching = false;
  }
}

async function finalizeLegacyProfile() {
  if (!legacyEngine) return;
  const builtProfile = legacyEngine.buildCurrentProfile();
  await finalizePackProfile(builtProfile);
}

export async function finishEarlyLegacy(): Promise<PersonaProfile | null> {
  if (!legacyEngine) return null;
  currentEvent = null;
  inFollowUpPhase = false;
  inSummaryPhase = false;
  const p = legacyEngine.buildCurrentProfile();
  await finalizePackProfile(p);
  return profile;
}

// High-signal questions for smart deepen — unchanged from original
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

export async function initSmartDeepen(existingProfile: PersonaProfile) {
  const skipDims = new Set(Object.keys(existingProfile.explicit));
  const { ProfilingEngine, personalTiers } = await getLegacyEngine();

  const allQ = personalTiers.flatMap((tier: any) => tier.questions);

  const catFilled: Record<string, number> = {};
  for (const key of Object.keys(existingProfile.explicit)) {
    const cat = key.split(".")[0];
    catFilled[cat] = (catFilled[cat] || 0) + 1;
  }

  const candidates: { q: any; catFill: number }[] = [];
  for (const [cat, ids] of Object.entries(highSignalQuestions)) {
    for (const id of ids) {
      const q = allQ.find((qq: any) => qq.id === id);
      if (!q) continue;
      const dim = (q as any).dimension;
      if (dim && skipDims.has(dim)) continue;
      if ((q as any).options?.length) {
        const optDims = (q as any).options.map((o: any) => o.maps_to?.dimension).filter(Boolean);
        if (optDims.length > 0 && optDims.every((d: string) => skipDims.has(d))) continue;
      }
      candidates.push({ q, catFill: catFilled[cat] || 0 });
    }
  }

  candidates.sort((a, b) => a.catFill - b.catFill);
  const picked = candidates.slice(0, 7).map(c => c.q);
  const pickedIds = new Set(picked.map((q: any) => q.id));
  const followUps = allQ.filter(
    (q: any) => q.is_followup && q.parent_question && pickedIds.has(q.parent_question)
  );

  const smartTier = {
    tier: 0,
    tier_name: "Smart deepen",
    tier_intro: "",
    tier_complete: { headline: "", body: "" },
    questions: [...picked, ...followUps],
  };

  profilingMode = "essential";
  legacyMode = true;
  packEngine = null;
  packGenerator = null;
  cachedBrowserCtx = null;
  legacyEngine = new ProfilingEngine([smartTier as any], skipDims, existingProfile.explicit);
  currentEvent = legacyEngine.getNextQuestion();

  if (currentEvent?.type === "tier_start") {
    currentEvent = legacyEngine.getNextQuestion();
  }

  answeredCount = Object.keys(existingProfile.explicit).length;
  currentQuestionNumber = 0;
  isComplete = false;
  profile = null;
  totalQuestions = picked.length + followUps.length;

  browserSignals = detectBrowserSignals();
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
    const client = createAIClient({
      provider: provider as "claude" | "openai" | "ollama",
      apiKey,
    });
    aiEnricher = new AIEnricher(client, getLocale());
  } else {
    aiEnricher = null;
  }
}

export async function initCategoryDeepening(existingProfile: PersonaProfile, categoryId: string) {
  const tierIdx = categoryTierIndex[categoryId];
  if (tierIdx === undefined) {
    await initDeepening(existingProfile);
    return;
  }

  const { ProfilingEngine, personalTiers } = await getLegacyEngine();
  const targetTiers = [personalTiers[tierIdx]];
  const skipDims = new Set(Object.keys(existingProfile.explicit));

  profilingMode = "full";
  legacyMode = true;
  packEngine = null;
  packGenerator = null;
  legacyEngine = new ProfilingEngine(targetTiers, skipDims, existingProfile.explicit);
  currentEvent = legacyEngine.getNextQuestion();
  answeredCount = Object.keys(existingProfile.explicit).length;
  currentQuestionNumber = 0;
  isComplete = false;
  profile = null;
  aiMode = false;

  const mainQs = targetTiers[0].questions.filter((q: any) => !q.is_followup);
  const unskipped = mainQs.filter((q: any) => {
    const dim = q.dimension;
    return !dim || !skipDims.has(dim);
  });
  totalQuestions = unskipped.length;

  browserSignals = detectBrowserSignals();
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
    const client = createAIClient({
      provider: provider as "claude" | "openai" | "ollama",
      apiKey,
    });
    aiEnricher = new AIEnricher(client, getLocale());
  } else {
    aiEnricher = null;
  }
}

// ─── AI Interview mode ──────────────────────────────────────
// Kept unchanged — purely additive mode on top of pack profiling.

export async function startAIInterview() {
  const apiKey = getApiKey();
  if (!apiKey) return;

  const client = createAIClient({
    provider: getApiProvider() as "claude" | "openai" | "ollama",
    apiKey,
  });
  aiInterviewer = new AIInterviewer(client, getLocale());
  aiMode = true;
  aiMessages = [];
  aiLoading = true;
  aiDepth = 0;
  aiPhaseLabel = "";
  aiStreamingText = "";
  aiOptions = [];

  try {
    const round = await aiInterviewer.start(browserSignals);
    aiMessages = [{ role: "assistant", content: round.message }];
    aiOptions = round.options ?? [];
    aiPhaseLabel = round.phase ?? "";
  } catch (err) {
    const msg = (err as any)?.message ?? String(err);
    aiMessages = [{ role: "assistant", content: `Error: ${msg}` }];
  } finally {
    aiLoading = false;
  }
}

export async function sendAIMessage(userMessage: string) {
  if (!aiInterviewer || aiLoading) return;

  aiMessages = [...aiMessages, { role: "user", content: userMessage }];
  aiLoading = true;
  aiStreamingText = "";
  aiOptions = [];

  try {
    let round: InterviewRound;
    if (aiInterviewer.supportsStreaming?.()) {
      let buffer = "";
      round = await aiInterviewer.sendStreaming(userMessage, (chunk: string) => {
        buffer += chunk;
        aiStreamingText = buffer;
      });
    } else {
      round = await aiInterviewer.send(userMessage);
    }

    aiMessages = [...aiMessages, { role: "assistant", content: round.message }];
    aiOptions = round.options ?? [];
    aiPhaseLabel = round.phase ?? "";
    aiDepth++;
    aiStreamingText = "";

    if (round.done) {
      const p = await aiInterviewer.finalize();
      if (p) {
        profile = p;
        isComplete = true;
      }
    }
  } catch (err) {
    const msg = (err as any)?.message ?? String(err);
    aiMessages = [...aiMessages, { role: "assistant", content: `Error: ${msg}` }];
  } finally {
    aiLoading = false;
  }
}

export function finishAIEarly(): PersonaProfile | null {
  if (!aiInterviewer) return null;
  const p = aiInterviewer.getPartialProfile?.() ?? null;
  if (p) {
    profile = p;
    isComplete = true;
  }
  return p;
}

// ─── Session persistence ─────────────────────────────────────

interface ProfilingSessionState {
  answeredCount: number;
  mode: "quick" | "full" | "ai" | "essential";
  savedAt: number;
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

// ─── Helpers ─────────────────────────────────────────────────

function mergeExportRules(existing: string[], incoming: string[]): string[] {
  const result = [...existing];
  for (const rule of incoming) {
    const normalized = rule.toLowerCase().trim();
    const isDupe = result.some(r => r.toLowerCase().trim() === normalized);
    if (!isDupe) result.push(rule);
  }
  return result;
}
