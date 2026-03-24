/**
 * @meport/core — Meport Engine
 *
 * The vCard for AI — deep personalization profiles,
 * portable across 20+ platforms.
 *
 * Three layers: Explicit → Inferred → Emergent
 * Works fully offline (Layers 1+2). Layer 3 optional (needs AI key).
 */

// Schema & Types
export type {
  PersonaProfile,
  DimensionValue,
  InferredValue,
  CompoundValue,
  Contradiction,
  EmergentObservation,
  ProfileMeta,
  QuestionTier,
  Question,
  QuestionOption,
  QuestionType,
  Answer,
  BehavioralSignal,
  CompoundSignalRule,
  ContradictionRule,
  ExportCompilerConfig,
  ExportResult,
  ExportableDimension,
  MatrixRow,
  MatrixColumn,
} from "./schema/types.js";

export { DIMENSION_WEIGHTS, getDimensionWeight } from "./schema/types.js";

// Profiling Engine (tier-based, legacy)
export { ProfilingEngine, type EngineEvent, type AnswerInput } from "./profiler/engine.js";

// Pack Profiling Engine (v2, full session)
export {
  PackProfilingEngine,
  type PackEngineEvent,
  type PackAnswerInput,
  type ScanContext,
  type SessionState,
} from "./profiler/pack-engine.js";

// Question Loader (tier-based, legacy)
export { loadQuestionTiers, loadTier } from "./profiler/loader.js";

// Pack Loader (pack-based, v2)
export {
  loadPack,
  loadPacks,
  loadSessionPacks,
  collectPackExportRules,
  resolveExportRule,
  getAvailablePackIds,
  type Pack,
  type PackQuestion,
  type PackOption,
  type PackId,
  type Locale,
  detectLocale,
} from "./profiler/pack-loader.js";

// Pack Validator
export {
  validatePack,
  validateTranslation,
  type ValidationError,
} from "./profiler/pack-validator.js";

// System Scanner (Phase 0) + File Scanner
export { runSystemScan, runFileScan, type FileScanOptions } from "./profiler/scanner.js";

// AI Client (Layer 3) + Interviewer
export { createAIClient, type AIConfig, type AIClientFull, type ChatMessage } from "./ai/client.js";
export { AIInterviewer, type InterviewConfig, type InterviewRound, type ExtractedDimension } from "./ai/interviewer.js";

// Profile Recompute (canonical mutation)
export { recomputeProfile } from "./profiler/recompute.js";

// Profile Persistence
export { saveProfile, loadProfile, profileExists } from "./profiler/storage.js";

// Inference Engine
export {
  runLayer2,
  detectBehavioralSignals,
  buildBehavioralContext,
  detectCompoundSignals,
  detectContradictions,
  runLayer3,
  runPackLayer2,
  type Layer3Config,
  type BehavioralContext,
} from "./inference/index.js";

// Export Compilers (legacy, description-based)
export {
  getCompiler,
  getAvailableCompilers,
  compileAll,
  BaseCompiler,
  ChatGPTCompiler,
  ClaudeCompiler,
  ClaudeCodeCompiler,
  GenericCompiler,
  JsonCompiler,
  type PlatformId,
} from "./compiler/index.js";

// Sync
export {
  SYNC_TARGETS,
  getAutoSyncTargets,
  getClipboardTargets,
  syncToFile,
  syncToSection,
  type SyncTarget,
  type SyncResult,
} from "./sync/index.js";

// Meport Standard Format v1.0 (portable profile standard)
export type {
  MeportProfile,
  MeportIdentity,
  MeportCommunication,
  MeportAIPreferences,
  MeportCognitive,
  MeportWork,
  MeportPersonality,
  MeportNeurodivergent,
  MeportExpertise,
  MeportLifeContext,
  MeportFinancial,
  MeportInstruction,
  MeportNeverRule,
  MeportSharing,
  MeportIntelligence,
  MeportInferredValue,
  MeportCompoundValue,
  MeportContradiction,
  MeportEmergentObservation,
  MeportSynthesis,
  MeportProvenance,
  MeportSection,
  SectionMeta,
} from "./schema/standard.js";

export { computeLevel, isValidLevel0, SECTION_WEIGHTS } from "./schema/standard.js";
export { convertV1toV2, convertV2toV1, type ConvertOptions } from "./schema/converter.js";

// Meport Markdown parser & converters
export { parseMeportMd, getField, getItems, hasSection, getSectionNames, toFlatMap, classifySection } from "./schema/md-parser.js";
export type { ParsedProfile, ParsedSection, SectionClass } from "./schema/md-parser.js";
export { mdToJson } from "./schema/md-to-json.js";
export { jsonToMd, type JsonToMdOptions } from "./schema/json-to-md.js";

// AI Prompts for profile generation and export
export {
  getPrompt,
  getExportPlatforms,
  GENERATE_MEPORT_MD_ONLINE,
  GENERATE_MEPORT_MD_OFFLINE,
  EXPORT_PROMPTS,
  REFINE_PROFILE_ONLINE,
  REFINE_PROFILE_OFFLINE,
  IMPORT_TO_MEPORT_ONLINE,
  IMPORT_TO_MEPORT_OFFLINE,
  type PromptType,
  type ModelTier,
} from "./ai/prompts.js";

// Rule-Based Compilers (v2, recommended)
export {
  getRuleCompiler,
  getAvailableRuleCompilers,
  compileAllRules,
  ChatGPTRuleCompiler,
  ClaudeRuleCompiler,
  CursorRuleCompiler,
  OllamaRuleCompiler,
  GeminiRuleCompiler,
  collectRules,
  formatWithContexts,
  type ExportRule,
  type RuleCompilerConfig,
} from "./compiler/index.js";
