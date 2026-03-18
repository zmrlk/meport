/**
 * Tauri Bridge — wraps Tauri invoke calls with fallbacks for web mode.
 * When running in browser (dev/web), falls back to browser APIs.
 * When running in Tauri (desktop), uses native filesystem/clipboard.
 */

const IS_TAURI = typeof window !== "undefined" && "__TAURI__" in window;

// ─── Filesystem ──────────────────────────────────────────

export async function readFile(path: string): Promise<string> {
  if (IS_TAURI) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("read_file", { path });
  }
  throw new Error("File reading not available in browser mode");
}

export async function writeFile(path: string, content: string): Promise<void> {
  if (IS_TAURI) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_file", { path, content });
    return;
  }
  throw new Error("File writing not available in browser mode");
}

export async function fileExists(path: string): Promise<boolean> {
  if (IS_TAURI) {
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
  if (IS_TAURI) {
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
  if (IS_TAURI) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<DiscoveredFile[]>("discover_ai_configs", { baseDir });
  }
  throw new Error("Discover not available in browser mode");
}

// ─── Clipboard ───────────────────────────────────────────

export async function copyToClipboard(text: string): Promise<boolean> {
  if (IS_TAURI) {
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
  if (IS_TAURI) {
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
  if (IS_TAURI) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    return save({ defaultPath: defaultName }) as Promise<string | null>;
  }
  return null;
}

// ─── Paths ───────────────────────────────────────────────

export async function getHomeDir(): Promise<string> {
  if (IS_TAURI) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("get_home_dir");
  }
  return "~";
}

export async function getCwd(): Promise<string> {
  if (IS_TAURI) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("get_cwd");
  }
  return ".";
}

// ─── Utils ───────────────────────────────────────────────

export function isTauri(): boolean {
  return IS_TAURI;
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
