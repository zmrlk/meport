/**
 * App-level state — screen navigation + profile + settings.
 */
import type { PersonaProfile } from "@meport/core/types";

export type Screen = "home" | "profiling" | "reveal" | "profile" | "export" | "settings" | "card" | "report" | "demo" | "history" | "feedback";

let screen = $state<Screen>("home");
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
let apiProvider = $state<AIProvider>(
  (localStorage.getItem("meport:apiProvider") as AIProvider) || "claude"
);
let ollamaUrl = $state(localStorage.getItem("meport:ollamaUrl") || "http://localhost:11434");

// ─── Getters ───
export function getScreen() { return screen; }
export function getProfile() { return profile; }
export function isTransitioning() { return transitioning; }
export function getApiKey() { return apiKey; }
export function getApiProvider() { return apiProvider; }
export function getOllamaUrl() { return ollamaUrl; }
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
export function setProfile(p: PersonaProfile) {
  profile = p;
  localStorage.setItem("meport:profile", JSON.stringify(p));
  // Save history snapshot (max 20, FIFO)
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
  } catch { /* non-critical */ }
}

export function clearProfile() {
  profile = null;
  localStorage.removeItem("meport:profile");
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
export function setApiKey(key: string) {
  apiKey = key;
  localStorage.setItem("meport:apiKey", key);
}

export function setApiProvider(provider: AIProvider) {
  apiProvider = provider;
  localStorage.setItem("meport:apiProvider", provider);
}

export function setOllamaUrl(url: string) {
  ollamaUrl = url;
  localStorage.setItem("meport:ollamaUrl", url);
}
