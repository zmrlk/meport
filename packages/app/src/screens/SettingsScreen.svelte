<script lang="ts">
  import { getApiKey, getApiProvider, getOllamaUrl, getAiModel, setApiKey, setApiProvider, setOllamaUrl, setAiModel, hasApiKey, getProfile, setProfile, clearProfile, type AIProvider } from "../lib/stores/app.svelte.js";
  import { createAIClient } from "@meport/core/client";
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

  function exportBackup() {
    const p = getProfile();
    if (!p) return;
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meport-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
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

  function deleteProfile() {
    if (!confirm(t("settings.delete_confirm"))) return;
    clearProfile();
    backupStatus = "deleted";
    setTimeout(() => { backupStatus = ""; }, 3000);
  }
</script>

<div class="screen">
  <div class="content">
    <h1 class="title animate-fade-up" style="--delay: 0ms">{t("settings.title")}</h1>

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
      <div class="key-input-wrap">
        <input
          type="text"
          class="key-input"
          placeholder={providers.find(p => p.id === provider)?.defaultModel ?? "default"}
          bind:value={model}
          onkeydown={(e) => { if (e.key === "Enter") save(); }}
        />
      </div>
      <p class="section-desc" style="margin-top: -4px">Model (optional) — leave blank to use provider default</p>

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
          <span class="about-value">0.1.0</span>
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
          <span class="about-value">Open source</span>
        </div>
      </div>
    </section>

    <!-- Data -->
    <section class="section animate-fade-up" style="--delay: 500ms">
      <SectionLabel>{t("settings.data")}</SectionLabel>
      <p class="section-desc">{t("settings.data_trust")}</p>

      <div class="data-actions">
        <Button variant="secondary" size="md" onclick={exportBackup}>
          <Icon name="download" size={14} />
          {t("settings.export_backup")}
        </Button>

        <label class="import-label">
          <input
            type="file"
            accept=".json,application/json"
            class="import-input"
            onchange={importBackup}
          />
          <span class="import-btn">
            <Icon name="upload" size={14} />
            {t("settings.import_backup")}
          </span>
        </label>
      </div>

      {#if backupStatus === "restored"}
        <p class="backup-status success">{t("settings.backup_restored")}</p>
      {:else if backupStatus === "deleted"}
        <p class="backup-status success">{t("settings.deleted")}</p>
      {:else if backupStatus === "error"}
        <p class="backup-status error">{t("settings.backup_error")}</p>
      {/if}

      <div class="danger-zone">
        <Button variant="danger" size="md" onclick={deleteProfile}>
          <Icon name="trash" size={14} />
          {t("settings.delete_profile")}
        </Button>
      </div>
    </section>
  </div>
</div>

<style>
  .screen {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    overflow-y: auto;
    padding: var(--sp-8) 0;
  }

  .content {
    width: 100%;
    max-width: var(--content-width);
    padding: 0 var(--sp-8);
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
  }

  .title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    letter-spacing: -0.02em;
  }

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
  .data-actions {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
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

  .danger-zone {
    margin-top: var(--sp-2);
    padding-top: var(--sp-4);
    border-top: 1px solid var(--color-border);
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
</style>
