<script lang="ts">
  import BreathingLogo from "../components/BreathingLogo.svelte";
  import Icon from "../components/Icon.svelte";
  import Button from "../components/Button.svelte";
  import StatPill from "../components/StatPill.svelte";
  import SectionLabel from "../components/SectionLabel.svelte";
  import { hasProfile, getProfile, importProfile, clearProfile, goTo, setProfile } from "../lib/stores/app.svelte.js";
  import { initProfiling, initDeepening, initCategoryDeepening } from "../lib/stores/profiling.svelte.js";
  import { instructionsToProfile, mergeImportedProfile } from "@meport/core/importer";
  import { t, getLocale } from "../lib/i18n.svelte.js";
  import { groupDimensions, getSuggestions, getCategoryCompleteness, type CategoryGroup, type Suggestion } from "../lib/profile-display.js";

  let profileExists = $derived(hasProfile());
  let profile = $derived(getProfile());
  let locale = $derived(getLocale());

  let dimensionCount = $derived(profile ? Object.keys(profile.explicit).length : 0);
  let inferredCount = $derived(profile ? Object.keys(profile.inferred).length : 0);
  let completeness = $derived(profile?.completeness ?? 0);
  let totalDims = $derived(dimensionCount + inferredCount);

  let groups = $derived(profile ? groupDimensions(profile, locale) : []);
  let suggestions = $derived(profile ? getSuggestions(profile) : []);
  let categoryStats = $derived(profile ? getCategoryCompleteness(profile) : []);

  let expandedCat = $state<string | null>(null);
  let copySuccess = $state(false);
  let editingDim = $state<string | null>(null);
  let editValue = $state("");
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

<div class="screen">
  <div class="content">
    {#if profileExists && profile}
      <!-- Header -->
      <div class="header animate-fade-up" style="--delay: 0ms">
        <h1 class="title">{t("profile.title")}</h1>
        <div class="header-actions">
          <Button variant="ghost" size="sm" onclick={copyJson}>
            <Icon name={copySuccess ? "check" : "copy"} size={14} />
            {copySuccess ? t("profile.copied") : t("profile.copy_json")}
          </Button>
          <Button variant="ghost" size="sm" onclick={downloadProfile}>
            <Icon name="download" size={14} />
            {t("profile.save")}
          </Button>
          <Button variant="danger" size="sm" onclick={handleClear}>
            <Icon name="trash" size={14} />
            {t("profile.delete")}
          </Button>
        </div>
      </div>

      <!-- Stats -->
      <div class="stats animate-fade-up" style="--delay: 100ms">
        <StatPill value={totalDims} label={t("home.dimensions")} />
        <StatPill value="{completeness}%" label={t("home.complete")} />
        <StatPill value={dimensionCount} label={t("profile.explicit")} />
        {#if inferredCount > 0}
          <StatPill value={inferredCount} label={t("profile.inferred")} />
        {/if}
      </div>

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

      <!-- Actions -->
      <div class="profile-actions animate-fade-up" style="--delay: 300ms">
        <Button variant="primary" size="md" onclick={startProfiling}>
          <Icon name="plus" size={16} />
          {t("profile.add_more")}
        </Button>
        <Button variant="secondary" size="md" onclick={() => { showImport = !showImport; }}>
          <Icon name="import" size={16} />
          {t("profile.import")}
        </Button>
        <Button variant="ghost" size="md" onclick={() => goTo("export")}>
          <Icon name="download" size={16} />
          {t("profile.export_btn")}
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

      {#if importStats}
        <p class="import-success animate-fade-in">
          <Icon name="check" size={14} />
          +{importStats.dims} dims, +{importStats.rules} rules
        </p>
      {/if}

      {#if uploadError}
        <p class="upload-error animate-fade-in">{uploadError}</p>
      {/if}

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
          <SectionLabel>Compound signals</SectionLabel>
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
          <SectionLabel>Emergent observations</SectionLabel>
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
          <SectionLabel>Synthesis</SectionLabel>
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

  .screen {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    overflow-y: auto;
  }

  .content {
    width: 100%;
    max-width: var(--content-width);
    padding: var(--sp-6) var(--sp-8) var(--sp-12);
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  /* ─── Header ─── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .header-actions {
    display: flex;
    gap: var(--sp-1);
  }

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
