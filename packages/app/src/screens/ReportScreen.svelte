<script lang="ts">
  import { getProfile, getApiKey, getApiProvider, hasApiKey, goTo } from "../lib/stores/app.svelte.js";
  import { AIEnricher, type SynthesisResult } from "@meport/core/enricher";
  import { createAIClient } from "@meport/core/client";
  import { getLocale, t } from "../lib/i18n.svelte.js";
  import Icon from "../components/Icon.svelte";
  import SectionLabel from "../components/SectionLabel.svelte";

  let profile = $derived(getProfile());
  let aiConfigured = $derived(hasApiKey());

  let synthesis = $state<SynthesisResult | null>(null);
  let loading = $state(false);
  let error = $state("");
  let copySuccess = $state(false);

  let collapsed = $state<Record<string, boolean>>({
    narrative: false,
    cognitive: true,
    communication: true,
    contradictions: true,
    predictions: true,
    strengths: true,
    blindSpots: true,
  });

  function toggle(section: string) {
    collapsed[section] = !collapsed[section];
  }

  async function generate() {
    if (!profile || !aiConfigured) return;
    loading = true;
    error = "";
    synthesis = null;
    try {
      const provider = getApiProvider();
      const clientProvider = provider as "claude" | "openai" | "gemini" | "grok" | "openrouter" | "ollama";
      const client = createAIClient({
        provider: clientProvider,
        apiKey: getApiKey(),
      });
      const enricher = new AIEnricher(client, getLocale());
      synthesis = await enricher.synthesize(profile);
    } catch (e) {
      error = e instanceof Error ? e.message : "Generation failed";
    } finally {
      loading = false;
    }
  }

  function copyReport() {
    if (!synthesis) return;
    const parts: string[] = [];
    parts.push(`# Personality Report\n`);
    if (synthesis.narrative) parts.push(`## Summary\n${synthesis.narrative}\n`);
    if (synthesis.cognitiveProfile) {
      parts.push(`## Cognitive Profile`);
      const c = synthesis.cognitiveProfile;
      parts.push(`- Thinking: ${c.thinkingStyle}\n- Learning: ${c.learningMode}\n- Decisions: ${c.decisionPattern}\n- Attention: ${c.attentionType}\n`);
    }
    if (synthesis.communicationDNA) {
      parts.push(`## Communication DNA`);
      const d = synthesis.communicationDNA;
      parts.push(`- Tone: ${d.tone}\n- Formality: ${d.formality}\n- Directness: ${d.directness}\n`);
    }
    if (synthesis.strengths?.length) {
      parts.push(`## Strengths\n${synthesis.strengths.map(s => `- ${s}`).join("\n")}\n`);
    }
    if (synthesis.blindSpots?.length) {
      parts.push(`## Blind Spots\n${synthesis.blindSpots.map(s => `- ${s}`).join("\n")}\n`);
    }
    navigator.clipboard.writeText(parts.join("\n")).then(() => {
      copySuccess = true;
      setTimeout(() => { copySuccess = false; }, 2000);
    });
  }
</script>

<div class="screen">
  {#if !profile}
    <div class="empty-state">
      <Icon name="sparkle" size={40} />
      <h1 class="empty-title">{t("report.no_profile")}</h1>
      <p class="empty-desc">{t("report.no_profile_desc")}</p>
      <button class="btn-primary" onclick={() => goTo("home")}>{t("report.go_home")}</button>
    </div>
  {:else}
    <div class="header animate-fade-up" style="--delay: 0ms">
      <h1 class="header-title">{t("report.title")}</h1>
      <p class="header-desc">{t("report.desc")}</p>
    </div>

    {#if !aiConfigured}
      <div class="no-ai animate-fade-up" style="--delay: 150ms">
        <Icon name="lock" size={20} />
        <p>{t("report.no_ai")}</p>
        <button class="btn-secondary" onclick={() => goTo("settings")}>
          <Icon name="settings" size={14} />
          {t("report.open_settings")}
        </button>
      </div>
    {:else if !synthesis && !loading}
      <div class="generate-area animate-fade-up" style="--delay: 150ms">
        <p class="generate-hint">{t("report.generate_hint")}</p>
        <button class="btn-primary" onclick={generate}>
          <Icon name="sparkle" size={16} />
          {t("report.generate")}
        </button>
      </div>
    {:else if loading}
      <div class="loading-state animate-fade-up" style="--delay: 150ms">
        <div class="scan-ring"></div>
        <p>{t("report.generating")}</p>
      </div>
    {:else if error}
      <div class="error-state animate-fade-up" style="--delay: 0ms">
        <p class="error-msg">{error}</p>
        <button class="btn-secondary" onclick={generate}>{t("report.try_again")}</button>
      </div>
    {:else if synthesis}
      <div class="report animate-fade-up" style="--delay: 150ms">
        <div class="report-actions">
          <button class="btn-secondary btn-sm" onclick={generate}>
            <Icon name="sparkle" size={12} />
            {t("report.regenerate")}
          </button>
          <button class="btn-secondary btn-sm" onclick={copyReport}>
            <Icon name={copySuccess ? "check" : "copy"} size={12} />
            {copySuccess ? t("report.copied") : t("report.copy")}
          </button>
        </div>

        <div class="section">
          <button class="section-header" onclick={() => toggle("narrative")}>
            <SectionLabel>{t("report.summary")}</SectionLabel>
            <Icon name={collapsed.narrative ? "chevron-right" : "chevron-down"} size={14} />
          </button>
          {#if !collapsed.narrative}
            <p class="narrative-text">{synthesis.narrative}</p>
          {/if}
        </div>

        {#if synthesis.cognitiveProfile}
          <div class="section">
            <button class="section-header" onclick={() => toggle("cognitive")}>
              <SectionLabel>{t("report.cognitive")}</SectionLabel>
              <Icon name={collapsed.cognitive ? "chevron-right" : "chevron-down"} size={14} />
            </button>
            {#if !collapsed.cognitive}
              <div class="kv-grid">
                <div class="kv-item">
                  <span class="kv-key">{t("report.thinking")}</span>
                  <span class="kv-val">{synthesis.cognitiveProfile.thinkingStyle}</span>
                </div>
                <div class="kv-item">
                  <span class="kv-key">{t("report.learning")}</span>
                  <span class="kv-val">{synthesis.cognitiveProfile.learningMode}</span>
                </div>
                <div class="kv-item">
                  <span class="kv-key">{t("report.decisions")}</span>
                  <span class="kv-val">{synthesis.cognitiveProfile.decisionPattern}</span>
                </div>
                <div class="kv-item">
                  <span class="kv-key">{t("report.attention")}</span>
                  <span class="kv-val">{synthesis.cognitiveProfile.attentionType}</span>
                </div>
              </div>
            {/if}
          </div>
        {/if}

        {#if synthesis.communicationDNA}
          <div class="section">
            <button class="section-header" onclick={() => toggle("communication")}>
              <SectionLabel>{t("report.communication")}</SectionLabel>
              <Icon name={collapsed.communication ? "chevron-right" : "chevron-down"} size={14} />
            </button>
            {#if !collapsed.communication}
              <div class="kv-grid">
                <div class="kv-item">
                  <span class="kv-key">{t("report.tone")}</span>
                  <span class="kv-val">{synthesis.communicationDNA.tone}</span>
                </div>
                <div class="kv-item">
                  <span class="kv-key">{t("report.formality")}</span>
                  <span class="kv-val">{synthesis.communicationDNA.formality}</span>
                </div>
                <div class="kv-item">
                  <span class="kv-key">{t("report.directness")}</span>
                  <span class="kv-val">{synthesis.communicationDNA.directness}</span>
                </div>
                {#if synthesis.communicationDNA.adaptations?.length}
                  <div class="kv-item kv-full">
                    <span class="kv-key">{t("report.adaptations")}</span>
                    <ul class="kv-list">
                      {#each synthesis.communicationDNA.adaptations as a}
                        <li>{a}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        {#if synthesis.contradictions?.length}
          <div class="section">
            <button class="section-header" onclick={() => toggle("contradictions")}>
              <SectionLabel>{t("report.contradictions")}</SectionLabel>
              <Icon name={collapsed.contradictions ? "chevron-right" : "chevron-down"} size={14} />
            </button>
            {#if !collapsed.contradictions}
              <div class="card-list">
                {#each synthesis.contradictions as c}
                  <div class="card-item">
                    <span class="card-item-label">{c.area}</span>
                    <p class="card-item-text">{c.observation}</p>
                    <p class="card-item-resolution">{c.resolution}</p>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        {#if synthesis.predictions?.length}
          <div class="section">
            <button class="section-header" onclick={() => toggle("predictions")}>
              <SectionLabel>{t("report.predictions")}</SectionLabel>
              <Icon name={collapsed.predictions ? "chevron-right" : "chevron-down"} size={14} />
            </button>
            {#if !collapsed.predictions}
              <div class="card-list">
                {#each synthesis.predictions as p}
                  <div class="card-item">
                    <span class="card-item-label">{p.context}</span>
                    <p class="card-item-text">{p.prediction}</p>
                    <span class="confidence-badge">{Math.round(p.confidence * 100)}%</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        {#if synthesis.strengths?.length}
          <div class="section">
            <button class="section-header" onclick={() => toggle("strengths")}>
              <SectionLabel>{t("report.strengths")}</SectionLabel>
              <Icon name={collapsed.strengths ? "chevron-right" : "chevron-down"} size={14} />
            </button>
            {#if !collapsed.strengths}
              <ul class="bullet-list green">
                {#each synthesis.strengths as s}
                  <li>{s}</li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}

        {#if synthesis.blindSpots?.length}
          <div class="section">
            <button class="section-header" onclick={() => toggle("blindSpots")}>
              <SectionLabel>{t("report.blind_spots")}</SectionLabel>
              <Icon name={collapsed.blindSpots ? "chevron-right" : "chevron-down"} size={14} />
            </button>
            {#if !collapsed.blindSpots}
              <ul class="bullet-list amber">
                {#each synthesis.blindSpots as b}
                  <li>{b}</li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
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
    overflow-y: auto;
    padding: var(--sp-8) var(--sp-6);
    gap: var(--sp-6);
    align-items: center;
  }

  .header {
    text-align: center;
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
    max-width: 360px;
    text-align: center;
  }

  .no-ai p {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--color-text-secondary);
  }

  .generate-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-4);
    text-align: center;
    max-width: 400px;
  }

  .generate-hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    line-height: 1.5;
    margin: 0;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-4);
    padding: var(--sp-8);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .scan-ring {
    width: 32px;
    height: 32px;
    border: 2px solid oklch(from var(--color-accent) l c h / 0.3);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
    text-align: center;
  }

  .error-msg {
    font-size: var(--text-sm);
    color: oklch(0.55 0.2 25);
    margin: 0;
  }

  .report {
    width: 100%;
    max-width: 600px;
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .report-actions {
    display: flex;
    gap: var(--sp-2);
    justify-content: flex-end;
  }

  .section {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .section-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-3) var(--sp-4);
    background: none;
    border: none;
    cursor: pointer;
    transition: background 0.15s;
    color: var(--color-text-muted);
  }

  .section-header:hover {
    background: var(--color-bg-subtle);
  }

  .narrative-text {
    padding: 0 var(--sp-4) var(--sp-4);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.65;
    margin: 0;
  }

  .kv-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-2);
    padding: 0 var(--sp-4) var(--sp-4);
  }

  .kv-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-2) var(--sp-3);
    background: var(--color-bg-subtle);
    border-radius: var(--radius-sm);
  }

  .kv-full {
    grid-column: 1 / -1;
  }

  .kv-key {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-ghost);
  }

  .kv-val {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
  }

  .kv-list {
    margin: var(--sp-1) 0 0 0;
    padding-left: var(--sp-4);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .card-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: 0 var(--sp-4) var(--sp-4);
  }

  .card-item {
    padding: var(--sp-3);
    background: var(--color-bg-subtle);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    position: relative;
  }

  .card-item-label {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-accent);
  }

  .card-item-text {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .card-item-resolution {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
    font-style: italic;
  }

  .confidence-badge {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-accent);
    position: absolute;
    top: var(--sp-3);
    right: var(--sp-3);
  }

  .bullet-list {
    margin: 0;
    padding: 0 var(--sp-4) var(--sp-4) var(--sp-8);
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .bullet-list li {
    font-size: var(--text-xs);
    line-height: 1.5;
  }

  .bullet-list.green li {
    color: var(--color-text-secondary);
  }

  .bullet-list.amber li {
    color: var(--color-text-secondary);
  }
</style>
