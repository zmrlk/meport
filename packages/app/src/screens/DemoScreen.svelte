<script lang="ts">
  import { getProfile, getApiKey, getApiProvider, hasApiKey, goTo } from "../lib/stores/app.svelte.js";
  import { getRuleCompiler } from "@meport/core/compiler";
  import { createAIClient } from "@meport/core/client";
  import Icon from "../components/Icon.svelte";
  import SectionLabel from "../components/SectionLabel.svelte";

  let profile = $derived(getProfile());
  let aiConfigured = $derived(hasApiKey());

  const PRESETS = [
    "Plan me a weekend trip",
    "Review this code snippet for me",
    "Help me write an email to my manager",
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

    const provider = getApiProvider();
    const clientProvider = provider as "claude" | "openai" | "gemini" | "grok" | "openrouter" | "ollama";
    const client = createAIClient({
      provider: clientProvider,
      apiKey: getApiKey(),
    });

    // Compile profile rules for "with profile" version
    let compiledRules = "";
    try {
      const compiler = getRuleCompiler("chatgpt");
      const exported = compiler.compile(profile!);
      compiledRules = exported.content;
    } catch { /* use empty rules */ }

    // Run both in parallel
    const withoutPromise = client.generate(prompt.trim()).then(r => {
      withoutResult = r;
    }).catch(() => {
      withoutResult = "Error generating response.";
    }).finally(() => {
      loadingWithout = false;
    });

    const systemPrompt = compiledRules
      ? `You are an AI assistant. Use these user preferences when responding:\n\n${compiledRules}\n\n---\n\n`
      : "";

    const withPromise = client.generate(systemPrompt + prompt.trim()).then(r => {
      withResult = r;
    }).catch(() => {
      withResult = "Error generating response.";
    }).finally(() => {
      loadingWith = false;
    });

    await Promise.allSettled([withoutPromise, withPromise]);
  }
</script>

<div class="screen">
  {#if !profile}
    <div class="empty-state">
      <Icon name="code" size={40} />
      <h1 class="empty-title">No profile yet</h1>
      <p class="empty-desc">Create your profile to see how it changes AI responses.</p>
      <button class="btn-primary" onclick={() => goTo("home")}>Go to home</button>
    </div>
  {:else}
    <div class="header animate-fade-up" style="--delay: 0ms">
      <h1 class="header-title">Demo</h1>
      <p class="header-desc">See how your profile changes AI responses</p>
    </div>

    {#if !aiConfigured}
      <div class="no-ai animate-fade-up" style="--delay: 150ms">
        <Icon name="lock" size={20} />
        <p>Configure an AI provider in Settings to run the demo.</p>
        <button class="btn-secondary" onclick={() => goTo("settings")}>
          <Icon name="settings" size={14} />
          Open Settings
        </button>
      </div>
    {:else}
      <div class="controls animate-fade-up" style="--delay: 150ms">
        <SectionLabel>Preset prompts</SectionLabel>
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
            placeholder="Enter any prompt..."
            rows={2}
          ></textarea>
          <button
            class="btn-primary run-btn"
            onclick={runDemo}
            disabled={!prompt.trim() || loadingWithout || loadingWith}
          >
            <Icon name="zap" size={14} />
            Run
          </button>
        </div>
      </div>

      {#if error}
        <p class="error-msg animate-fade-up" style="--delay: 0ms">{error}</p>
      {/if}

      <div class="columns animate-fade-up" style="--delay: 300ms">
        <div class="column">
          <div class="column-header">
            <span class="column-label">Without profile</span>
            <span class="column-badge muted">generic</span>
          </div>
          <div class="column-body">
            {#if loadingWithout}
              <div class="col-loading">
                <div class="scan-ring"></div>
              </div>
            {:else if withoutResult}
              <p class="response-text">{withoutResult}</p>
            {:else}
              <p class="placeholder-text">Response will appear here</p>
            {/if}
          </div>
        </div>

        <div class="column column-accent">
          <div class="column-header">
            <span class="column-label">With profile</span>
            <span class="column-badge accent">personalized</span>
          </div>
          <div class="column-body">
            {#if loadingWith}
              <div class="col-loading">
                <div class="scan-ring accent"></div>
              </div>
            {:else if withResult}
              <p class="response-text">{withResult}</p>
            {:else}
              <p class="placeholder-text">Response will appear here</p>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .screen {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: var(--sp-6);
    gap: var(--sp-4);
  }

  .header {
    flex-shrink: 0;
  }

  .header-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .header-desc {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: var(--sp-1) 0 0 0;
  }

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

  .btn-primary {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-5);
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: #080a09;
    font-size: var(--text-sm);
    font-weight: 600;
    font-family: var(--font-sans);
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
  }

  .btn-primary:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .btn-secondary {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-5);
    border-radius: var(--radius-md);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-secondary:hover {
    border-color: var(--color-border-hover);
    color: var(--color-text);
    background: var(--color-bg-hover);
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-4);
    text-align: center;
    color: var(--color-text-ghost);
  }

  .empty-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
  }

  .empty-desc {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
  }

  @media (max-width: 600px) {
    .columns {
      grid-template-columns: 1fr;
    }
  }
</style>
