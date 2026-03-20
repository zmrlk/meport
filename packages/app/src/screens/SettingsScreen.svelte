<script lang="ts">
  import { getApiKey, getApiProvider, getOllamaUrl, getAiModel, setApiKey, setApiProvider, setOllamaUrl, setAiModel, hasApiKey, getProfile, setProfile, clearProfile, type AIProvider } from "../lib/stores/app.svelte.js";
  import { createAIClient, listOllamaModels, type OllamaModel } from "@meport/core/client";
  import { t, getLocale, setLocale, type Locale } from "../lib/i18n.svelte.js";
  import Icon from "../components/Icon.svelte";
  import Button from "../components/Button.svelte";
  import SectionLabel from "../components/SectionLabel.svelte";

  let key = $state(getApiKey());
  let provider = $state<AIProvider>(getApiProvider());
  let ollamaUrl = $state(getOllamaUrl());
  let model = $state(getAiModel());
  let saved = $state(false);
  let showKey = $state(false);
  let testing = $state(false);
  let testResult = $state<"" | "success" | string>("");
  let connected = $derived(hasApiKey());
  let locale = $derived(getLocale());
  let backupStatus = $state<"" | "restored" | "deleted" | "error">("");

  // Ollama auto-detect
  let ollamaModels = $state<OllamaModel[]>([]);
  let ollamaLoading = $state(false);

  async function fetchOllamaModels() {
    ollamaLoading = true;
    ollamaModels = await listOllamaModels(ollamaUrl);
    if (ollamaModels.length > 0) {
      // Check if current model is in the list
      const currentInList = model && ollamaModels.some(m => m.name === model || m.name.startsWith(model + ":"));
      if (!currentInList) {
        // Auto-select the largest (most capable) model
        const sorted = [...ollamaModels].sort((a, b) => b.size - a.size);
        model = sorted[0].name;
      }
      // Persist immediately so other screens pick it up
      setAiModel(model);
    }
    ollamaLoading = false;
  }

  // Fetch models when switching to Ollama or when URL changes
  $effect(() => {
    // Reading both `provider` and `ollamaUrl` makes this effect react to either change
    const _url = ollamaUrl;
    if (provider === "ollama") {
      fetchOllamaModels();
    }
  });

  const providers: { id: AIProvider; label: string; placeholder: string; defaultModel: string }[] = [
    { id: "claude",      label: "Claude (Anthropic)", placeholder: "sk-ant-api03-...", defaultModel: "claude-sonnet-4-6-20250929" },
    { id: "openai",      label: "OpenAI",             placeholder: "sk-...",           defaultModel: "gpt-5.4" },
    { id: "gemini",      label: "Gemini (Google)",    placeholder: "AIza...",          defaultModel: "gemini-3.1-pro" },
    { id: "grok",        label: "Grok (xAI)",         placeholder: "xai-...",          defaultModel: "grok-4-fast" },
    { id: "openrouter",  label: "OpenRouter",         placeholder: "sk-or-...",        defaultModel: "anthropic/claude-sonnet-4-6-20250929" },
    { id: "ollama",      label: "Ollama (local)",     placeholder: "",                 defaultModel: "llama3.1" },
  ];

  function save() {
    setApiKey(key);
    setApiProvider(provider);
    setOllamaUrl(ollamaUrl);
    setAiModel(model);
    saved = true;
    setTimeout(() => { saved = false; }, 2000);
  }

  async function testConnection() {
    testing = true;
    testResult = "";
    try {
      const client = createAIClient({
        provider,
        apiKey: key || undefined,
        model: model || undefined,
        baseUrl: provider === "ollama" ? ollamaUrl : undefined,
      });
      await client.generate("Say 'ok' in one word.");
      testResult = "success";
    } catch (err) {
      testResult = err instanceof Error ? err.message : String(err);
    }
    testing = false;
  }

  function maskedKey(k: string) {
    if (!k || k.length < 12) return k;
    return k.slice(0, 6) + "\u2022".repeat(Math.min(k.length - 10, 20)) + k.slice(-4);
  }

  async function exportBackup() {
    const p = getProfile();
    if (!p) return;
    const json = JSON.stringify(p, null, 2);
    const filename = `meport-backup-${new Date().toISOString().slice(0, 10)}.json`;

    // Try Tauri save dialog first
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await save({ defaultPath: filename, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (path) {
        await writeTextFile(path, json);
        backupStatus = "restored"; // reuse success status
        setTimeout(() => { backupStatus = ""; }, 3000);
        return;
      }
    } catch {}

    // Fallback: blob download (web)
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importBackup(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.explicit && data.meta) {
          setProfile(data);
          backupStatus = "restored";
          setTimeout(() => { backupStatus = ""; }, 3000);
        } else {
          backupStatus = "error";
          setTimeout(() => { backupStatus = ""; }, 3000);
        }
      } catch {
        backupStatus = "error";
        setTimeout(() => { backupStatus = ""; }, 3000);
      }
    };
    reader.readAsText(file);
    // Reset input so re-importing same file works
    (e.target as HTMLInputElement).value = "";
  }

  let confirmingDelete = $state<"none" | "profile" | "all">("none");

  function deleteProfile() {
    clearProfile();
    confirmingDelete = "none";
    backupStatus = "deleted";
    setTimeout(() => { backupStatus = ""; }, 3000);
  }

  function deleteEverything() {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("meport:")) keysToRemove.push(key);
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    clearProfile();
    confirmingDelete = "none";
    window.location.reload();
  }
</script>

<div class="page">
  <div class="page-content">
    <h1 class="page-title animate-fade-up" style="--delay: 0ms">{t("settings.title")}</h1>

    <!-- Language -->
    <section class="section animate-fade-up" style="--delay: 100ms">
      <SectionLabel>{t("settings.language")}</SectionLabel>
      <div class="toggle-group">
        <button
          class="toggle-btn"
          class:active={locale === "pl"}
          onclick={() => setLocale("pl")}
        >
          PL {t("settings.lang_pl")}
        </button>
        <button
          class="toggle-btn"
          class:active={locale === "en"}
          onclick={() => setLocale("en")}
        >
          EN {t("settings.lang_en")}
        </button>
      </div>
    </section>

    <!-- AI Connection -->
    <section class="section animate-fade-up" style="--delay: 200ms">
      <div class="section-header">
        <SectionLabel>{t("settings.ai_connection")}</SectionLabel>
        <span class="status-dot" class:connected></span>
      </div>
      <p class="section-desc">{t("settings.ai_desc")}</p>

      <div class="provider-list">
        {#each providers as p}
          <button
            class="provider-row"
            class:active={provider === p.id}
            onclick={() => { provider = p.id; }}
          >
            <span class="provider-radio" class:checked={provider === p.id}></span>
            <span class="provider-label">{p.label}</span>
            {#if provider === p.id && p.id !== "ollama"}
              <span class="provider-model-hint">{p.defaultModel}</span>
            {/if}
          </button>
        {/each}
      </div>

      {#if provider === "ollama"}
        <div class="key-input-wrap">
          <input
            type="text"
            class="key-input"
            placeholder="http://localhost:11434"
            bind:value={ollamaUrl}
            onkeydown={(e) => { if (e.key === "Enter") save(); }}
          />
        </div>
        <p class="section-desc">Ollama must be running locally. No API key needed.</p>
      {:else}
        <div class="key-input-wrap">
          <input
            type={showKey ? "text" : "password"}
            class="key-input"
            placeholder={providers.find(p => p.id === provider)?.placeholder ?? ""}
            bind:value={key}
            onkeydown={(e) => { if (e.key === "Enter") save(); }}
          />
          <button class="key-toggle" onclick={() => { showKey = !showKey; }}>
            <Icon name={showKey ? "eye-off" : "eye"} size={14} />
          </button>
        </div>

        {#if connected && !saved}
          <p class="key-status">{t("settings.connected")} {maskedKey(getApiKey())}</p>
        {/if}
      {/if}

      <!-- Model override -->
      {#if provider === "ollama" && ollamaModels.length > 0}
        <div class="key-input-wrap">
          <select class="key-input" bind:value={model} onchange={save}>
            {#each ollamaModels as m}
              <option value={m.name}>{m.name} ({(m.size / 1e9).toFixed(1)} GB)</option>
            {/each}
          </select>
        </div>
        <p class="section-desc" style="margin-top: -4px">
          {ollamaModels.length} model{ollamaModels.length !== 1 ? "s" : ""} detected — meport sets 32k context per request.
          <button class="refresh-btn" onclick={fetchOllamaModels} disabled={ollamaLoading}>
            {ollamaLoading ? "..." : "Refresh"}
          </button>
        </p>
      {:else if provider === "ollama" && ollamaLoading}
        <div class="key-input-wrap">
          <div class="key-input" style="display: flex; align-items: center; gap: 8px; color: var(--color-text-muted);">
            <span class="test-spinner"></span> Detecting models...
          </div>
        </div>
      {:else}
        <div class="key-input-wrap">
          <input
            type="text"
            class="key-input"
            placeholder={providers.find(p => p.id === provider)?.defaultModel ?? "default"}
            bind:value={model}
            onkeydown={(e) => { if (e.key === "Enter") save(); }}
          />
        </div>
        <p class="section-desc" style="margin-top: -4px">
          {#if provider === "ollama"}
            No models detected — is Ollama running? <button class="refresh-btn" onclick={fetchOllamaModels}>Retry</button>
          {:else}
            Model (optional) — leave blank to use provider default
          {/if}
        </p>
      {/if}

      <!-- Test connection -->
      <div class="test-row">
        <Button variant="ghost" size="sm" onclick={testConnection} disabled={testing || (provider !== "ollama" && !key)}>
          {#if testing}
            <span class="test-spinner"></span>
          {:else}
            <Icon name="check" size={14} />
          {/if}
          Test connection
        </Button>
        {#if testResult === "success"}
          <span class="test-ok">Connected</span>
        {:else if testResult}
          <span class="test-err">{testResult}</span>
        {/if}
      </div>

      <Button variant={saved ? "primary" : "secondary"} size="md" onclick={save}>
        {#if saved}
          <Icon name="check" size={14} />
        {/if}
        {saved ? t("settings.saved") : t("settings.save_key")}
      </Button>
    </section>

    <!-- About -->
    <section class="section animate-fade-up" style="--delay: 350ms">
      <SectionLabel>{t("settings.about")}</SectionLabel>
      <div class="about-grid">
        <div class="about-item">
          <span class="about-label">Version</span>
          <span class="about-value">0.2.0</span>
        </div>
        <div class="about-item">
          <span class="about-label">License</span>
          <span class="about-value">MIT</span>
        </div>
        <div class="about-item">
          <span class="about-label">{locale === "pl" ? "Prywatno\u015B\u0107" : "Privacy"}</span>
          <span class="about-value">{t("settings.privacy")}</span>
        </div>
        <div class="about-item">
          <span class="about-label">{locale === "pl" ? "\u0179r\u00F3d\u0142o" : "Source"}</span>
          <a href="https://github.com/zmrlk/meport-cli" target="_blank" rel="noopener" class="about-link">GitHub</a>
        </div>
      </div>
    </section>

    <!-- Data -->
    <section class="section animate-fade-up" style="--delay: 500ms">
      <SectionLabel>{t("settings.data")}</SectionLabel>
      <p class="section-desc">{t("settings.data_trust")}</p>

      <div class="data-grid">
        <button class="data-action" onclick={exportBackup}>
          <Icon name="download" size={16} />
          <span class="data-action-label">{t("settings.export_backup")}</span>
        </button>

        <label class="data-action">
          <input type="file" accept=".json,application/json" class="import-input" onchange={importBackup} />
          <Icon name="upload" size={16} />
          <span class="data-action-label">{t("settings.import_backup")}</span>
        </label>

        <button class="data-action" onclick={() => { confirmingDelete = "profile"; }}>
          <Icon name="trash" size={16} />
          <span class="data-action-label">{locale === "pl" ? "Usuń profil" : "Delete profile"}</span>
        </button>

        <button class="data-action danger" onclick={() => { confirmingDelete = "all"; }}>
          <Icon name="trash" size={16} />
          <span class="data-action-label">{locale === "pl" ? "Usuń wszystko" : "Delete everything"}</span>
        </button>
      </div>

      {#if backupStatus === "restored"}
        <p class="backup-status success">{t("settings.backup_restored")}</p>
      {:else if backupStatus === "deleted"}
        <p class="backup-status success">{t("settings.deleted")}</p>
      {:else if backupStatus === "error"}
        <p class="backup-status error">{t("settings.backup_error")}</p>
      {/if}

      {#if confirmingDelete !== "none"}
        <div class="confirm-card animate-fade-up">
          {#if confirmingDelete === "profile"}
            <p class="confirm-text">{locale === "pl" ? "Usunąć profil? Ustawienia AI zostają." : "Delete profile? AI settings stay."}</p>
            <div class="confirm-actions">
              <button class="confirm-btn danger" onclick={deleteProfile}>
                {locale === "pl" ? "Tak, usuń" : "Yes, delete"}
              </button>
              <button class="confirm-btn" onclick={() => { confirmingDelete = "none"; }}>
                {locale === "pl" ? "Anuluj" : "Cancel"}
              </button>
            </div>
          {:else}
            <p class="confirm-text">{locale === "pl" ? "Trwale usunąć WSZYSTKO? Profil, historia, ustawienia AI, klucze — nieodwracalne." : "Permanently delete EVERYTHING? Profile, history, AI settings, keys — irreversible."}</p>
            <div class="confirm-actions">
              <button class="confirm-btn danger" onclick={deleteEverything}>
                {locale === "pl" ? "Tak, usuń wszystko" : "Yes, delete everything"}
              </button>
              <button class="confirm-btn" onclick={() => { confirmingDelete = "none"; }}>
                {locale === "pl" ? "Anuluj" : "Cancel"}
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  /* Layout uses shared .page / .page-content from shared.css */

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: oklch(from #f87171 l c h / 0.50);
    transition: background 0.3s;
  }

  .status-dot.connected {
    background: var(--color-accent);
    box-shadow: 0 0 8px oklch(from #29ef82 l c h / 0.30);
  }

  .section-desc {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    line-height: 1.5;
    margin: 0;
  }

  /* Toggle group — lang selector */
  .toggle-group {
    display: flex;
    gap: 0;
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--color-border);
    width: fit-content;
  }

  .toggle-btn {
    padding: 10px 18px;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }

  .toggle-btn.active {
    background: var(--color-accent-bg);
    color: var(--color-accent);
  }

  .toggle-btn:hover:not(.active) {
    background: var(--color-bg-subtle);
  }

  /* Provider list */
  .provider-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .provider-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: 10px 14px;
    background: none;
    border: none;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-muted);
    cursor: pointer;
    text-align: left;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    transition: background 0.15s;
  }

  .provider-row:last-child {
    border-bottom: none;
  }

  .provider-row.active {
    background: var(--color-accent-bg);
    color: var(--color-text);
  }

  .provider-row:hover:not(.active) {
    background: var(--color-bg-subtle);
  }

  .provider-radio {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid var(--color-border);
    flex-shrink: 0;
    transition: border-color 0.15s, background 0.15s;
  }

  .provider-radio.checked {
    border-color: var(--color-accent);
    background: var(--color-accent);
    box-shadow: inset 0 0 0 3px var(--color-bg-card);
  }

  .provider-label {
    flex: 1;
  }

  .provider-model-hint {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-ghost);
  }

  /* Key input */
  .key-input-wrap {
    display: flex;
    gap: 0;
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--color-border);
    transition: border-color 0.2s;
  }

  .key-input-wrap:focus-within {
    border-color: var(--color-accent-border);
  }

  .key-input {
    flex: 1;
    padding: 12px 16px;
    background: var(--color-bg-card);
    border: none;
    color: var(--color-text);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    outline: none;
  }

  .key-input::placeholder {
    color: var(--color-text-ghost);
  }

  .key-toggle {
    padding: 12px 14px;
    background: none;
    border: none;
    border-left: 1px solid var(--color-border);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: color 0.2s;
    display: flex;
    align-items: center;
  }

  .key-toggle:hover {
    color: var(--color-text-secondary);
  }

  select.key-input {
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 32px;
  }

  .refresh-btn {
    background: none;
    border: none;
    color: var(--color-accent);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    cursor: pointer;
    padding: 0;
    margin-left: 4px;
  }

  .refresh-btn:hover {
    text-decoration: underline;
  }

  .key-status {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-accent);
    margin: 0;
    opacity: 0.6;
  }

  /* Test row */
  .test-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    flex-wrap: wrap;
  }

  .test-ok {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-accent);
  }

  .test-err {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: oklch(from #f87171 l c h);
    max-width: 300px;
    word-break: break-word;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .test-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1.5px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  /* Data section */
  .data-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-2);
  }

  .data-action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.15s;
    font-family: var(--font-sans);
    text-align: center;
  }

  .data-action:hover {
    border-color: var(--color-border-hover);
    color: var(--color-text-secondary);
    background: var(--color-bg-hover);
  }

  .data-action.danger {
    border-color: var(--color-error-border);
  }

  .data-action.danger:hover {
    background: var(--color-error-bg);
    color: var(--color-error);
    border-color: var(--color-error);
  }

  .data-action-label {
    font-size: var(--text-xs);
    font-weight: 500;
  }

  .confirm-card {
    padding: var(--sp-3);
    border: 1px solid var(--color-error-border);
    border-radius: var(--radius-sm);
    background: var(--color-error-bg);
  }

  .confirm-text {
    font-size: var(--text-sm);
    color: var(--color-text);
    margin: 0 0 var(--sp-2) 0;
  }

  .confirm-actions {
    display: flex;
    gap: var(--sp-2);
  }

  .confirm-btn {
    padding: 6px 14px;
    border-radius: var(--radius-xs);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    border: 1px solid var(--color-border);
    background: var(--color-bg-card);
    color: var(--color-text-secondary);
    transition: all 0.15s;
  }

  .confirm-btn:hover {
    border-color: var(--color-border-hover);
  }

  .confirm-btn.danger {
    background: var(--color-error-bg);
    border-color: var(--color-error-border);
    color: var(--color-error);
  }

  .confirm-btn.danger:hover {
    background: oklch(from var(--color-error) l c h / 0.15);
  }

  .import-label {
    display: inline-flex;
    cursor: pointer;
  }

  .import-input {
    display: none;
  }

  .import-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 10px 18px;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-bg-card);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }

  .import-label:hover .import-btn {
    background: var(--color-bg-subtle);
    color: var(--color-text);
  }

  .backup-status {
    font-size: var(--text-sm);
    margin: 0;
  }

  .backup-status.success {
    color: var(--color-accent);
  }

  .backup-status.error {
    color: oklch(from #f87171 l c h);
  }

  /* About grid */
  .about-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-2);
  }

  .about-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
  }

  .about-label {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-ghost);
  }

  .about-value {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .about-link {
    font-size: var(--text-sm);
    color: var(--color-accent);
    text-decoration: none;
    transition: opacity 0.2s;
  }

  .about-link:hover {
    opacity: 0.8;
  }
</style>
