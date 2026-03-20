/**
 * Tauri Bridge — wraps Tauri invoke calls with fallbacks for web mode.
 * When running in browser (dev/web), falls back to browser APIs.
 * When running in Tauri (desktop), uses native filesystem/clipboard.
 */

// Runtime check — NOT a constant. Tauri injects __TAURI__ via script tag,
// which may run AFTER module evaluation. Must check at call time.
function checkTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

// ─── Secure Storage (Tauri only) ────────────────────────────

export async function storeSecret(key: string, value: string): Promise<void> {
  if (checkTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("store_secret", { key, value });
  }
}

export async function readSecret(key: string): Promise<string> {
  if (checkTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("read_secret", { key });
  }
  return "";
}

// ─── Filesystem (scoped) ──────────────────────────────────

export async function fileExists(path: string): Promise<boolean> {
  if (checkTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<boolean>("file_exists", { path });
  }
  return false;
}

// ─── Deploy ──────────────────────────────────────────────

export interface DeployResult {
  status: "new" | "merged" | "updated";
}

export async function deployToFile(path: string, content: string): Promise<DeployResult> {
  if (checkTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const status = await invoke<string>("deploy_to_file", { path, content });
    return { status: status as DeployResult["status"] };
  }
  throw new Error("Deploy not available in browser mode — use Download instead");
}

// ─── Discover ────────────────────────────────────────────

export interface DiscoveredFile {
  path: string;
  filename: string;
  platform: string;
  size: number;
}

export async function discoverAIConfigs(baseDir: string): Promise<DiscoveredFile[]> {
  if (checkTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<DiscoveredFile[]>("discover_ai_configs", { baseDir });
  }
  throw new Error("Discover not available in browser mode");
}

// ─── Clipboard ───────────────────────────────────────────

export async function copyToClipboard(text: string): Promise<boolean> {
  if (checkTauri()) {
    try {
      const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
      await writeText(text);
      return true;
    } catch {
      // Fallback to browser API
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ─── Dialog ──────────────────────────────────────────────

export async function pickFolder(): Promise<string | null> {
  if (checkTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const result = await open({ directory: true, multiple: false });
    return result as string | null;
  }
  // Browser fallback — use showDirectoryPicker if available
  if ("showDirectoryPicker" in window) {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: "read" });
      return handle.name; // Can't get full path in browser
    } catch {
      return null;
    }
  }
  return null;
}

export async function pickSaveFile(defaultName: string): Promise<string | null> {
  if (checkTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    return save({ defaultPath: defaultName }) as Promise<string | null>;
  }
  return null;
}

// ─── Paths ───────────────────────────────────────────────

export async function getHomeDir(): Promise<string> {
  if (checkTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("get_home_dir");
  }
  return "~";
}

export async function getCwd(): Promise<string> {
  if (checkTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("get_cwd");
  }
  return ".";
}

// ─── System Scan ────────────────────────────────────────

export interface SystemScanResult {
  categories: Record<string, string[]>;
  total_scanned: number;
  privacy_filtered: number;
  username: string | null;
}

export async function scanSystem(areas: string[]): Promise<SystemScanResult> {
  if (checkTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<SystemScanResult>("scan_system", { request: { areas } });
  }
  throw new Error("System scan not available in browser mode");
}

// ─── Utils ───────────────────────────────────────────────

export function isTauri(): boolean {
  return checkTauri();
}

/** Download a file in browser mode (fallback when Tauri not available) */
export function downloadFile(filename: string, content: string, mimeType = "text/plain"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
