<script lang="ts">
  import BreathingLogo from "../components/BreathingLogo.svelte";
  import Icon from "../components/Icon.svelte";
  import StatPill from "../components/StatPill.svelte";
  import { goTo, hasProfile, getProfile, setProfile, hasApiKey } from "../lib/stores/app.svelte.js";
  import { initProfiling, initDeepening, initSmartDeepen, initCategoryDeepening, initRapidProfiling } from "../lib/stores/profiling.svelte.js";
  import { detectBrowserSignals } from "@meport/core/browser-detect";
  import { isFileScanAvailable } from "@meport/core/file-scanner";
  import { mergeImportedProfile, instructionsToProfile } from "@meport/core/importer";
  import { getCategoryCompleteness } from "../lib/profile-display.js";
  import { isTauri, discoverAIConfigs, pickFolder, readFile } from "../lib/tauri-bridge.js";
  import { t } from "../lib/i18n.svelte.js";
  import type { PersonaProfile } from "@meport/core/types";
  let profileExists = $derived(hasProfile());
  let profile = $derived(getProfile());
  let apiConfigured = $derived(hasApiKey());

  let dimensionCount = $derived(profile ? Object.keys(profile.explicit).length : 0);
  let inferredCount = $derived(profile ? Object.keys(profile.inferred).length : 0);
  let completeness = $derived(profile?.completeness ?? 0);

  // Onboarding state
  let userName = $state("");
  let nameInput: HTMLInputElement;

  // Browser signals — detected on mount
  let detectedSignals = $state<{ label: string; value: string }[]>([]);
  let signalsReady = $state(false);

  $effect(() => {
    if (profileExists) return;
    const signals = detectBrowserSignals();
    const items: { label: string; value: string }[] = [];
    if (signals["identity.locale"]) items.push({ label: t("scan.language"), value: signals["identity.locale"].toUpperCase() });
    if (signals["identity.timezone"]) items.push({ label: t("scan.timezone"), value: signals["identity.timezone"].split("/").pop() ?? "" });
    if (signals["context.platform"]) items.push({ label: t("scan.platform"), value: signals["context.platform"] });
    detectedSignals = items;
    setTimeout(() => { signalsReady = true; }, 600);
  });

  /** Save name to a seed profile before starting */
  function seedProfileWithName() {
    if (!userName.trim()) return;
    const nameDim = {
      dimension: "identity.preferred_name",
      value: userName.trim(),
      confidence: 1.0 as const,
      source: "explicit" as const,
      question_id: "t0_q01",
    };
    const existing = getProfile();
    if (existing) {
      existing.explicit["identity.preferred_name"] = nameDim;
      setProfile(existing);
    } else {
      const now = new Date().toISOString();
      setProfile({
        schema_version: "1.0",
        profile_type: "personal",
        profile_id: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
        completeness: 2,
        explicit: { "identity.preferred_name": nameDim },
        inferred: {},
        compound: {},
        contradictions: [],
        emergent: [],
        meta: {
          tiers_completed: [],
          tiers_skipped: [],
          total_questions_answered: 0,
          total_questions_skipped: 0,
          avg_response_time_ms: 0,
          profiling_duration_ms: 0,
          profiling_method: "interactive",
          layer3_available: false,
          session_count: 1,
          last_session_date: now,
        },
      });
    }
  }

  function startWithAI() {
    if (!apiConfigured) {
      goTo("settings");
      return;
    }
    seedProfileWithName();
    initRapidProfiling();
    goTo("profiling");
  }

  function startWithQuestions() {
    seedProfileWithName();
    initProfiling("essential");
    goTo("profiling");
  }

  function handleNameKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && userName.trim()) {
      if (apiConfigured) startWithAI();
      else startWithQuestions();
    }
  }

  // Category completeness for smart deepen UI
  let catStats = $derived(profile ? getCategoryCompleteness(profile) : []);
  let showDeepen = $state(false);
  let showCategories = $state(false);

  function smartDeepen() {
    const existing = getProfile();
    if (existing) {
      initSmartDeepen(existing);
      goTo("profiling");
    }
    showDeepen = false;
  }

  // ─── Refresh ──────────────────────────────────────────────
  let showRefresh = $state(false);
  let refreshing = $state(false);

  interface RefreshChange {
    dimension: string;
    old: string;
    current: string;
  }

  let refreshChanges = $state<RefreshChange[]>([]);

  async function runRefresh() {
    if (!profile) return;
    refreshing = true;
    refreshChanges = [];

    await new Promise(r => setTimeout(r, 300)); // short pause so the spinner shows

    const newSignals = detectBrowserSignals();
    const changes: RefreshChange[] = [];

    // Compare locale
    if (newSignals["identity.locale"]) {
      const cur = profile.explicit["identity.locale"]?.value ?? profile.inferred["identity.locale"]?.value;
      if (cur && String(cur) !== newSignals["identity.locale"]) {
        changes.push({ dimension: "identity.locale", old: String(cur), current: newSignals["identity.locale"] });
      }
    }

    // Compare platform
    if (newSignals["context.platform"]) {
      const cur = profile.explicit["context.platform"]?.value ?? profile.inferred["context.platform"]?.value;
      if (cur && String(cur) !== newSignals["context.platform"]) {
        changes.push({ dimension: "context.platform", old: String(cur), current: newSignals["context.platform"] });
      }
    }

    // Compare device class
    if (newSignals["context.device"]) {
      const cur = profile.inferred["context.device"]?.value;
      if (cur && String(cur) !== newSignals["context.device"]) {
        changes.push({ dimension: "context.device", old: String(cur), current: newSignals["context.device"] });
      }
    }

    refreshChanges = changes;
    refreshing = false;
  }

  function applyRefreshChanges() {
    const existing = getProfile();
    if (!existing) return;

    const newSignals = detectBrowserSignals();
    const now = new Date().toISOString();
    const updated = { ...existing, updated_at: now };

    for (const change of refreshChanges) {
      // Apply as inferred signal (browser-detected)
      updated.inferred[change.dimension] = {
        dimension: change.dimension,
        value: change.current,
        confidence: 0.9,
        source: "behavioral",
        signal_id: "browser_refresh",
        override: "secondary",
      } as any;
    }

    setProfile(updated);
    refreshChanges = [];
    showRefresh = false;
  }

  // ─── Discover ─────────────────────────────────────────────
  let showDiscover = $state(false);
  let discovering = $state(false);
  let discoverError = $state("");

  interface DiscoveredFile {
    name: string;
    path: string;
    platform: string;
    handle?: FileSystemFileHandle;
    tauriPath?: string;
    content?: string;
    imported?: boolean;
  }

  let discoveredFiles = $state<DiscoveredFile[]>([]);
  let fileScanAvailable = $derived(isTauri() || isFileScanAvailable());

  const AI_CONFIG_FILES = [
    { pattern: /^CLAUDE\.md$/i, platform: "Claude Code" },
    { pattern: /^\.cursorrules$/i, platform: "Cursor" },
    { pattern: /^\.windsurfrules$/i, platform: "Windsurf" },
    { pattern: /^AGENTS\.md$/i, platform: "AGENTS.md" },
    { pattern: /^Modelfile$/i, platform: "Ollama" },
    { pattern: /^copilot-instructions\.md$/i, platform: "GitHub Copilot" },
    { pattern: /^SOUL\.md$/i, platform: "OpenClaw" },
    { pattern: /^meport-rules\.md$/i, platform: "Meport" },
    { pattern: /^meport-profile\.md$/i, platform: "Meport" },
    { pattern: /^\.mdc$/i, platform: "Cursor MDC" },
  ];

  async function runDiscover() {
    if (!isTauri() && !fileScanAvailable) return;
    discovering = true;
    discoverError = "";
    discoveredFiles = [];

    try {
      if (isTauri()) {
        const folder = await pickFolder();
        if (!folder) {
          discovering = false;
          return;
        }
        const files = await discoverAIConfigs(folder);
        discoveredFiles = files.map(f => ({
          name: f.filename,
          path: f.path,
          platform: f.platform,
          tauriPath: f.path,
        }));
      } else {
        const dirHandle = await (window as any).showDirectoryPicker({ mode: "read" });
        const found: DiscoveredFile[] = [];

        async function walk(handle: FileSystemDirectoryHandle, path: string, depth: number) {
          if (depth > 3) return;
          for await (const entry of (handle as any).values()) {
            const fullPath = path ? `${path}/${entry.name}` : entry.name;
            if (entry.kind === "directory") {
              if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
              await walk(entry, fullPath, depth + 1);
            } else {
              const match = AI_CONFIG_FILES.find(c => c.pattern.test(entry.name));
              if (match) {
                found.push({ name: entry.name, path: fullPath, platform: match.platform, handle: entry });
              }
            }
          }
        }

        await walk(dirHandle, "", 0);
        discoveredFiles = found;
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        discoverError = "Could not scan directory. Try again.";
      }
    } finally {
      discovering = false;
    }
  }

  async function importDiscoveredFile(file: DiscoveredFile) {
    try {
      let content: string;
      if (file.tauriPath) {
        content = await readFile(file.tauriPath);
      } else if (file.handle) {
        const f = await file.handle.getFile();
        content = await f.text();
      } else {
        return;
      }

      const existing = getProfile();
      if (!existing) return;

      const imported = instructionsToProfile(content, file.platform.toLowerCase());
      const merged = mergeImportedProfile(existing, imported);
      setProfile(merged);

      // Mark as imported in UI
      discoveredFiles = discoveredFiles.map(df =>
        df.path === file.path ? { ...df, imported: true } : df
      );
    } catch {
      // silently fail — file read errors are non-critical
    }
  }
</script>

<div class="screen">
  <div class="ambient-glow"></div>
  <div class="ambient-glow-2"></div>

  <div class="content">
    {#if profileExists}
      <!-- Dashboard -->
      <div class="dashboard">
        {#if !apiConfigured}
          <button class="api-banner animate-fade-up" style="--delay: 0ms" onclick={() => goTo("settings")}>
            <Icon name="settings" size={14} />
            <span class="api-banner-text">{t("home.no_api_banner")}</span>
            <span class="api-banner-action">{t("home.add_key")} →</span>
          </button>
        {/if}

        <div class="logo-wrap animate-fade-up" style="--delay: 0ms">
          <BreathingLogo />
        </div>

        <h1 class="dash-title animate-fade-up" style="--delay: 150ms">
          {t("home.active")}
        </h1>

        <div class="stats-row animate-fade-up" style="--delay: 300ms">
          <StatPill value={dimensionCount + inferredCount} label={t("home.dimensions")} />
          <StatPill value="{completeness}%" label={t("home.complete")} />
        </div>

        {#if completeness < 50}
          <!-- Low completeness: prominent deepening prompt -->
          <div class="dash-deepen-prompt animate-fade-up" style="--delay: 400ms">
            <p class="deepen-prompt-text">{t("home.low_complete_hint")}</p>
            <div class="deepen-prompt-actions">
              {#if apiConfigured}
                <button class="deepen-prompt-btn primary" onclick={() => { initRapidProfiling(); goTo("profiling"); }}>
                  <Icon name="sparkle" size={14} />
                  {t("home.add_ai_data")}
                </button>
              {/if}
              <button class="deepen-prompt-btn" onclick={smartDeepen}>
                <Icon name="message-circle" size={14} />
                {t("home.answer_questions")}
              </button>
            </div>
          </div>
        {/if}

        <div class="dash-actions animate-fade-up" style="--delay: {completeness < 50 ? 550 : 450}ms">
          <button class="action-card" onclick={() => goTo("export")}>
            <Icon name="download" size={20} />
            <span class="action-title">{t("home.export")}</span>
            <span class="action-desc">{t("home.platforms")}</span>
          </button>

          <button class="action-card" onclick={() => { showDeepen = true; showRefresh = false; showDiscover = false; }}>
            <Icon name="plus" size={20} />
            <span class="action-title">{t("home.deepen")}</span>
            <span class="action-desc">{t("home.add_more")}</span>
          </button>

          <button class="action-card" onclick={() => { showRefresh = !showRefresh; showDeepen = false; showDiscover = false; if (showRefresh) runRefresh(); }}>
            <Icon name="activity" size={20} />
            <span class="action-title">{t("home.refresh")}</span>
            <span class="action-desc">{t("home.refresh_desc")}</span>
          </button>

          {#if fileScanAvailable}
            <button class="action-card" onclick={() => { showDiscover = !showDiscover; showDeepen = false; showRefresh = false; }}>
              <Icon name="scan" size={20} />
              <span class="action-title">{t("home.discover")}</span>
              <span class="action-desc">{t("home.discover_desc")}</span>
            </button>
          {/if}

          <button class="action-card" onclick={() => goTo("settings")}>
            <Icon name="settings" size={20} />
            <span class="action-title">{t("home.settings")}</span>
            <span class="action-desc">{apiConfigured ? t("home.ai_connected") : t("home.connect_ai")}</span>
          </button>
        </div>

        {#if showDeepen}
          <div class="deepen-panel animate-fade-up" style="--delay: 0ms">
            <div class="deepen-header">
              <span class="deepen-title">{t("home.deepen_pick")}</span>
              <button class="deepen-close" onclick={() => { showDeepen = false; }}>
                <Icon name="x" size={14} />
              </button>
            </div>

            {#if apiConfigured}
              <button class="deepen-smart" onclick={() => { initRapidProfiling(); goTo("profiling"); showDeepen = false; }}>
                <Icon name="upload" size={16} />
                <div class="deepen-smart-text">
                  <span class="deepen-smart-title">{t("home.deepen_import")}</span>
                  <span class="deepen-smart-sub">{t("home.deepen_import_sub")}</span>
                </div>
                <Icon name="arrow-right" size={14} />
              </button>
            {/if}

            <button class="deepen-smart" onclick={smartDeepen}>
              <Icon name="sparkle" size={16} />
              <div class="deepen-smart-text">
                <span class="deepen-smart-title">{t("home.deepen_smart")}</span>
                <span class="deepen-smart-sub">{t("home.deepen_smart_sub")}</span>
              </div>
              <Icon name="arrow-right" size={14} />
            </button>

            <!-- Categories — collapsible -->
            <button class="deepen-cats-toggle" onclick={() => { showCategories = !showCategories; }}>
              <span>{t("home.deepen_by_category")}</span>
              <Icon name={showCategories ? "chevron-up" : "chevron-down"} size={14} />
            </button>

            {#if showCategories}
              <div class="deepen-cats animate-fade-up">
                {#each catStats as cat}
                  <button
                    class="deepen-cat"
                    class:deepen-cat-full={cat.percent >= 80}
                    onclick={() => {
                      const existing = getProfile();
                      if (existing) { initCategoryDeepening(existing, cat.id); goTo("profiling"); }
                      showDeepen = false;
                    }}
                  >
                    <div class="deepen-cat-info">
                      <span class="deepen-cat-name">{t(`category.${cat.id}`)}</span>
                      <span class="deepen-cat-stat">{cat.filled}/{cat.total}</span>
                    </div>
                    <div class="deepen-cat-bar">
                      <div class="deepen-cat-fill" style="width: {cat.percent}%"></div>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Refresh panel -->
        {#if showRefresh}
          <div class="deepen-panel animate-fade-up" style="--delay: 0ms">
            <div class="deepen-header">
              <span class="deepen-title">{t("home.refresh_title")}</span>
              <button class="deepen-close" onclick={() => { showRefresh = false; }}>
                <Icon name="x" size={14} />
              </button>
            </div>

            {#if refreshing}
              <div class="refresh-loading">
                <div class="refresh-spinner"></div>
                <span>{t("home.refresh_loading")}</span>
              </div>
            {:else if refreshChanges.length === 0}
              <div class="refresh-empty">
                <Icon name="check" size={16} />
                <span>{t("home.refresh_up_to_date")}</span>
              </div>
            {:else}
              <div class="refresh-changes">
                {#each refreshChanges as change}
                  <div class="refresh-change-row">
                    <span class="refresh-dim">{change.dimension}</span>
                    <span class="refresh-old">{change.old}</span>
                    <span class="refresh-arrow">→</span>
                    <span class="refresh-new">{change.current}</span>
                  </div>
                {/each}
              </div>
              <button class="deepen-smart" onclick={applyRefreshChanges}>
                <Icon name="check" size={16} />
                <div class="deepen-smart-text">
                  <span class="deepen-smart-title">{t("home.refresh_apply", { count: String(refreshChanges.length), suffix: refreshChanges.length > 1 ? "s" : "" })}</span>
                  <span class="deepen-smart-sub">{t("home.refresh_apply_sub")}</span>
                </div>
                <Icon name="arrow-right" size={14} />
              </button>
            {/if}
          </div>
        {/if}

        <!-- Discover panel -->
        {#if showDiscover}
          <div class="deepen-panel animate-fade-up" style="--delay: 0ms">
            <div class="deepen-header">
              <span class="deepen-title">{t("home.discover_title")}</span>
              <button class="deepen-close" onclick={() => { showDiscover = false; discoveredFiles = []; }}>
                <Icon name="x" size={14} />
              </button>
            </div>

            {#if !discovering && discoveredFiles.length === 0 && !discoverError}
              <button class="deepen-smart" onclick={runDiscover}>
                <Icon name="folder" size={16} />
                <div class="deepen-smart-text">
                  <span class="deepen-smart-title">{t("home.discover_scan_folder")}</span>
                  <span class="deepen-smart-sub">{t("home.discover_scan_folder_sub")}</span>
                </div>
                <Icon name="arrow-right" size={14} />
              </button>
            {:else if discovering}
              <div class="refresh-loading">
                <div class="refresh-spinner"></div>
                <span>{t("home.discover_scanning")}</span>
              </div>
            {:else if discoverError}
              <p class="discover-error">{discoverError}</p>
              <button class="deepen-cats-toggle" onclick={runDiscover}>{t("home.discover_scan_again")}</button>
            {:else if discoveredFiles.length === 0}
              <div class="refresh-empty">
                <Icon name="search" size={16} />
                <span>{t("home.discover_empty")}</span>
              </div>
              <button class="deepen-cats-toggle" onclick={runDiscover}>{t("home.discover_try_another")}</button>
            {:else}
              <div class="discover-files">
                {#each discoveredFiles as file}
                  <div class="discover-file">
                    <div class="discover-file-info">
                      <span class="discover-file-platform">{file.platform}</span>
                      <code class="discover-file-path">{file.path}</code>
                    </div>
                    {#if file.imported}
                      <span class="discover-imported">
                        <Icon name="check" size={13} />
                        {t("home.discover_imported")}
                      </span>
                    {:else}
                      <button class="deploy-btn" onclick={() => importDiscoveredFile(file)}>
                        <Icon name="import" size={13} />
                        {t("home.discover_import")}
                      </button>
                    {/if}
                  </div>
                {/each}
              </div>
              <button class="deepen-cats-toggle" onclick={runDiscover}>{t("home.discover_scan_another")}</button>
            {/if}
          </div>
        {/if}

      </div>

    {:else}
      <!-- Onboarding — clean, focused -->
      <div class="welcome">
        <div class="logo-wrap animate-fade-up" style="--delay: 0ms">
          <BreathingLogo />
        </div>

        <h1 class="headline animate-fade-up" style="--delay: 150ms">meport</h1>

        <p class="tagline animate-fade-up" style="--delay: 250ms">
          {t("home.tagline")}
        </p>

        <!-- Name input — first engagement -->
        <div class="name-section animate-fade-up" style="--delay: 400ms">
          <label class="name-label" for="name-input">{t("home.whats_your_name")}</label>
          <input
            bind:this={nameInput}
            bind:value={userName}
            id="name-input"
            class="name-input"
            type="text"
            placeholder={t("home.name_placeholder")}
            autocomplete="given-name"
            onkeydown={handleNameKeydown}
          />
        </div>

        <!-- Detected signals — subtle, inline -->
        {#if detectedSignals.length > 0 && signalsReady}
          <div class="detected-line animate-fade-up" style="--delay: 600ms">
            {#each detectedSignals as sig, i}
              <span class="det-chip">{sig.label} <strong>{sig.value}</strong></span>
              {#if i < detectedSignals.length - 1}<span class="det-sep">·</span>{/if}
            {/each}
          </div>
        {/if}

        <!-- Primary CTA -->
        <div class="cta-area animate-fade-up" style="--delay: 700ms">
          <button
            class="cta-main"
            onclick={startWithAI}
            disabled={!userName.trim()}
          >
            <Icon name="sparkle" size={16} />
            {apiConfigured ? t("home.start_ai") : t("home.start_profiling")}
          </button>

          {#if apiConfigured}
            <button class="cta-alt" onclick={startWithQuestions} disabled={!userName.trim()}>
              {t("home.or_questions")}
            </button>
          {:else}
            <button class="cta-alt" onclick={() => goTo("settings")}>
              {t("home.or_connect_ai")}
            </button>
          {/if}
        </div>

        <p class="trust-line animate-fade-up" style="--delay: 800ms">
          {t("home.trust")}
        </p>

        <!-- Before/after demo — no API key needed, hardcoded -->
        <div class="demo-preview animate-fade-up" style="--delay: 950ms">
          <h3 class="demo-heading">See the difference</h3>
          <div class="demo-columns">
            <div class="demo-col demo-col-bad">
              <span class="demo-label demo-label-bad">Without Meport</span>
              <p class="demo-q">"Plan me a weekend trip with my dog"</p>
              <p class="demo-a demo-a-bad">I'd love to help! Where are you traveling from? What's your budget? Mountains or sea? What breed is your dog? Here are 10 popular destinations...</p>
            </div>
            <div class="demo-col demo-col-good">
              <span class="demo-label demo-label-good">With Meport</span>
              <p class="demo-q">"Plan me a weekend trip with my dog"</p>
              <p class="demo-a demo-a-good"><em>Kraków, mountains, labrador</em> — budget ~$120.<br><strong>Szczawnica</strong>, 2h drive. Cabin with garden, dogs OK, $70/night.<br>Saturday: river rafting + easy trail.<br><strong>~$115 total.</strong> Book it?</p>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .screen {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    position: relative;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .ambient-glow {
    position: absolute;
    top: -30%;
    left: 50%;
    transform: translateX(-50%);
    width: 120%;
    height: 70%;
    background: radial-gradient(
      ellipse at center,
      oklch(from #29ef82 l c h / 0.05) 0%,
      oklch(from #1ec9c9 l c h / 0.02) 40%,
      transparent 70%
    );
    pointer-events: none;
    animation: breathing 6s ease-in-out infinite;
  }

  .ambient-glow-2 {
    position: absolute;
    bottom: -40%;
    left: 30%;
    width: 60%;
    height: 50%;
    background: radial-gradient(
      ellipse at center,
      oklch(from #1ec9c9 l c h / 0.03) 0%,
      transparent 60%
    );
    pointer-events: none;
    animation: breathing 8s ease-in-out infinite reverse;
  }

  .content {
    position: relative;
    width: 100%;
    max-width: 640px;
    padding: var(--sp-8) var(--sp-6);
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .logo-wrap {
    margin-bottom: var(--sp-4);
  }

  /* ─── Onboarding ─── */
  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    width: 100%;
    max-width: 400px;
  }

  .headline {
    font-size: var(--text-2xl);
    font-weight: 700;
    color: oklch(from #ffffff l c h / 0.92);
    margin: 0;
    letter-spacing: -0.04em;
    line-height: 1.1;
  }

  .tagline {
    font-size: var(--text-base);
    font-weight: 300;
    color: var(--color-text-secondary);
    margin: var(--sp-2) 0 0 0;
  }

  /* Name input */
  .name-section {
    width: 100%;
    margin-top: var(--sp-8);
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .name-label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text);
    text-align: left;
  }

  .name-input {
    width: 100%;
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--radius-md);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    color: var(--color-text);
    font-size: var(--text-lg);
    font-family: var(--font-sans);
    font-weight: 500;
    box-sizing: border-box;
    transition: border-color 0.2s;
    outline: none;
  }

  .name-input:focus {
    border-color: var(--color-accent);
  }

  .name-input::placeholder {
    color: var(--color-text-ghost);
    font-weight: 300;
  }

  /* Detected signals — single subtle line */
  .detected-line {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-top: var(--sp-3);
    flex-wrap: wrap;
    justify-content: center;
  }

  .det-chip {
    font-size: var(--text-micro);
    color: var(--color-text-muted);
    font-family: var(--font-mono);
  }

  .det-chip strong {
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .det-sep {
    color: var(--color-text-ghost);
    font-size: var(--text-micro);
  }

  /* CTA area */
  .cta-area {
    width: 100%;
    margin-top: var(--sp-6);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
  }

  .cta-main {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-6);
    border-radius: var(--radius-md);
    background: var(--color-accent);
    color: #080a09;
    font-size: var(--text-base);
    font-weight: 600;
    font-family: var(--font-sans);
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }

  .cta-main:hover:not(:disabled) {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
    box-shadow: 0 8px 24px oklch(from #29ef82 l c h / 0.20);
  }

  .cta-main:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    transform: none;
  }

  .cta-main:active:not(:disabled) {
    transform: translateY(0);
  }

  .cta-alt {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--radius-xs);
    transition: color 0.2s;
  }

  .cta-alt:hover:not(:disabled) {
    color: var(--color-text-secondary);
  }

  .cta-alt:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* Trust line */
  .trust-line {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-ghost);
    margin: var(--sp-6) 0 0 0;
    letter-spacing: 0.02em;
  }

  /* API banner */
  .api-banner {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    width: 100%;
    padding: var(--sp-2) var(--sp-3);
    margin-bottom: var(--sp-4);
    border-radius: var(--radius-sm);
    background: oklch(from #f59e0b l c h / 0.08);
    border: 1px solid oklch(from #f59e0b l c h / 0.20);
    color: oklch(from #f59e0b l c h / 0.85);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all 0.2s;
  }

  .api-banner:hover {
    background: oklch(from #f59e0b l c h / 0.12);
    border-color: oklch(from #f59e0b l c h / 0.30);
  }

  .api-banner-text {
    flex: 1;
    text-align: left;
  }

  .api-banner-action {
    font-weight: 600;
    white-space: nowrap;
  }

  /* ─── Dashboard ─── */
  .dashboard {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    width: 100%;
  }

  .dash-title {
    font-size: var(--text-lg);
    font-weight: 500;
    color: var(--color-text);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .stats-row {
    display: flex;
    gap: var(--sp-3);
    margin-top: var(--sp-4);
  }

  /* Low completeness prompt */
  .dash-deepen-prompt {
    width: 100%;
    margin-top: var(--sp-6);
    padding: var(--sp-4);
    border-radius: var(--radius-lg);
    background: oklch(from #29ef82 l c h / 0.06);
    border: 1px solid oklch(from #29ef82 l c h / 0.15);
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .deepen-prompt-text {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0;
    text-align: center;
    line-height: 1.4;
  }

  .deepen-prompt-actions {
    display: flex;
    gap: var(--sp-2);
    justify-content: center;
  }

  .deepen-prompt-btn {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-4);
    border-radius: var(--radius-md);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .deepen-prompt-btn:hover {
    border-color: var(--color-border-hover);
    background: var(--color-bg-hover);
    color: var(--color-text);
  }

  .deepen-prompt-btn.primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: #080a09;
    font-weight: 600;
  }

  .deepen-prompt-btn.primary:hover {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px oklch(from #29ef82 l c h / 0.20);
  }

  .dash-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: var(--sp-3);
    margin-top: var(--sp-6);
    width: 100%;
  }

  .action-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-6) var(--sp-3);
    border-radius: var(--radius-lg);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    cursor: pointer;
    transition: all 0.2s;
    color: var(--color-accent);
    font-family: var(--font-sans);
  }

  .action-card:hover {
    border-color: var(--color-border-hover);
    background: var(--color-bg-hover);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }

  .action-title {
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--color-text);
  }

  .action-desc {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  /* ─── Deepen panel ─── */
  .deepen-panel {
    width: 100%;
    margin-top: var(--sp-4);
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .deepen-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .deepen-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
  }

  .deepen-close {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: var(--sp-1);
    border-radius: var(--radius-xs);
    display: flex;
    transition: color 0.2s;
  }

  .deepen-close:hover {
    color: var(--color-text);
  }

  .deepen-smart {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--radius-md);
    background: var(--color-accent-bg);
    border: 1px solid var(--color-accent-border);
    color: var(--color-accent);
    cursor: pointer;
    transition: all 0.2s;
    font-family: var(--font-sans);
    text-align: left;
  }

  .deepen-smart:hover {
    background: oklch(from #29ef82 l c h / 0.12);
    transform: translateY(-1px);
  }

  .deepen-smart-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .deepen-smart-title {
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .deepen-smart-sub {
    font-size: var(--text-xs);
    opacity: 0.7;
  }

  .deepen-cats-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--sp-2) 0;
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: color 0.2s;
  }

  .deepen-cats-toggle:hover {
    color: var(--color-text-secondary);
  }

  .deepen-cats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-2);
  }

  .deepen-cat {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    cursor: pointer;
    transition: all 0.2s;
    font-family: var(--font-sans);
    text-align: left;
  }

  .deepen-cat:hover {
    border-color: var(--color-border-hover);
    background: var(--color-bg-hover);
  }

  .deepen-cat-full {
    opacity: 0.5;
  }

  .deepen-cat-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .deepen-cat-name {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
  }

  .deepen-cat-stat {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-muted);
  }

  .deepen-cat-bar {
    height: 3px;
    background: oklch(from #ffffff l c h / 0.06);
    border-radius: 2px;
    overflow: hidden;
  }

  .deepen-cat-fill {
    height: 100%;
    background: var(--color-accent);
    border-radius: 2px;
    transition: width 0.5s ease;
  }

  @media (max-width: 500px) {
    .dash-actions { grid-template-columns: 1fr; }
  }

  /* ─── Refresh panel ─── */
  .refresh-loading {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .refresh-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid oklch(from var(--color-accent) l c h / 0.3);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .refresh-empty {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .refresh-changes {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--sp-2) 0;
  }

  .refresh-change-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
  }

  .refresh-dim {
    color: var(--color-text-muted);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .refresh-old {
    color: oklch(0.55 0.2 25);
    text-decoration: line-through;
    opacity: 0.7;
  }

  .refresh-arrow {
    color: var(--color-text-ghost);
  }

  .refresh-new {
    color: oklch(0.45 0.15 145);
    font-weight: 500;
  }

  /* ─── Discover panel ─── */
  .discover-files {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .discover-file {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
  }

  .discover-file-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .discover-file-platform {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-accent);
  }

  .discover-file-path {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
    display: inline-block;
  }

  .discover-imported {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--text-xs);
    color: oklch(0.45 0.15 145);
    font-weight: 500;
    flex-shrink: 0;
  }

  /* reuse .deploy-btn from ExportScreen via local re-declaration */
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

  .discover-error {
    font-size: var(--text-sm);
    color: oklch(0.55 0.2 25);
    padding: var(--sp-2) var(--sp-3);
    margin: 0;
  }

  /* ─── Before/After demo ─── */
  .demo-preview {
    width: 100%;
    margin-top: var(--sp-8);
  }

  .demo-heading {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
    text-align: center;
    margin: 0 0 var(--sp-3) 0;
  }

  .demo-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-3);
  }

  .demo-col {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }

  .demo-col-bad {
    background: oklch(from #ef4444 l c h / 0.04);
    border-color: oklch(from #ef4444 l c h / 0.18);
  }

  .demo-col-good {
    background: oklch(from #29ef82 l c h / 0.04);
    border-color: oklch(from #29ef82 l c h / 0.18);
  }

  .demo-label {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }

  .demo-label-bad {
    color: oklch(from #ef4444 l c h / 0.65);
  }

  .demo-label-good {
    color: oklch(from #29ef82 l c h / 0.75);
  }

  .demo-q {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    font-style: italic;
    margin: 0;
    line-height: 1.4;
  }

  .demo-a {
    font-size: var(--text-xs);
    margin: 0;
    line-height: 1.5;
  }

  .demo-a-bad {
    color: var(--color-text-muted);
  }

  .demo-a-good {
    color: var(--color-text-secondary);
  }

  .demo-a-good em {
    color: var(--color-text-muted);
    font-style: normal;
  }

  .demo-a-good strong {
    color: oklch(from #29ef82 l c h / 0.85);
    font-weight: 600;
  }

  @media (max-width: 400px) {
    .demo-columns { grid-template-columns: 1fr; }
  }
</style>
