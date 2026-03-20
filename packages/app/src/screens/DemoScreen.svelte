<script lang="ts">
  import { getProfile, getApiKey, getApiProvider, getAiModel, getOllamaUrl, hasApiKey, goTo } from "../lib/stores/app.svelte.js";
  import { getRuleCompiler } from "@meport/core/compiler";
  import { createAIClient } from "@meport/core/client";
  import { t } from "../lib/i18n.svelte.js";
  import Icon from "../components/Icon.svelte";
  import SectionLabel from "../components/SectionLabel.svelte";

  let profile = $derived(getProfile());
  let aiConfigured = $derived(hasApiKey());

  const PRESETS = [
    "Zaplanuj mi weekendowy wyjazd",
    "Przejrzyj ten fragment kodu",
    "Pomoz mi napisac maila do szefa",
  ];

  let prompt = $state(PRESETS[0]);
  let withoutResult = $state("");
  let withResult = $state("");
  let loadingWithout = $state(false);
  let loadingWith = $state(false);
  let error = $state("");

  function selectPreset(p: string) {
    prompt = p;
    withoutResult = "";
    withResult = "";
    error = "";
  }

  async function runDemo() {
    if (!profile || !aiConfigured || !prompt.trim()) return;
    error = "";
    withoutResult = "";
    withResult = "";
    loadingWithout = true;
    loadingWith = true;

    const provider = getApiProvider() as "claude" | "openai" | "gemini" | "grok" | "openrouter" | "ollama";
    const client = createAIClient({
      provider,
      apiKey: provider !== "ollama" ? getApiKey() : undefined,
      model: getAiModel() || undefined,
      baseUrl: provider === "ollama" ? getOllamaUrl() : undefined,
    });

    let compiledRules = "";
    try {
      const compiler = getRuleCompiler("chatgpt");
      const exported = compiler.compile(profile!);
      compiledRules = exported.content;
    } catch { /* use empty rules */ }

    withoutResult = "";
    const withoutPromise = client.chatStream([
      { role: "user", content: prompt.trim() },
    ], (chunk) => { withoutResult += chunk; }).then(r => {
      withoutResult = r;
    }).catch((err) => {
      console.error("[meport] Demo without-profile error:", err);
      withoutResult = `Error: ${err?.message ?? "Unknown error"}`;
    }).finally(() => {
      loadingWithout = false;
    });

    const withMessages: { role: "system" | "user"; content: string }[] = [];
    if (compiledRules) {
      withMessages.push({
        role: "system",
        content: `You are a helpful AI assistant. The user has configured the following preferences and context about themselves. Follow these instructions precisely:\n\n${compiledRules}`,
      });
    }
    withMessages.push({ role: "user", content: prompt.trim() });

    withResult = "";
    const withPromise = client.chatStream(withMessages, (chunk) => { withResult += chunk; }).then(r => {
      withResult = r;
    }).catch((err) => {
      console.error("[meport] Demo with-profile error:", err);
      withResult = `Error: ${err?.message ?? "Unknown error"}`;
    }).finally(() => {
      loadingWith = false;
    });

    await Promise.allSettled([withoutPromise, withPromise]);
  }
</script>

<div class="page">
  {#if !profile}
    <div class="empty-state">
      <Icon name="code" size={40} />
      <h1 class="empty-title">{t("demo.no_profile")}</h1>
      <p class="empty-desc">{t("demo.no_profile_desc")}</p>
      <button class="btn-primary" onclick={() => goTo("home")}>{t("demo.go_home")}</button>
    </div>
  {:else}
    <div class="page-content page-content--wide">
    <div class="page-header animate-fade-up" style="--delay: 0ms">
      <h1 class="page-title">{t("demo.title")}</h1>
      <p class="page-subtitle">{t("demo.desc")}</p>
    </div>

    {#if !aiConfigured}
      <div class="no-ai animate-fade-up" style="--delay: 150ms">
        <Icon name="lock" size={20} />
        <p>{t("demo.no_ai")}</p>
        <button class="btn-secondary" onclick={() => goTo("settings")}>
          <Icon name="settings" size={14} />
          {t("demo.open_settings")}
        </button>
      </div>
    {:else}
      <div class="controls animate-fade-up" style="--delay: 150ms">
        <SectionLabel>{t("demo.preset_prompts")}</SectionLabel>
        <div class="presets">
          {#each PRESETS as p}
            <button
              class="preset-btn"
              class:active={prompt === p}
              onclick={() => selectPreset(p)}
            >
              {p}
            </button>
          {/each}
        </div>

        <div class="prompt-row">
          <textarea
            class="prompt-input"
            bind:value={prompt}
            placeholder={t("demo.prompt_placeholder")}
            rows={2}
          ></textarea>
          <button
            class="btn-primary run-btn"
            onclick={runDemo}
            disabled={!prompt.trim() || loadingWithout || loadingWith}
          >
            <Icon name="zap" size={14} />
            {t("demo.run")}
          </button>
        </div>
      </div>

      {#if error}
        <p class="error-msg animate-fade-up" style="--delay: 0ms">{error}</p>
      {/if}

      <div class="columns animate-fade-up" style="--delay: 300ms">
        <div class="column">
          <div class="column-header">
            <span class="column-label">{t("demo.without_profile")}</span>
            <span class="column-badge muted">{t("demo.generic")}</span>
          </div>
          <div class="column-body">
            {#if loadingWithout}
              <div class="col-loading">
                <div class="scan-ring"></div>
              </div>
            {:else if withoutResult}
              <p class="response-text">{withoutResult}</p>
            {:else}
              <p class="placeholder-text">{t("demo.response_placeholder")}</p>
            {/if}
          </div>
        </div>

        <div class="column column-accent">
          <div class="column-header">
            <span class="column-label">{t("demo.with_profile")}</span>
            <span class="column-badge accent">{t("demo.personalized")}</span>
          </div>
          <div class="column-body">
            {#if loadingWith}
              <div class="col-loading">
                <div class="scan-ring accent"></div>
              </div>
            {:else if withResult}
              <p class="response-text">{withResult}</p>
            {:else}
              <p class="placeholder-text">{t("demo.response_placeholder")}</p>
            {/if}
          </div>
        </div>
      </div>
    {/if}
    </div>
  {/if}
</div>

<style>
  /* Layout uses shared .page / .page-content from shared.css */

  .no-ai {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-4);
    padding: var(--sp-8);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    color: var(--color-text-muted);
    text-align: center;
    max-width: 360px;
    align-self: center;
  }

  .no-ai p {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--color-text-secondary);
  }

  .controls {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .presets {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
  }

  .preset-btn {
    padding: var(--sp-1) var(--sp-3);
    border-radius: var(--radius-full);
    border: 1px solid var(--color-border);
    background: none;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all 0.2s;
  }

  .preset-btn:hover {
    border-color: var(--color-border-hover);
    color: var(--color-text-secondary);
  }

  .preset-btn.active {
    border-color: var(--color-accent);
    color: var(--color-accent);
    background: var(--color-accent-bg);
  }

  .prompt-row {
    display: flex;
    gap: var(--sp-2);
    align-items: flex-start;
  }

  .prompt-input {
    flex: 1;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-bg-card);
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    resize: none;
    outline: none;
    transition: border-color 0.2s;
    line-height: 1.5;
  }

  .prompt-input:focus {
    border-color: var(--color-accent-border);
  }

  .run-btn {
    flex-shrink: 0;
    align-self: stretch;
  }

  .error-msg {
    font-size: var(--text-sm);
    color: oklch(0.55 0.2 25);
    margin: 0;
  }

  .columns {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-4);
    min-height: 0;
  }

  .column {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .column-accent {
    border-color: oklch(from var(--color-accent) l c h / 0.3);
  }

  .column-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-3) var(--sp-4);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .column-label {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .column-badge {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    border-radius: var(--radius-xs);
  }

  .column-badge.muted {
    background: var(--color-bg-subtle);
    color: var(--color-text-ghost);
  }

  .column-badge.accent {
    background: var(--color-accent-bg);
    color: var(--color-accent);
  }

  .column-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--sp-4);
  }

  .col-loading {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .scan-ring {
    width: 24px;
    height: 24px;
    border: 2px solid oklch(from var(--color-text-ghost) l c h / 0.3);
    border-top-color: var(--color-text-ghost);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .scan-ring.accent {
    border-color: oklch(from var(--color-accent) l c h / 0.3);
    border-top-color: var(--color-accent);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .response-text {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    line-height: 1.65;
    margin: 0;
    white-space: pre-wrap;
  }

  .placeholder-text {
    font-size: var(--text-xs);
    color: var(--color-text-ghost);
    margin: 0;
    font-style: italic;
  }

  @media (max-width: 600px) {
    .columns {
      grid-template-columns: 1fr;
    }
  }
</style>
