/**
 * App-level state — screen navigation + profile + settings.
 */
import type { PersonaProfile, ProfileChangeEntry, ProfileDimensionChange } from "@meport/core/types";
import { convertV1toV2 } from "@meport/core/converter"; // only for v1→v2 migration in loadProfile
import type { MeportProfile } from "@meport/core/standard";

export type Screen = "home" | "profiling" | "profile" | "export" | "demo" | "settings" | "onboarding";

// Start on onboarding if first time
const isFirstRun = !localStorage.getItem("meport:onboarded");
let screen = $state<Screen>(isFirstRun ? "onboarding" : "home");
let transitioning = $state(false);

// ─── Profile persistence (MeportProfile v2 standard) ───
function loadProfile(): MeportProfile | null {
  try {
    const raw = localStorage.getItem("meport:profile");
    if (!raw) return null;
    const p = JSON.parse(raw);
    // Already v2 — but must also have v1 compatibility fields (.explicit)
    if (p.$schema || p["@type"] === "MeportProfile") {
      if (p.explicit) return p as MeportProfile; // merged format — OK
      // Pure v2 without v1 fields — can't display, clear and re-profile
      console.warn("[meport] Found pure v2 profile without v1 fields, clearing");
      localStorage.removeItem("meport:profile");
      return null;
    }
    // v1 → convert to v2, keep v1 fields for compatibility
    if (p.explicit) {
      try {
        const v2 = convertV1toV2(p as PersonaProfile, { includeRules: true, includeIntelligence: true });
        const merged = { ...v2, ...p }; // v2 fields + v1 fields
        localStorage.setItem("meport:profile", JSON.stringify(merged));
        return merged as MeportProfile;
      } catch {
        return p as any; // fallback: return v1 as-is
      }
    }
    return null;
  } catch { return null; }
}

/** Compare two profiles and return list of dimension changes */
export function diffProfiles(before: PersonaProfile | null, after: PersonaProfile): ProfileDimensionChange[] {
  const changes: ProfileDimensionChange[] = [];
  const beforeExplicit = before?.explicit ?? {};
  const beforeInferred = before?.inferred ?? {};

  // Check added/modified explicit
  for (const [k, v] of Object.entries(after.explicit)) {
    const oldVal = beforeExplicit[k]?.value ?? beforeInferred[k]?.value;
    const newVal = v.value;
    if (!oldVal) {
      changes.push({ dimension: k, action: "added", new_value: newVal });
    } else if (String(oldVal) !== String(newVal)) {
      changes.push({ dimension: k, action: "modified", old_value: oldVal, new_value: newVal });
    }
  }
  // Check added/modified inferred
  for (const [k, v] of Object.entries(after.inferred)) {
    if (after.explicit[k]) continue; // already handled
    const oldVal = beforeInferred[k]?.value ?? beforeExplicit[k]?.value;
    if (!oldVal) {
      changes.push({ dimension: k, action: "added", new_value: v.value });
    } else if (String(oldVal) !== String(v.value)) {
      changes.push({ dimension: k, action: "modified", old_value: oldVal, new_value: v.value });
    }
  }
  // Check removed
  for (const k of Object.keys(beforeExplicit)) {
    if (!after.explicit[k] && !after.inferred[k]) {
      changes.push({ dimension: k, action: "removed", old_value: beforeExplicit[k].value, new_value: "" });
    }
  }
  return changes;
}

let profile = $state<MeportProfile | null>(loadProfile());

export type AIProvider = "claude" | "openai" | "gemini" | "grok" | "openrouter" | "ollama";

// ─── Settings ───
// Read API key: prefer sessionStorage (safe), fallback localStorage (legacy), then migrate
const _lsKey = localStorage.getItem("meport:apiKey");
const _ssKey = sessionStorage.getItem("meport:apiKey");
let apiKey = $state(_ssKey || _lsKey || "");
// Immediately migrate localStorage → sessionStorage in web context
if (_lsKey && !_ssKey) {
  sessionStorage.setItem("meport:apiKey", _lsKey);
  localStorage.removeItem("meport:apiKey");
}

// On Tauri: migrate API key from localStorage/sessionStorage to secure storage
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

export function setProfile(p: MeportProfile | PersonaProfile, opts?: { skipHistory?: boolean; changeEntry?: ProfileChangeEntry }) {
  // Auto-convert v1 → v2 if needed, BUT keep v1 fields for screen compatibility
  if ("explicit" in p && !("$schema" in p)) {
    try {
      const v2 = convertV1toV2(p as PersonaProfile, { includeRules: true, includeIntelligence: true });
      // Merge: v2 fields + v1 compatibility fields (explicit, inferred, synthesis, etc.)
      p = { ...v2, ...(p as any) } as any;
    } catch (e) {
      console.error("[meport] v1→v2 conversion failed:", e);
    }
  }
  // Append change entry to profile's changeHistory
  if (opts?.changeEntry) {
    if (!p.changeHistory) p.changeHistory = [];
    p.changeHistory.push(opts.changeEntry);
    if (p.changeHistory.length > 50) p.changeHistory.splice(0, p.changeHistory.length - 50);
  }
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
    // Fallback: sessionStorage (cleared on tab close, safer than localStorage)
    sessionStorage.setItem("meport:apiKey", key);
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
