<script lang="ts">
  import { getRuleCompiler, type PlatformId } from "@meport/core/compiler";
  import type { ExportResult } from "@meport/core/types";
  import { getProfile, goTo, hasApiKey, getApiKey, getApiProvider } from "../lib/stores/app.svelte.js";
  import { getPackExportRules } from "../lib/stores/profiling.svelte.js";
  import { isTauri, deployToFile, getCwd } from "../lib/tauri-bridge.js";
  import { platforms } from "../lib/platforms.js";
  import { AIEnricher, type RuleValidationResult } from "@meport/core/enricher";
  import { createAIClient } from "@meport/core/client";
  import { getLocale } from "../lib/i18n.svelte.js";
  import PlatformCard from "../components/PlatformCard.svelte";
  import ExportPreview from "../components/ExportPreview.svelte";
  import Icon from "../components/Icon.svelte";
  import Button from "../components/Button.svelte";
  import StatPill from "../components/StatPill.svelte";
  import SectionLabel from "../components/SectionLabel.svelte";
  import { t } from "../lib/i18n.svelte.js";

  let profile = $derived(getProfile());
  let selectedPlatform = $state("chatgpt");
  let exportResult = $state<ExportResult | null>(null);
  let apiConfigured = $derived(hasApiKey());

  // Tab state
  let activeTab = $state<"export" | "deploy">("export");

  // Deploy state
  let copiedPlatform = $state<string | null>(null);

  // AI compilation toggle — persisted in localStorage
  let aiCompile = $state(localStorage.getItem("meport:ai-compile") === "true");
  let aiCompiling = $state(false);
  let aiCompiledContent = $state("");

  // Rule validation
  let ruleValidation = $state<RuleValidationResult | null>(null);
  let ruleValidating = $state(false);

  function toggleAiCompile() {
    aiCompile = !aiCompile;
    localStorage.setItem("meport:ai-compile", String(aiCompile));
    if (!aiCompile) aiCompiledContent = "";
  }

  $effect(() => {
    if (!profile) return;
    try {
      const compiler = getRuleCompiler(selectedPlatform as PlatformId);
      const packRules = getPackExportRules();
      if (packRules.size > 0 && compiler.setPackExportRules) {
        compiler.setPackExportRules(packRules as Map<string, string[]>);
      }
      exportResult = compiler.compile(profile);
    } catch (e) {
      exportResult = null;
    }

    if (aiCompile && apiConfigured) {
      aiCompiledContent = "";
      aiCompiling = true;
      const apiKey = getApiKey();
      const provider = getApiProvider();
      const clientProvider = provider === "anthropic" ? "claude" : provider;
      const client = createAIClient({
        provider: clientProvider as "claude" | "openai" | "ollama",
        apiKey,
      });
      const enricher = new AIEnricher(client, getLocale());
      enricher.compileForPlatform(profile, selectedPlatform).then(result => {
        if (result) aiCompiledContent = result;
      }).catch(() => {}).finally(() => {
        aiCompiling = false;
      });
    } else {
      aiCompiledContent = "";
    }
  });

  let selectedMeta = $derived(platforms.find(p => p.id === selectedPlatform));
  let completeness = $derived(profile?.completeness ?? 0);
  let dimensionCount = $derived(profile ?
    Object.keys(profile.explicit).length +
    Object.keys(profile.inferred).length +
    Object.keys(profile.compound).length : 0);

  async function validateRules() {
    if (!profile || !apiConfigured || ruleValidating) return;
    const rules = profile.synthesis?.exportRules ?? [];
    if (rules.length === 0) return;

    ruleValidating = true;
    ruleValidation = null;
    try {
      const apiKey = getApiKey();
      const provider = getApiProvider();
      const clientProvider = provider === "anthropic" ? "claude" : provider;
      const client = createAIClient({
        provider: clientProvider as "claude" | "openai" | "ollama",
        apiKey,
      });
      const enricher = new AIEnricher(client, getLocale());
      ruleValidation = await enricher.validateExportRules(rules);
    } catch {
      ruleValidation = null;
    } finally {
      ruleValidating = false;
    }
  }

  // ─── Download helpers ──────────────────────────────────────

  function downloadFile(platformId: string) {
    if (!profile) return;
    try {
      const compiler = getRuleCompiler(platformId as PlatformId);
      const packRules = getPackExportRules();
      if (packRules.size > 0 && compiler.setPackExportRules) {
        compiler.setPackExportRules(packRules as Map<string, string[]>);
      }
      const result = compiler.compile(profile);
      const blob = new Blob([result.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* skip failed */ }
  }

  async function downloadAll() {
    if (!profile) return;
    const packRules = getPackExportRules();
    for (const p of platforms) {
      try {
        const compiler = getRuleCompiler(p.id as PlatformId);
        if (packRules.size > 0 && compiler.setPackExportRules) {
          compiler.setPackExportRules(packRules as Map<string, string[]>);
        }
        const result = compiler.compile(profile);
        const blob = new Blob([result.content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
        await new Promise(r => setTimeout(r, 200));
      } catch { /* skip failed */ }
    }
  }

  // Native deploy (Tauri only)
  let deployedPlatform = $state<string | null>(null);
  let deployedStatus = $state<"new" | "merged" | "updated" | null>(null);
  let deployError = $state<string | null>(null);

  const MEPORT_MARKER = "# --- meport profile (auto-generated) ---";

  async function nativeDeploy(platformId: string) {
    if (!profile) return;
    try {
      const compiler = getRuleCompiler(platformId as PlatformId);
      const packRules = getPackExportRules();
      if (packRules.size > 0 && compiler.setPackExportRules) {
        compiler.setPackExportRules(packRules as Map<string, string[]>);
      }
      const result = compiler.compile(profile);
      const cwd = await getCwd();
      const paths: Record<string, string> = {
        "cursor": `${cwd}/.cursor/rules/meport.mdc`,
        "claude-code": `${cwd}/CLAUDE.md`,
        "copilot": `${cwd}/.github/copilot-instructions.md`,
        "windsurf": `${cwd}/.windsurfrules`,
        "agents-md": `${cwd}/AGENTS.md`,
        "ollama": `${cwd}/Modelfile`,
        "generic": `${cwd}/meport-rules.md`,
      };
      const path = paths[platformId];
      if (!path) return;
      const deployResult = await deployToFile(path, result.content);
      deployedPlatform = platformId;
      deployedStatus = deployResult.status;
      deployError = null;
      setTimeout(() => { deployedPlatform = null; deployedStatus = null; }, 2500);
    } catch (e) {
      deployError = e instanceof Error ? e.message : "Deploy failed";
      setTimeout(() => { deployError = null; }, 4000);
    }
  }

  function downloadFileWithMarker(platformId: string) {
    if (!profile) return;
    try {
      const compiler = getRuleCompiler(platformId as PlatformId);
      const result = compiler.compile(profile);
      const content = `${MEPORT_MARKER}\n\n${result.content}`;
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* skip failed */ }
  }

  async function copyToClipboard(platformId: string) {
    if (!profile) return;
    try {
      const compiler = getRuleCompiler(platformId as PlatformId);
      const packRules = getPackExportRules();
      if (packRules.size > 0 && compiler.setPackExportRules) {
        compiler.setPackExportRules(packRules as Map<string, string[]>);
      }
      const result = compiler.compile(profile);
      await navigator.clipboard.writeText(result.content);
      copiedPlatform = platformId;
      setTimeout(() => { copiedPlatform = null; }, 2000);
    } catch { /* fallback: create a text area */ }
  }

  // Deploy targets — split by type
  const downloadTargets = [
    { id: "claude-code", label: "Claude Code", path: "CLAUDE.md" },
    { id: "cursor", label: "Cursor", path: ".cursor/rules/meport.mdc" },
    { id: "copilot", label: "GitHub Copilot", path: ".github/copilot-instructions.md" },
    { id: "windsurf", label: "Windsurf", path: ".windsurfrules" },
    { id: "agents-md", label: "AGENTS.md", path: "AGENTS.md" },
    { id: "ollama", label: "Ollama", path: "Modelfile" },
    { id: "generic", label: "Generic", path: "meport-rules.md" },
  ];

  const clipboardTargets = [
    { id: "chatgpt", label: "ChatGPT", hint: "Settings → Personalization → Custom Instructions", url: "https://chatgpt.com/?temporary-chat=true#settings/Personalization" },
    { id: "claude", label: "Claude", hint: "Settings → Profile → Instructions", url: "https://claude.ai/settings/profile" },
    { id: "gemini", label: "Gemini", hint: "Gemini → Gems → Create a gem → Instructions", url: "https://gemini.google.com/app/settings" },
    { id: "grok", label: "Grok", hint: "Settings → Custom Instructions → Paste", url: "https://x.com/i/grok" },
    { id: "perplexity", label: "Perplexity", hint: "Settings → Account → AI Profile → Paste", url: "https://www.perplexity.ai/settings/account" },
  ];
</script>

<div class="screen">
  {#if profile}
    <!-- Header -->
    <div class="header animate-fade-up" style="--delay: 0ms">
      <div class="header-top">
        <h1 class="header-title">{t("export.profile_ready")}</h1>
        <div class="header-stats">
          <StatPill value={dimensionCount} label={t("home.dimensions")} />
          <StatPill value="{completeness}%" label={t("home.complete")} />
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button class="tab" class:tab-active={activeTab === "export"} onclick={() => { activeTab = "export"; }}>
          <Icon name="download" size={14} />
          Export
        </button>
        <button class="tab" class:tab-active={activeTab === "deploy"} onclick={() => { activeTab = "deploy"; }}>
          <Icon name="send" size={14} />
          Deploy
        </button>
      </div>
    </div>

    {#if activeTab === "export"}
      <div class="main">
        <!-- Platform selector -->
        <div class="platforms animate-fade-up" style="--delay: 200ms">
          <SectionLabel>{t("export.export_to")}</SectionLabel>
          <div class="platform-grid">
            {#each platforms as platform, i}
              <div class="animate-fade-up" style="--delay: {300 + i * 40}ms">
                <PlatformCard
                  {platform}
                  selected={selectedPlatform === platform.id}
                  onclick={() => { selectedPlatform = platform.id; }}
                />
              </div>
            {/each}
          </div>
          <Button variant="secondary" size="sm" onclick={downloadAll}>
            <Icon name="download" size={14} />
            {t("export.download_all")}
          </Button>
        </div>

        <!-- AI Compile Toggle -->
        {#if apiConfigured}
          <div class="ai-toggle-row animate-fade-up" style="--delay: 350ms">
            <button class="ai-toggle" class:active={aiCompile} onclick={toggleAiCompile}>
              <Icon name="sparkle" size={14} />
              {t("export.ai_compile")}
            </button>
            {#if aiCompile}
              <span class="ai-toggle-sub">{t("export.ai_compile_sub")}</span>
            {/if}
          </div>
        {/if}

        <!-- Preview -->
        <div class="preview-area animate-fade-up" style="--delay: 400ms">
          {#if aiCompiling}
            <div class="ai-compiling-state">
              <div class="scan-ring"></div>
              <p>{t("export.compiling")}</p>
            </div>
          {:else if aiCompiledContent && aiCompile}
            <ExportPreview
              content={aiCompiledContent}
              filename={exportResult?.filename ?? "meport-profile.md"}
              instructions={exportResult?.instructions ?? ""}
              dimensionsCovered={exportResult?.dimensionsCovered ?? 0}
              dimensionsOmitted={exportResult?.dimensionsOmitted ?? 0}
              confidence_floor={exportResult?.confidence_floor ?? 0}
            />
          {:else if exportResult}
            <ExportPreview
              content={exportResult.content}
              filename={exportResult.filename}
              instructions={exportResult.instructions}
              dimensionsCovered={exportResult.dimensionsCovered}
              dimensionsOmitted={exportResult.dimensionsOmitted}
              confidence_floor={exportResult.confidence_floor}
            />
          {:else}
            <div class="no-preview glass">
              <p>{t("export.select_platform")}</p>
            </div>
          {/if}

          {#if exportResult && selectedMeta?.settingsUrl}
            <Button variant="primary" size="md" href={selectedMeta.settingsUrl} class="settings-link">
              <Icon name="external" size={14} />
              {t("export.open_settings")} {selectedMeta.name}
            </Button>
          {/if}

          <!-- Rule Validation -->
          {#if apiConfigured && profile?.synthesis?.exportRules?.length}
            <div class="rule-validation-section">
              {#if !ruleValidation && !ruleValidating}
                <button class="validate-btn" onclick={validateRules}>
                  <Icon name="check" size={14} />
                  Validate export rules
                </button>
              {:else if ruleValidating}
                <div class="ai-compiling-state">
                  <div class="scan-ring"></div>
                  <p>Validating rules...</p>
                </div>
              {:else if ruleValidation}
                <div class="validation-results">
                  <div class="validation-summary">
                    <span class="quality-pill high">{ruleValidation.qualityBreakdown.high} high</span>
                    <span class="quality-pill medium">{ruleValidation.qualityBreakdown.medium} medium</span>
                    {#if ruleValidation.qualityBreakdown.low > 0}
                      <span class="quality-pill low">{ruleValidation.qualityBreakdown.low} weak</span>
                    {/if}
                  </div>
                  {#if ruleValidation.weakRules.length > 0}
                    <div class="weak-rules">
                      <SectionLabel>Rules to improve</SectionLabel>
                      {#each ruleValidation.weakRules as weak}
                        <div class="weak-rule-item">
                          <p class="weak-rule-original">{weak.rule}</p>
                          <p class="weak-rule-problem">{weak.problem}</p>
                          <p class="weak-rule-fix">{weak.improvement}</p>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>

    {:else}
      <!-- Deploy Tab -->
      <div class="deploy-screen animate-fade-up" style="--delay: 100ms">

        <!-- Auto-deploy: download files -->
        <div class="deploy-section">
          <div class="deploy-section-header">
            <div class="deploy-section-title">
              <Icon name="download" size={16} />
              <span>Download files</span>
            </div>
            <span class="deploy-section-sub">Drop into your project root</span>
          </div>

          <div class="deploy-targets">
            {#each downloadTargets as target}
              <div class="deploy-target">
                <div class="deploy-target-info">
                  <span class="deploy-target-name">{target.label}</span>
                  <code class="deploy-target-path">{target.path}</code>
                </div>
                {#if isTauri()}
                  <button
                    class="deploy-btn"
                    class:deploy-btn-copied={deployedPlatform === target.id}
                    onclick={() => nativeDeploy(target.id)}
                  >
                    {#if deployedPlatform === target.id}
                      <Icon name="check" size={14} />
                      {deployedStatus === "new" ? "Created" : deployedStatus === "merged" ? "Merged" : "Updated"}
                    {:else}
                      <Icon name="send" size={14} />
                      Deploy
                    {/if}
                  </button>
                {:else}
                  <button class="deploy-btn" onclick={() => downloadFileWithMarker(target.id)}>
                    <Icon name="download" size={14} />
                    Download
                  </button>
                {/if}
              </div>
            {/each}
          </div>

          {#if deployError}
            <p class="deploy-error">{deployError}</p>
          {/if}

          <button class="deploy-all-btn" onclick={downloadAll}>
            <Icon name="download" size={14} />
            Download all files
          </button>
        </div>

        <!-- Manual deploy: clipboard -->
        <div class="deploy-section">
          <div class="deploy-section-header">
            <div class="deploy-section-title">
              <Icon name="copy" size={16} />
              <span>Copy to clipboard</span>
            </div>
            <span class="deploy-section-sub">Paste into settings</span>
          </div>

          <div class="deploy-targets">
            {#each clipboardTargets as target}
              <div class="deploy-target">
                <div class="deploy-target-info">
                  <span class="deploy-target-name">{target.label}</span>
                  <span class="deploy-target-hint">{target.hint}</span>
                </div>
                <div class="deploy-target-actions">
                  {#if target.url}
                    <a href={target.url} target="_blank" rel="noopener" class="deploy-btn-ghost" title="Open settings">
                      <Icon name="external" size={13} />
                    </a>
                  {/if}
                  <button
                    class="deploy-btn"
                    class:deploy-btn-copied={copiedPlatform === target.id}
                    onclick={() => copyToClipboard(target.id)}
                  >
                    {#if copiedPlatform === target.id}
                      <Icon name="check" size={14} />
                      Copied
                    {:else}
                      <Icon name="copy" size={14} />
                      Copy
                    {/if}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>

      </div>
    {/if}

  {:else}
    <!-- Empty state -->
    <div class="empty-state">
      <div class="empty-icon animate-fade-up" style="--delay: 0ms">
        <Icon name="download" size={40} />
      </div>
      <h1 class="empty-title animate-fade-up" style="--delay: 150ms">{t("export.no_profile")}</h1>
      <p class="empty-desc animate-fade-up" style="--delay: 300ms">{t("export.no_profile_desc")}</p>
      <div class="animate-fade-up" style="--delay: 450ms">
        <Button variant="primary" size="lg" onclick={() => goTo("home")}>
          {t("export.create_profile")}
          <Icon name="arrow-right" size={16} />
        </Button>
      </div>
    </div>
  {/if}
</div>

<style>
  .screen {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .header {
    padding: var(--sp-4) var(--sp-6) 0;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
    padding-bottom: var(--sp-3);
  }

  .header-title {
    font-size: var(--text-lg);
    font-weight: 500;
    margin: 0;
    color: var(--color-text);
  }

  .header-stats {
    display: flex;
    gap: var(--sp-2);
  }

  /* ─── Tabs ─── */
  .tabs {
    display: flex;
    gap: 2px;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    padding: var(--sp-2) var(--sp-3);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: -1px;
  }

  .tab:hover {
    color: var(--color-text-secondary);
  }

  .tab.tab-active {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
  }

  /* ─── Export tab (unchanged layout) ─── */
  .main {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .platforms {
    width: 260px;
    flex-shrink: 0;
    padding: var(--sp-4);
    border-right: 1px solid var(--color-border);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .platform-grid {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .preview-area {
    flex: 1;
    padding: var(--sp-4);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .no-preview {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-lg);
    color: var(--color-text-muted);
    font-size: var(--text-base);
  }

  :global(.settings-link) {
    width: 100%;
  }

  /* ─── Deploy tab ─── */
  .deploy-screen {
    flex: 1;
    overflow-y: auto;
    padding: var(--sp-4) var(--sp-6);
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    max-width: 640px;
  }

  .deploy-section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .deploy-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
  }

  .deploy-section-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
  }

  .deploy-section-sub {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-family: var(--font-mono);
  }

  .deploy-targets {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .deploy-target {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    transition: border-color 0.2s;
  }

  .deploy-target:hover {
    border-color: var(--color-border-hover);
  }

  .deploy-target-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .deploy-target-name {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text);
  }

  .deploy-target-path {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    background: oklch(from #ffffff l c h / 0.04);
    padding: 1px 4px;
    border-radius: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: inline-block;
    max-width: 200px;
  }

  .deploy-target-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 260px;
  }

  .deploy-target-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .deploy-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border-radius: var(--radius-sm);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .deploy-btn:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .deploy-btn.deploy-btn-copied {
    background: oklch(from var(--color-accent) l c h / 0.12);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .deploy-btn-ghost {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-xs);
    color: var(--color-text-muted);
    transition: color 0.2s;
    flex-shrink: 0;
  }

  .deploy-btn-ghost:hover {
    color: var(--color-text-secondary);
  }

  .deploy-all-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-4);
    border-radius: var(--radius-md);
    background: var(--color-accent-bg);
    border: 1px solid var(--color-accent-border);
    color: var(--color-accent);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    align-self: flex-start;
  }

  .deploy-all-btn:hover {
    background: oklch(from #29ef82 l c h / 0.12);
    transform: translateY(-1px);
  }

  /* ─── Empty state ─── */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--sp-8);
  }

  .empty-icon {
    margin-bottom: var(--sp-4);
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
    color: var(--color-text-secondary);
    margin: var(--sp-2) 0 0 0;
    max-width: 300px;
    line-height: 1.5;
  }

  @media (max-width: 768px) {
    .main {
      flex-direction: column;
    }

    .platforms {
      width: 100%;
      border-right: none;
      border-bottom: 1px solid var(--color-border);
      max-height: 240px;
    }

    .platform-grid {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 6px;
    }

    .deploy-screen {
      padding: var(--sp-4);
    }
  }

  /* AI Compile Toggle */
  .ai-toggle-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0 1rem;
  }

  .ai-toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.85rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: all 0.2s;
  }

  .ai-toggle.active {
    background: oklch(from var(--color-accent) l c h / 0.15);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .ai-toggle-sub {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    opacity: 0.7;
  }

  .ai-compiling-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem 2rem;
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

  /* Rule Validation */
  .rule-validation-section {
    padding-top: var(--sp-2);
  }

  .validate-btn {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: all 0.2s;
  }

  .validate-btn:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .validation-results {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .validation-summary {
    display: flex;
    gap: 0.5rem;
  }

  .quality-pill {
    padding: 0.2rem 0.6rem;
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 500;
  }

  .quality-pill.high {
    background: oklch(0.45 0.15 145 / 0.15);
    color: oklch(0.45 0.15 145);
  }

  .quality-pill.medium {
    background: oklch(0.65 0.15 85 / 0.15);
    color: oklch(0.65 0.15 85);
  }

  .quality-pill.low {
    background: oklch(0.55 0.2 25 / 0.15);
    color: oklch(0.55 0.2 25);
  }

  .weak-rules {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .weak-rule-item {
    padding: 0.75rem;
    border: 1px solid oklch(from var(--color-text) l c h / 0.08);
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
  }

  .weak-rule-original {
    margin: 0 0 0.25rem;
    color: var(--color-text-muted);
    text-decoration: line-through;
    opacity: 0.6;
  }

  .weak-rule-problem {
    margin: 0 0 0.25rem;
    color: oklch(0.55 0.2 25);
  }

  .weak-rule-fix {
    margin: 0;
    color: oklch(0.45 0.15 145);
    font-weight: 500;
  }

  .deploy-error {
    font-size: var(--text-xs);
    color: oklch(0.55 0.2 25);
    margin: 0;
    padding: var(--sp-1) 0;
  }
</style>
