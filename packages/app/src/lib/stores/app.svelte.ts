/**
 * App-level state — screen navigation + profile + settings.
 */
import type { PersonaProfile } from "@meport/core/types";

export type Screen = "home" | "profiling" | "profile" | "export" | "demo" | "settings" | "onboarding";

// Start on onboarding if first time
const isFirstRun = !localStorage.getItem("meport:onboarded");
let screen = $state<Screen>(isFirstRun ? "onboarding" : "home");
let transitioning = $state(false);

// ─── Profile persistence ───
function loadProfile(): PersonaProfile | null {
  try {
    const raw = localStorage.getItem("meport:profile");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

let profile = $state<PersonaProfile | null>(loadProfile());

export type AIProvider = "claude" | "openai" | "gemini" | "grok" | "openrouter" | "ollama";

// ─── Settings ───
let apiKey = $state(localStorage.getItem("meport:apiKey") || "");

// On Tauri: migrate API key from localStorage to secure storage, then load from secure
(async () => {
  try {
    const { readSecret, storeSecret, isTauri } = await import("../tauri-bridge.js");
    if (!isTauri()) return;
    const secureKey = await readSecret("apiKey");
    if (secureKey) {
      apiKey = secureKey;
      localStorage.removeItem("meport:apiKey"); // Clean up plain storage
    } else if (apiKey) {
      // Migrate: move existing key from localStorage to secure
      await storeSecret("apiKey", apiKey);
      localStorage.removeItem("meport:apiKey");
    }
  } catch {}
})();
let apiProvider = $state<AIProvider>(
  (localStorage.getItem("meport:apiProvider") as AIProvider) || "claude"
);
let ollamaUrl = $state(localStorage.getItem("meport:ollamaUrl") || "http://localhost:11434");
let aiModel = $state(localStorage.getItem("meport:aiModel") || "");

// ─── Getters ───
export function getScreen() { return screen; }
export function getProfile() { return profile; }
export function isTransitioning() { return transitioning; }
export function getApiKey() { return apiKey; }
export function getApiProvider() { return apiProvider; }
export function getOllamaUrl() { return ollamaUrl; }
export function getAiModel() { return aiModel; }
export function hasApiKey() { return apiProvider === "ollama" || apiKey.length > 10; }
export function hasProfile() { return profile !== null; }

// ─── Navigation ───
export async function goTo(next: Screen) {
  if (next === screen) return;
  transitioning = true;
  await new Promise(r => setTimeout(r, 250));
  screen = next;
  await new Promise(r => setTimeout(r, 50));
  transitioning = false;
}

// ─── Profile ───
let lastSnapshotTime = 0;
const SNAPSHOT_MIN_INTERVAL = 30_000; // 30 seconds

export function setProfile(p: PersonaProfile, opts?: { skipHistory?: boolean }) {
  profile = p;
  localStorage.setItem("meport:profile", JSON.stringify(p));
  // Save history snapshot (max 20, FIFO) — throttled to avoid flooding
  if (!opts?.skipHistory) {
    const now = Date.now();
    if (now - lastSnapshotTime > SNAPSHOT_MIN_INTERVAL) {
      try {
        const raw = localStorage.getItem("meport:history");
        const history: { date: string; completeness: number; dimensionCount: number; snapshot: PersonaProfile }[] = raw ? JSON.parse(raw) : [];
        history.push({
          date: new Date().toISOString(),
          completeness: p.completeness,
          dimensionCount: Object.keys(p.explicit).length + Object.keys(p.inferred).length,
          snapshot: p,
        });
        if (history.length > 20) history.splice(0, history.length - 20);
        localStorage.setItem("meport:history", JSON.stringify(history));
        lastSnapshotTime = now;
      } catch { /* non-critical */ }
    }
  }
}

export function clearProfile() {
  profile = null;
  localStorage.removeItem("meport:profile");
  localStorage.removeItem("meport:history");
}

/** Import a profile from a JSON file (e.g. from CLI export) */
export function importProfile(json: string): boolean {
  try {
    const p = JSON.parse(json) as PersonaProfile;
    if (!p.explicit || !p.meta) return false;
    setProfile(p);
    return true;
  } catch { return false; }
}

// ─── Settings ───
export async function setApiKey(key: string) {
  apiKey = key;
  // Try secure storage first (Tauri), fallback to localStorage (web)
  try {
    const { storeSecret } = await import("../tauri-bridge.js");
    await storeSecret("apiKey", key);
    localStorage.removeItem("meport:apiKey"); // Clean up old plain storage
  } catch {
    localStorage.setItem("meport:apiKey", key);
  }
}

export function setApiProvider(provider: AIProvider) {
  apiProvider = provider;
  localStorage.setItem("meport:apiProvider", provider);
}

export function setOllamaUrl(url: string) {
  ollamaUrl = url;
  localStorage.setItem("meport:ollamaUrl", url);
}

export function setAiModel(m: string) {
  aiModel = m;
  if (m) {
    localStorage.setItem("meport:aiModel", m);
  } else {
    localStorage.removeItem("meport:aiModel");
  }
}
