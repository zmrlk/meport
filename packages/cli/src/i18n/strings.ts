// NOTE: This file is currently unused. All i18n is done via inline pl ternaries.
// Kept as reference for future centralization.

/**
 * CLI UI Strings — i18n support
 *
 * All user-facing CLI text. Export rules stay English (they go into exports).
 * IDs, dimensions, maps_to values stay English.
 */

export interface UIStrings {
  // Profile command
  scanningSystem: string;
  detectingDimensions: string;
  dimensionsDetected: (count: number) => string;
  loadingPack: string;
  selectPacks: string;
  profilingComplete: string;
  savingProfile: string;
  profileSaved: (path: string) => string;
  autoExporting: string;
  exportedTo: (count: number) => string;
  allExportsSaved: (dir: string) => string;
  skipLabel: string;
  confirmKeep: string;
  confirmChange: string;
  confirmDetected: (source: string) => string;
  questionCounter: (current: number, total: number) => string;
  packProgress: (pack: string, current: number, total: number) => string;

  // Export command
  generatingExports: string;
  exportedPlatforms: (count: number) => string;
  availableTargets: string;
  ruleBased: string;
  legacy: string;
  usage: string;

  // Sync command
  syncingPlatforms: string;
  synced: (count: number) => string;
  copiedToClipboard: (platform: string) => string;
  noPlatformsToSync: string;

  // Update command
  quickTuneUp: string;
  profileAge: (days: number) => string;
  noChanges: string;
  profileUpdated: string;
  reSyncing: string;
  reSynced: (count: number) => string;
  addAntiPatterns: string;
  allAntiPatternsSelected: string;
  keepCurrent: string;
  namePrompt: (name: string) => string;

  // Freshness
  profileStale: (days: number) => string;

  // Errors
  profileNotFound: (path: string) => string;
  runProfileFirst: string;
  errorMessage: string;

  // General
  done: string;
  howToApply: string;
}

const en: UIStrings = {
  scanningSystem: "Scanning your system...",
  detectingDimensions: "Detecting dimensions...",
  dimensionsDetected: (n) => `Detected ${n} dimensions from your system`,
  loadingPack: "Loading packs...",
  selectPacks: "Select packs to include:",
  profilingComplete: "Profiling complete!",
  savingProfile: "Saving profile...",
  profileSaved: (p) => `Profile saved to ${p}`,
  autoExporting: "Auto-exporting...",
  exportedTo: (n) => `Exported to ${n} platforms`,
  allExportsSaved: (d) => `All exports saved to ${d}/`,
  skipLabel: "Skip",
  confirmKeep: "Keep",
  confirmChange: "Change",
  confirmDetected: (s) => `Detected from ${s}`,
  questionCounter: (c, t) => `[${c}/${t}]`,
  packProgress: (p, c, t) => `${p} — ${c}/${t}`,

  generatingExports: "Generating rule-based exports...",
  exportedPlatforms: (n) => `Exported to ${n} platforms`,
  availableTargets: "Available export targets:",
  ruleBased: "Rule-based (recommended):",
  legacy: "Legacy (description-based):",
  usage: "Usage:",

  syncingPlatforms: "Syncing to platforms...",
  synced: (n) => `Synced ${n} platform${n > 1 ? "s" : ""}`,
  copiedToClipboard: (p) => `${p} export copied to clipboard`,
  noPlatformsToSync: "No file-based platforms to sync",

  quickTuneUp: "Quick Tune-up",
  profileAge: (d) => `Profile last updated ${d} day${d !== 1 ? "s" : ""} ago`,
  noChanges: "No changes — profile is up to date.",
  profileUpdated: "Profile updated",
  reSyncing: "Re-syncing exports...",
  reSynced: (n) => `Re-synced ${n} platform${n > 1 ? "s" : ""}`,
  addAntiPatterns: "Add anti-patterns?",
  allAntiPatternsSelected: "All anti-patterns already selected.",
  keepCurrent: "(keep)",
  namePrompt: (n) => `Name: ${n}`,

  profileStale: (d) => `Profile is ${d} days old. Run meport update for a tune-up.`,

  profileNotFound: (p) => `Could not read profile from ${p}`,
  runProfileFirst: "Run meport profile first to create one.",
  errorMessage: "Error",

  done: "Done!",
  howToApply: "How to apply:",
};

const pl: UIStrings = {
  scanningSystem: "Skanowanie systemu...",
  detectingDimensions: "Wykrywanie wymiarów...",
  dimensionsDetected: (n) => `Wykryto ${n} wymiarów z Twojego systemu`,
  loadingPack: "Ładowanie pakietów...",
  selectPacks: "Wybierz pakiety do uwzględnienia:",
  profilingComplete: "Profilowanie zakończone!",
  savingProfile: "Zapisywanie profilu...",
  profileSaved: (p) => `Profil zapisany do ${p}`,
  autoExporting: "Auto-eksport...",
  exportedTo: (n) => `Wyeksportowano na ${n} platform`,
  allExportsSaved: (d) => `Wszystkie eksporty zapisane do ${d}/`,
  skipLabel: "Pomiń",
  confirmKeep: "Zachowaj",
  confirmChange: "Zmień",
  confirmDetected: (s) => `Wykryte z ${s}`,
  questionCounter: (c, t) => `[${c}/${t}]`,
  packProgress: (p, c, t) => `${p} — ${c}/${t}`,

  generatingExports: "Generowanie eksportów opartych na regułach...",
  exportedPlatforms: (n) => `Wyeksportowano na ${n} platform`,
  availableTargets: "Dostępne cele eksportu:",
  ruleBased: "Oparte na regułach (zalecane):",
  legacy: "Starsze (oparte na opisach):",
  usage: "Użycie:",

  syncingPlatforms: "Synchronizacja z platformami...",
  synced: (n) => `Zsynchronizowano ${n} platform${n > 1 ? "y" : "ę"}`,
  copiedToClipboard: (p) => `Eksport ${p} skopiowany do schowka`,
  noPlatformsToSync: "Brak platform plikowych do synchronizacji",

  quickTuneUp: "Szybkie strojenie",
  profileAge: (d) => `Profil ostatnio aktualizowany ${d} dni temu`,
  noChanges: "Brak zmian — profil jest aktualny.",
  profileUpdated: "Profil zaktualizowany",
  reSyncing: "Ponowna synchronizacja eksportów...",
  reSynced: (n) => `Ponownie zsynchronizowano ${n} platform${n > 1 ? "y" : "ę"}`,
  addAntiPatterns: "Dodać anty-wzorce?",
  allAntiPatternsSelected: "Wszystkie anty-wzorce już wybrane.",
  keepCurrent: "(zachowaj)",
  namePrompt: (n) => `Imię: ${n}`,

  profileStale: (d) => `Profil ma ${d} dni. Uruchom meport update żeby go odświeżyć.`,

  profileNotFound: (p) => `Nie można odczytać profilu z ${p}`,
  runProfileFirst: "Najpierw uruchom meport profile żeby go utworzyć.",
  errorMessage: "Błąd",

  done: "Gotowe!",
  howToApply: "Jak zastosować:",
};

const STRINGS: Record<string, UIStrings> = { en, pl };

/**
 * Get UI strings for a given locale. Falls back to English.
 */
export function getStrings(locale: string = "en"): UIStrings {
  return STRINGS[locale] ?? STRINGS.en;
}
