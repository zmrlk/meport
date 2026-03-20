<script lang="ts">
  import BreathingLogo from "../components/BreathingLogo.svelte";
  import Icon from "../components/Icon.svelte";
  import Button from "../components/Button.svelte";
  import SectionLabel from "../components/SectionLabel.svelte";
  import { hasProfile, getProfile, importProfile, clearProfile, goTo, setProfile, hasApiKey, getApiKey, getApiProvider } from "../lib/stores/app.svelte.js";
  import { initProfiling, initDeepening, initCategoryDeepening } from "../lib/stores/profiling.svelte.js";
  import { instructionsToProfile, mergeImportedProfile } from "@meport/core/importer";
  import { t, getLocale } from "../lib/i18n.svelte.js";
  import { groupDimensions, getSuggestions, getCategoryCompleteness, type CategoryGroup, type Suggestion } from "../lib/profile-display.js";
  import { getDimensionWeight } from "@meport/core/types";
  import { AIEnricher, type SynthesisResult } from "@meport/core/enricher";
  import { createAIClient } from "@meport/core/client";

  // ─── Tabs ───
  type ProfileTab = "overview" | "dimensions" | "report" | "history";
  let activeTab = $state<ProfileTab>("overview");

  let profileExists = $derived(hasProfile());
  let profile = $derived(getProfile());
  let locale = $derived(getLocale());

  let dimensionCount = $derived(profile ? Object.keys(profile.explicit).length : 0);
  let inferredCount = $derived(profile?.inferred ? Object.keys(profile.inferred).length : 0);
  let rawCompleteness = $derived(profile?.completeness ?? 0);
  let completeness = $derived(rawCompleteness > 1 ? rawCompleteness : rawCompleteness * 100);
  let totalDims = $derived(dimensionCount + inferredCount);

  let groups = $derived(profile ? groupDimensions(profile, locale) : []);
  let suggestions = $derived(profile ? getSuggestions(profile) : []);
  let categoryStats = $derived(profile ? getCategoryCompleteness(profile) : []);

  let expandedCat = $state<string | null>(null);
  let copySuccess = $state(false);
  let editingDim = $state<string | null>(null);
  let editValue = $state("");

  // ─── Overview tab (from CardScreen) ───
  let preferredName = $derived(
    profile ? String(profile.explicit["identity.preferred_name"]?.value || profile.explicit["identity.full_name"]?.value || profile.meta?.name || (locale === "pl" ? "Użytkownik" : "User")) : (locale === "pl" ? "Użytkownik" : "User")
  );
  let archetype = $derived(profile?.synthesis?.archetype ?? null);

  interface TopDim { key: string; value: string; icon: string; weight: number }
  let topDimensions: TopDim[] = $derived.by(() => {
    if (!profile) return [];
    const all: TopDim[] = [];
    for (const [key, val] of Object.entries(profile.explicit)) {
      const v = Array.isArray(val.value) ? val.value.join(", ") : String(val.value);
      all.push({ key, value: v, icon: iconForDim(key), weight: getDimensionWeight(key) });
    }
    for (const [key, val] of Object.entries(profile.inferred)) {
      all.push({ key, value: String(val.value), icon: iconForDim(key), weight: getDimensionWeight(key) });
    }
    all.sort((a, b) => b.weight - a.weight);
    return all.slice(0, 8);
  });

  const dimLabels: Record<string, string> = {
    preferred_name: "Imie", language: "Jezyk", role_type: "Rola", occupation: "Zawod",
    industry: "Branza", tech_stack: "Tech Stack", schedule: "Rytm pracy",
    motivation: "Motywacja", communication: "Komunikacja", core_motivation: "Motywacja",
    energy: "Energia", stress: "Stres", learning: "Nauka", work_style: "Styl pracy",
    self_description: "Opis", vision: "Wizja", life_stage: "Etap zycia",
  };

  function labelForDim(key: string): string {
    const short = key.split(".").pop() ?? key;
    return dimLabels[short] ?? short.replace(/_/g, " ");
  }

  function iconForDim(key: string): string {
    if (key.startsWith("identity")) return "user";
    if (key.startsWith("communication")) return "message";
    if (key.startsWith("cognitive")) return "brain";
    if (key.startsWith("work")) return "zap";
    if (key.startsWith("ai")) return "sparkle";
    if (key.startsWith("personality")) return "star";
    if (key.startsWith("expertise")) return "layers";
    return "target";
  }

  // ─── Report tab (from ReportScreen) ───
  let reportSynthesis = $state<SynthesisResult | null>(null);
  let reportLoading = $state(false);
  let reportError = $state("");

  async function generateReport() {
    if (!profile || !hasApiKey()) return;
    reportLoading = true;
    reportError = "";
    reportSynthesis = null;
    try {
      const provider = getApiProvider() as "claude" | "openai" | "gemini" | "grok" | "openrouter" | "ollama";
      const client = createAIClient({ provider, apiKey: provider !== "ollama" ? getApiKey() : undefined });
      const enricher = new AIEnricher(client, getLocale());
      reportSynthesis = await enricher.synthesize(profile.explicit, profile.inferred ?? {}, {});
    } catch (e) {
      reportError = e instanceof Error ? e.message : "Generation failed";
    } finally {
      reportLoading = false;
    }
  }

  // ─── History tab (from HistoryScreen) ───
  interface HistoryEntry {
    date: string; completeness: number; dimensionCount: number; snapshot: import("@meport/core/types").PersonaProfile;
  }
  function loadHistory(): HistoryEntry[] {
    try { const raw = localStorage.getItem("meport:history"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  }
  let history = $state<HistoryEntry[]>(loadHistory());
  let restoreSuccess = $state(false);
  function restoreSnapshot(entry: HistoryEntry) {
    if (!confirm(t("history.restore_confirm", { date: entry.date }))) return;
    setProfile(entry.snapshot);
    restoreSuccess = true;
    history = loadHistory();
    setTimeout(() => { restoreSuccess = false; }, 2500);
  }
  let showRawJson = $state(false);

  function toggleCategory(catId: string) {
    expandedCat = expandedCat === catId ? null : catId;
  }

  let uploadError = $state("");
  let fileInput: HTMLInputElement;

  let importText = $state("");
  let importPlatform = $state("chatgpt");
  let showImport = $state(false);

  function handleUpload() {
    fileInput?.click();
  }

  async function onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const ok = importProfile(text);
      if (!ok) {
        uploadError = t("profile.upload_error");
        setTimeout(() => { uploadError = ""; }, 4000);
      }
    } catch {
      uploadError = t("profile.file_error");
      setTimeout(() => { uploadError = ""; }, 4000);
    }
    input.value = "";
  }

  let importStats = $state<{ dims: number; rules: number } | null>(null);

  function handlePasteImport() {
    if (!importText.trim()) return;
    const jsonOk = importProfile(importText.trim());
    if (jsonOk) {
      importText = "";
      showImport = false;
      return;
    }
    const imported = instructionsToProfile(importText.trim(), importPlatform);
    const dimCount = Object.keys(imported.explicit).length + Object.keys(imported.inferred).length;
    const ruleCount = imported.synthesis?.exportRules?.length ?? 0;

    if (dimCount === 0 && ruleCount === 0) {
      uploadError = t("profile.import_parse_error");
      setTimeout(() => { uploadError = ""; }, 4000);
      return;
    }

    const existing = getProfile();
    if (existing) {
      const merged = mergeImportedProfile(existing, imported);
      setProfile(merged);
    } else {
      setProfile(imported);
    }

    importStats = { dims: dimCount, rules: ruleCount };
    importText = "";
    setTimeout(() => { importStats = null; }, 5000);
  }

  function handleClear() {
    if (confirm(t("profile.delete_confirm"))) {
      clearProfile();
    }
  }

  function downloadProfile() {
    if (!profile) return;
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "meport-profile.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function startProfiling() {
    const existing = getProfile();
    if (existing) {
      initDeepening(existing);
    } else {
      initProfiling("full");
    }
    goTo("profiling");
  }

  async function copyJson() {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(profile, null, 2));
      copySuccess = true;
      setTimeout(() => { copySuccess = false; }, 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = JSON.stringify(profile, null, 2);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      copySuccess = true;
      setTimeout(() => { copySuccess = false; }, 2000);
    }
  }

  function startEdit(dimKey: string, currentValue: string) {
    editingDim = dimKey;
    editValue = currentValue;
  }

  function saveEdit(dimKey: string) {
    if (!profile || !editValue.trim()) {
      editingDim = null;
      return;
    }
    const updated = { ...profile };
    if (updated.inferred[dimKey]) {
      updated.explicit[dimKey] = {
        dimension: dimKey,
        value: editValue.trim(),
        confidence: 1.0 as const,
        source: "explicit" as const,
        question_id: "manual_edit",
      };
      delete updated.inferred[dimKey];
    } else if (updated.explicit[dimKey]) {
      updated.explicit[dimKey] = {
        ...updated.explicit[dimKey],
        value: editValue.trim(),
      };
    }
    setProfile(updated);
    editingDim = null;
  }

  function cancelEdit() {
    editingDim = null;
    editValue = "";
  }

  function startCategory(categoryId: string) {
    const existing = getProfile();
    if (existing) {
      initCategoryDeepening(existing, categoryId);
    } else {
      initProfiling("full");
    }
    goTo("profiling");
  }
</script>

<input
  bind:this={fileInput}
  type="file"
  accept=".json,application/json"
  class="hidden-input"
  onchange={onFileSelected}
/>

<div class="page">
  <div class="page-content">
    {#if profileExists && profile}
      <!-- Header with tabs -->
      <div class="page-header animate-fade-up" style="--delay: 0ms">
        <h1 class="page-title">{t("profile.title")}</h1>

        <div class="tab-bar">
          <button class="tab-bar-item" class:active={activeTab === "overview"} onclick={() => activeTab = "overview"}>
            {t("profile.tab_overview")}
          </button>
          <button class="tab-bar-item" class:active={activeTab === "dimensions"} onclick={() => activeTab = "dimensions"}>
            {t("profile.tab_dimensions")}
          </button>
          <button class="tab-bar-item" class:active={activeTab === "report"} onclick={() => activeTab = "report"}>
            {t("profile.tab_report")}
          </button>
          <button class="tab-bar-item" class:active={activeTab === "history"} onclick={() => activeTab = "history"}>
            {t("profile.tab_history")}
          </button>
        </div>
      </div>

    <!-- ═══════ TAB: OVERVIEW (from Card) ═══════ -->
    {#if activeTab === "overview"}
      <div class="tab-content animate-fade-up">
        <div class="card">
          <div class="ov-header">
            <div>
              <h2 class="ov-name">{preferredName}</h2>
              {#if archetype}
                <span class="ov-archetype">{archetype}</span>
              {/if}
            </div>
            <span class="ov-badge">meport</span>
          </div>

          <div class="ov-completeness">
            <div class="progress-track"><div class="progress-fill" style="width: {completeness}%"></div></div>
            <span class="progress-label">{completeness}%</span>
          </div>

          <div class="ov-dims">
            {#each topDimensions as dim}
              <div class="ov-dim">
                <Icon name={dim.icon} size={12} />
                <span class="ov-dim-key">{labelForDim(dim.key)}</span>
                <span class="ov-dim-val">{dim.value}</span>
              </div>
            {/each}
          </div>
        </div>

        {#if profile.synthesis?.exportRules && profile.synthesis.exportRules.length > 0}
          <div class="ov-rules">
            <SectionLabel>{t("profile.top_rules")}</SectionLabel>
            {#each profile.synthesis.exportRules.slice(0, 5) as rule}
              <div class="ov-rule">
                <span class="rule-arrow">→</span>
                <span>{rule}</span>
              </div>
            {/each}
          </div>
        {/if}

        <div class="ov-actions">
          <Button variant="primary" size="md" onclick={startProfiling}>
            <Icon name="plus" size={16} />
            {t("profile.deepen_profile")}
          </Button>
        </div>
      </div>

    <!-- ═══════ TAB: DIMENSIONS (original Profile content) ═══════ -->
    {:else if activeTab === "dimensions"}

      <!-- Category completeness bars -->
      <div class="category-overview animate-fade-up" style="--delay: 200ms">
        {#each categoryStats as stat}
          {#if stat.filled > 0}
            <div class="cat-bar-row">
              <span class="cat-bar-label">{t(stat.label)}</span>
              <div class="cat-bar-track">
                <div
                  class="cat-bar-fill"
                  style="width: {stat.percent}%; background: {groups.find(g => g.category.id === stat.id)?.category.color || 'var(--color-accent)'}"
                ></div>
              </div>
              <span class="cat-bar-count">{stat.filled}/{stat.total}</span>
            </div>
          {/if}
        {/each}
      </div>

      <!-- Category groups -->
      <div class="groups animate-fade-up" style="--delay: 400ms">
        {#each groups as group}
          <div class="group-card">
            <button
              class="group-header"
              class:expanded={expandedCat === group.category.id}
              onclick={() => toggleCategory(group.category.id)}
            >
              <span class="group-icon" style="color: {group.category.color}">
                <Icon name="layers" size={16} />
              </span>
              <span class="group-name">{t(group.category.labelKey)}</span>
              <span class="group-count">{group.dimensions.length}</span>
              <Icon name={expandedCat === group.category.id ? "chevron-down" : "chevron-right"} size={14} class="group-chevron" />
            </button>

            {#if expandedCat === group.category.id}
              <div class="group-dims">
                <div class="dims-grid">
                  {#each group.dimensions as dim, di}
                    <div class="dim-card" style="--delay: {di * 30}ms">
                      <span class="dim-label">{dim.label}</span>
                      {#if editingDim === dim.key}
                        <input
                          class="dim-edit-input"
                          bind:value={editValue}
                          onkeydown={(e: KeyboardEvent) => {
                            if (e.key === "Enter") saveEdit(dim.key);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          onblur={() => setTimeout(() => cancelEdit(), 150)}
                        />
                      {:else}
                        <span
                          class="dim-value dim-value-editable"
                          onclick={() => startEdit(dim.key, dim.value)}
                          title={t("profile.edit_hint")}
                        >
                          {dim.value}
                          <span class="dim-edit-icon"><Icon name="edit" size={10} /></span>
                        </span>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Compound signals -->
      {#if profile.compound && Object.keys(profile.compound).length > 0}
        <div class="extra-section animate-fade-up" style="--delay: 450ms">
          <SectionLabel>{t("profile.compound_signals")}</SectionLabel>
          <div class="compound-grid">
            {#each Object.entries(profile.compound) as [key, c]}
              <div class="compound-card">
                <span class="compound-dim">{key.replace(/_/g, " ")}</span>
                <span class="compound-value">{c.value}</span>
                <span class="compound-confidence">{Math.round(c.confidence * 100)}% confidence</span>
                {#if c.export_instruction}
                  <span class="compound-export">{c.export_instruction}</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Emergent observations -->
      {#if profile.emergent && profile.emergent.filter(e => e.status !== "removed").length > 0}
        <div class="extra-section animate-fade-up" style="--delay: 470ms">
          <SectionLabel>{t("profile.emergent_observations")}</SectionLabel>
          <div class="emergent-list">
            {#each profile.emergent.filter(e => e.status !== "removed") as obs}
              <div class="emergent-card">
                <div class="emergent-header">
                  <span class="emergent-title">{obs.title}</span>
                  <span class="emergent-badge emergent-badge-{obs.status}">{obs.status.replace(/_/g, " ")}</span>
                </div>
                <p class="emergent-obs">{obs.user_edit ?? obs.observation}</p>
                <span class="emergent-confidence">{Math.round(obs.confidence * 100)}% confidence</span>
                {#if obs.evidence.length > 0}
                  <div class="emergent-evidence">
                    {#each obs.evidence.slice(0, 3) as ev}
                      <span class="emergent-ev-chip">{ev}</span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Synthesis -->
      {#if profile.synthesis}
        {@const syn = profile.synthesis}
        <div class="extra-section animate-fade-up" style="--delay: 490ms">
          <SectionLabel>{t("profile.synthesis_section")}</SectionLabel>
          <div class="synthesis-card">
            {#if syn.archetype}
              <div class="syn-row">
                <span class="syn-label">Archetype</span>
                <span class="syn-value syn-archetype">{syn.archetype}</span>
              </div>
            {/if}
            {#if syn.narrative}
              <div class="syn-row">
                <span class="syn-label">Narrative</span>
                <p class="syn-narrative">{syn.narrative}</p>
              </div>
            {/if}
            {#if syn.cognitiveProfile}
              <div class="syn-row">
                <span class="syn-label">Cognitive profile</span>
                <div class="syn-cognitive">
                  {#each Object.entries(syn.cognitiveProfile) as [k, v]}
                    <div class="syn-cog-item">
                      <span class="syn-cog-key">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                      <span class="syn-cog-val">{v}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
            {#if syn.communicationDNA}
              <div class="syn-row">
                <span class="syn-label">Communication DNA</span>
                <div class="syn-cognitive">
                  <div class="syn-cog-item">
                    <span class="syn-cog-key">tone</span>
                    <span class="syn-cog-val">{syn.communicationDNA.tone}</span>
                  </div>
                  <div class="syn-cog-item">
                    <span class="syn-cog-key">formality</span>
                    <span class="syn-cog-val">{syn.communicationDNA.formality}</span>
                  </div>
                  <div class="syn-cog-item">
                    <span class="syn-cog-key">directness</span>
                    <span class="syn-cog-val">{syn.communicationDNA.directness}</span>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Suggestions -->
      {#if suggestions.length > 0}
        <div class="suggestions animate-fade-up" style="--delay: 500ms">
          <SectionLabel>{t("profile.suggestions_title")}</SectionLabel>
          <p class="suggestions-desc">{t("profile.suggestion_desc")}</p>
          <div class="suggestion-cards">
            {#each suggestions.slice(0, 4) as sug}
              <button class="suggestion-card" onclick={() => startCategory(sug.category.id)}>
                <Icon name="plus" size={14} />
                <span class="sug-name">{t(sug.category.labelKey)}</span>
                <span class="sug-missing">+{sug.missingCount}</span>
                <span class="sug-desc">{locale === "pl" ? sug.descriptionPl : sug.descriptionEn}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Raw JSON -->
      <div class="raw-json-section animate-fade-up" style="--delay: 600ms">
        <button class="raw-json-toggle" onclick={() => { showRawJson = !showRawJson; }}>
          <Icon name={showRawJson ? "chevron-down" : "chevron-right"} size={14} />
          {t("profile.raw_json")}
        </button>
        {#if showRawJson}
          <pre class="raw-json-pre">{JSON.stringify(profile, null, 2)}</pre>
        {/if}
      </div>

    <!-- ═══════ TAB: REPORT ═══════ -->
    {:else if activeTab === "report"}
      <div class="tab-content animate-fade-up">
        {#if reportSynthesis}
          <div class="report-section">
            {#if reportSynthesis.narrative}
              <div class="report-block">
                <SectionLabel>{t("profile.report_summary")}</SectionLabel>
                <p class="report-narrative">{reportSynthesis.narrative}</p>
              </div>
            {/if}
            {#if reportSynthesis?.cognitiveProfile}
              <div class="report-block">
                <SectionLabel>{t("profile.report_cognitive")}</SectionLabel>
                <div class="report-grid">
                  {#each Object.entries(reportSynthesis.cognitiveProfile) as [k, v]}
                    <div class="report-item">
                      <span class="report-key">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span class="report-val">{v}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
            {#if reportSynthesis?.strengths && reportSynthesis.strengths.length > 0}
              <div class="report-block">
                <SectionLabel>{t("profile.report_strengths")}</SectionLabel>
                {#each reportSynthesis.strengths as s}
                  <p class="report-item-text">→ {s}</p>
                {/each}
              </div>
            {/if}
            {#if reportSynthesis?.blindSpots && reportSynthesis.blindSpots.length > 0}
              <div class="report-block">
                <SectionLabel>{t("profile.report_blind_spots")}</SectionLabel>
                {#each reportSynthesis.blindSpots as b}
                  <p class="report-item-text">→ {b}</p>
                {/each}
              </div>
            {/if}
          </div>
        {:else if reportLoading}
          <div class="report-loading">
            <div class="spinner"></div>
            <p class="dim-text">{t("profile.report_generating")}</p>
          </div>
        {:else if reportError}
          <p class="error-text">{reportError}</p>
          <Button variant="primary" size="md" onclick={generateReport}>{t("profile.report_retry")}</Button>
        {:else}
          <div class="report-empty">
            <Icon name="sparkle" size={32} />
            <p>{t("profile.report_empty")}</p>
            <Button variant="primary" size="md" onclick={generateReport} disabled={!hasApiKey()}>
              <Icon name="sparkle" size={16} />
              {t("profile.report_generate")}
            </Button>
            {#if !hasApiKey()}
              <p class="dim-text">{t("profile.report_requires_ai")}</p>
            {/if}
          </div>
        {/if}
      </div>

    <!-- ═══════ TAB: HISTORY ═══════ -->
    {:else if activeTab === "history"}
      <div class="tab-content animate-fade-up">
        {#if history.length === 0}
          <div class="history-empty">
            <Icon name="clock" size={32} />
            <p>{t("profile.history_empty")}</p>
          </div>
        {:else}
          <div class="history-list">
            {#each history as entry, i}
              <div class="history-card">
                <div class="history-info">
                  <span class="history-date">{new Date(entry.date).toLocaleDateString("pl", { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span class="history-dims">{entry.dimensionCount} wymiarow · {entry.completeness}%</span>
                </div>
                <Button variant="ghost" size="sm" onclick={() => restoreSnapshot(entry)}>
                  <Icon name="rotate" size={14} />
                  {t("profile.history_restore")}
                </Button>
              </div>
            {/each}
          </div>
          {#if restoreSuccess}
            <p class="success-text">{t("profile.history_restored")}</p>
          {/if}
        {/if}
      </div>
    {/if}

    {:else}
      <!-- Empty state -->
      <div class="empty">
        <div class="empty-logo animate-fade-up" style="--delay: 0ms">
          <BreathingLogo />
        </div>

        <h1 class="empty-title animate-fade-up" style="--delay: 200ms">{t("profile.no_profile")}</h1>
        <p class="empty-desc animate-fade-up" style="--delay: 300ms">
          {t("profile.no_profile_desc")}
        </p>

        <div class="empty-actions animate-fade-up" style="--delay: 450ms">
          <Button variant="primary" size="lg" onclick={startProfiling}>
            <Icon name="sparkle" size={16} />
            {t("profile.create")}
          </Button>
          <Button variant="secondary" size="lg" onclick={() => { showImport = !showImport; }}>
            <Icon name="import" size={16} />
            {t("profile.import")}
          </Button>
        </div>

        {#if showImport}
          <div class="import-section animate-fade-up" style="--delay: 0ms">
            <SectionLabel>{t("profile.import_from")}</SectionLabel>
            <select class="import-select" bind:value={importPlatform}>
              <option value="chatgpt">ChatGPT</option>
              <option value="claude">Claude</option>
              <option value="cursor">Cursor</option>
              <option value="other">{t("profile.import_other")}</option>
            </select>
            <textarea
              class="import-textarea"
              bind:value={importText}
              placeholder={t("profile.import_placeholder")}
              rows="6"
            ></textarea>
            <Button variant="primary" size="md" onclick={handlePasteImport} disabled={!importText.trim()}>
              <Icon name="scan" size={16} />
              {t("profile.import_parse")}
            </Button>
          </div>
        {/if}

        {#if uploadError}
          <p class="upload-error animate-fade-in">{uploadError}</p>
        {/if}

        <div class="import-fallback animate-fade-up" style="--delay: 600ms">
          <button class="link-btn" onclick={handleUpload}>
            <Icon name="upload" size={12} />
            {t("profile.upload")}
          </button>
          <span class="cli-sep">&middot;</span>
          <span class="cli-label">{t("profile.cli_hint")}</span>
          <code class="cli-code">npx meport --export json</code>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .hidden-input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
    width: 0;
    height: 0;
  }

  /* Tab content */
  .tab-content { display: flex; flex-direction: column; gap: var(--sp-4); }

  /* ─── Overview tab ─── */
  .ov-header { display: flex; justify-content: space-between; align-items: flex-start; }
  .ov-name { font-size: 1.5rem; font-weight: 600; color: var(--color-text); margin: 0; letter-spacing: -0.02em; }
  .ov-archetype { font-size: 13px; color: var(--color-accent); margin-top: var(--sp-1); display: block; }
  .ov-badge {
    font-family: var(--font-mono); font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.06em; padding: 2px 8px; border-radius: var(--radius-xs);
    background: var(--color-accent-bg); color: var(--color-accent);
  }
  .ov-completeness { margin: var(--sp-4) 0; display: flex; align-items: center; gap: var(--sp-2); }
  .ov-dims { display: flex; flex-direction: column; gap: 6px; margin-top: var(--sp-3); }
  .ov-dim { display: flex; align-items: center; gap: var(--sp-2); font-size: 13px; }
  .ov-dim-key { color: var(--color-text-muted); min-width: 120px; }
  .ov-dim-val { color: var(--color-text); }
  .ov-rules { margin-top: var(--sp-4); }
  .ov-rule { display: flex; gap: var(--sp-2); font-size: 13px; color: var(--color-text-secondary); padding: var(--sp-1) 0; }
  .rule-arrow { color: var(--color-accent); }
  .ov-actions { display: flex; gap: var(--sp-2); margin-top: var(--sp-4); }

  /* ─── Report tab ─── */
  .report-section { display: flex; flex-direction: column; gap: var(--sp-5); }
  .report-block { }
  .report-narrative { font-size: 14px; line-height: 1.7; color: var(--color-text); margin: var(--sp-2) 0 0; }
  .report-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-2); margin-top: var(--sp-2); }
  .report-item {
    display: flex; flex-direction: column; gap: 2px; padding: var(--sp-2) var(--sp-3);
    border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  }
  .report-key { font-size: 11px; color: var(--color-text-muted); text-transform: capitalize; }
  .report-val { font-size: 13px; color: var(--color-text); }
  .report-item-text { font-size: 13px; color: var(--color-text-secondary); margin: var(--sp-1) 0; }
  .report-loading { display: flex; flex-direction: column; align-items: center; gap: var(--sp-3); padding: var(--sp-8); }
  .report-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sp-3); padding: var(--sp-8); text-align: center; color: var(--color-text-muted); }
  .error-text { color: var(--color-error); font-size: 13px; }
  .success-text { color: var(--color-accent); font-size: 13px; }
  .dim-text { color: var(--color-text-muted); font-size: 12px; }

  /* ─── History tab ─── */
  .history-empty { display: flex; flex-direction: column; align-items: center; gap: var(--sp-3); padding: var(--sp-8); text-align: center; color: var(--color-text-muted); }
  .history-list { display: flex; flex-direction: column; gap: var(--sp-2); }
  .history-card {
    display: flex; justify-content: space-between; align-items: center;
    padding: var(--sp-3) var(--sp-4); border: 1px solid var(--color-border);
    border-radius: 12px; background: var(--color-bg-card);
  }
  .history-info { display: flex; flex-direction: column; gap: 2px; }
  .history-date { font-size: 13px; color: var(--color-text); }
  .history-dims { font-size: 11px; color: var(--color-text-muted); }

  /* Layout uses shared .page / .page-content from shared.css */

  /* ─── Stats ─── */
  .stats {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  /* ─── Category bars ─── */
  .category-overview {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: var(--sp-3);
    border-radius: var(--radius-md);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
  }

  .cat-bar-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .cat-bar-label {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    width: 90px;
    flex-shrink: 0;
    text-align: right;
  }

  .cat-bar-track {
    flex: 1;
    height: 4px;
    background: var(--color-border);
    border-radius: 2px;
    overflow: hidden;
  }

  .cat-bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.5s var(--ease-out-expo);
  }

  .cat-bar-count {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-ghost);
    width: 32px;
    text-align: right;
  }

  /* ─── Actions ─── */
  .profile-actions, .empty-actions {
    display: flex;
    gap: var(--sp-2);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  /* ─── Category groups ─── */
  .groups {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .group-card {
    border-radius: var(--radius-md);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    overflow: hidden;
  }

  .group-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3);
    background: none;
    border: none;
    cursor: pointer;
    transition: all 0.15s;
    color: var(--color-text);
    font-family: var(--font-sans);
  }

  .group-header:hover {
    background: var(--color-bg-subtle);
  }

  .group-icon {
    width: 1.2rem;
    text-align: center;
    flex-shrink: 0;
  }

  .group-name {
    font-size: var(--text-sm);
    font-weight: 500;
    flex: 1;
    text-align: left;
  }

  .group-count {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    padding: 2px 8px;
    border-radius: var(--radius-xs);
    background: var(--color-bg-subtle);
  }

  :global(.group-chevron) {
    color: var(--color-text-ghost);
  }

  .group-header.expanded {
    border-bottom: 1px solid var(--color-border);
  }

  .group-dims {
    padding: var(--sp-2) var(--sp-3) var(--sp-3);
  }

  .dims-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .dim-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-subtle);
    animation: fade-up 0.3s var(--ease-out-expo) both;
    animation-delay: var(--delay, 0ms);
  }

  .dim-label {
    font-size: var(--text-micro);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .dim-value {
    font-size: var(--text-sm);
    color: var(--color-text);
  }

  /* ─── Suggestions ─── */
  .suggestions {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .suggestions-desc {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
  }

  .suggestion-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-2);
  }

  .suggestion-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    border: 1px dashed var(--color-border-hover);
    cursor: pointer;
    transition: all 0.2s;
    font-family: var(--font-sans);
    color: var(--color-text);
    text-align: left;
  }

  .suggestion-card:hover {
    border-color: var(--color-accent-border);
    background: var(--color-accent-bg);
    border-style: solid;
  }

  .sug-name {
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .sug-missing {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-accent);
  }

  .sug-desc {
    font-size: var(--text-micro);
    color: var(--color-text-muted);
    line-height: 1.3;
  }

  /* ─── Empty state ─── */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    height: 100%;
    gap: 0;
  }

  .empty-logo {
    margin-bottom: var(--sp-4);
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
    max-width: 320px;
    line-height: 1.5;
  }

  .empty-actions {
    margin-top: var(--sp-6);
  }

  .upload-error {
    margin-top: var(--sp-2);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-error);
  }

  .import-success {
    margin-top: var(--sp-2);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-accent);
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }

  /* ─── Import section ─── */
  .import-section {
    margin-top: var(--sp-4);
    width: 100%;
    max-width: 380px;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .import-select {
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    outline: none;
  }

  .import-select:focus {
    border-color: var(--color-accent-border);
  }

  .import-textarea {
    resize: vertical;
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--sp-3) var(--sp-4);
    color: var(--color-text);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: 1.5;
    outline: none;
    transition: border-color 0.2s;
  }

  .import-textarea:focus {
    border-color: var(--color-accent-border);
  }

  .import-textarea::placeholder {
    color: var(--color-text-ghost);
  }

  /* ─── Import fallback ─── */
  .import-fallback {
    margin-top: var(--sp-8);
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
  }

  .link-btn {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
    transition: color 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .link-btn:hover {
    color: var(--color-accent);
  }

  .cli-sep {
    color: var(--color-text-ghost);
    font-size: var(--text-xs);
  }

  .cli-label {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-ghost);
    flex-shrink: 0;
  }

  .cli-code {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-accent);
  }

  /* ─── Inline edit ─── */
  .dim-value-editable {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: color 0.2s;
  }

  .dim-edit-icon {
    opacity: 0;
    color: var(--color-text-ghost);
    transition: opacity 0.2s;
    flex-shrink: 0;
  }

  .dim-value-editable:hover .dim-edit-icon {
    opacity: 1;
  }

  .dim-edit-input {
    width: 100%;
    padding: 2px 6px;
    border-radius: var(--radius-xs);
    border: 1px solid var(--color-accent-border);
    background: var(--color-bg-card);
    color: var(--color-text);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    outline: none;
  }

  /* ─── Compound / Emergent / Synthesis ─── */
  .extra-section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .compound-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .compound-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
  }

  .compound-dim {
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-ghost);
  }

  .compound-value {
    font-size: var(--text-sm);
    color: var(--color-text);
    font-weight: 500;
  }

  .compound-confidence {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-ghost);
  }

  .compound-export {
    font-size: var(--text-micro);
    color: var(--color-text-muted);
    line-height: 1.4;
    margin-top: 2px;
  }

  .emergent-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .emergent-card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    padding: var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
  }

  .emergent-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  .emergent-title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text);
  }

  .emergent-badge {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    padding: 2px 8px;
    border-radius: var(--radius-xs);
    background: var(--color-bg-subtle);
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  .emergent-badge-accepted {
    background: var(--color-accent-bg);
    color: var(--color-accent);
  }

  .emergent-badge-edited {
    background: oklch(from #fbbf24 l c h / 0.12);
    color: oklch(from #fbbf24 l c h);
  }

  .emergent-obs {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.5;
    margin: 0;
  }

  .emergent-confidence {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-ghost);
  }

  .emergent-evidence {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-top: 2px;
  }

  .emergent-ev-chip {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    padding: 1px 6px;
    border-radius: var(--radius-xs);
    background: var(--color-bg-subtle);
    color: var(--color-text-ghost);
  }

  .synthesis-card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-4);
    border-radius: var(--radius-md);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
  }

  .syn-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .syn-label {
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-ghost);
  }

  .syn-archetype {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-accent);
  }

  .syn-narrative {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.6;
    margin: 0;
  }

  .syn-cognitive {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }

  .syn-cog-item {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: var(--sp-2);
    border-radius: var(--radius-xs);
    background: var(--color-bg-subtle);
  }

  .syn-cog-key {
    font-size: var(--text-micro);
    color: var(--color-text-ghost);
  }

  .syn-cog-val {
    font-size: var(--text-xs);
    color: var(--color-text);
  }

  /* ─── Raw JSON ─── */
  .raw-json-section {
    margin-top: var(--sp-2);
  }

  .raw-json-toggle {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    padding: var(--sp-1) 0;
    transition: color 0.2s;
  }

  .raw-json-toggle:hover {
    color: var(--color-text-secondary);
  }

  .raw-json-pre {
    margin-top: var(--sp-2);
    padding: var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    line-height: 1.5;
    overflow-x: auto;
    max-height: 400px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>
