<script lang="ts">
  import { getProfile, setProfile, goTo } from "../lib/stores/app.svelte.js";
  import { getDimensionWeight } from "@meport/core/types";
  import { t } from "../lib/i18n.svelte.js";
  import Icon from "../components/Icon.svelte";
  import SectionLabel from "../components/SectionLabel.svelte";

  let profile = $derived(getProfile());

  interface DimFeedback {
    key: string;
    value: string;
    rating: "up" | "down" | null;
    editValue: string | null;
  }

  let overallScore = $state(0);
  let note = $state("");
  let saved = $state(false);
  let editingKey = $state<string | null>(null);
  let editTemp = $state("");

  let dimFeedbacks = $state<DimFeedback[]>([]);

  $effect(() => {
    if (!profile) return;
    const allDims: { key: string; value: string; weight: number }[] = [];
    for (const [key, val] of Object.entries(profile.explicit)) {
      const v = Array.isArray(val.value) ? val.value.join(", ") : String(val.value);
      allDims.push({ key, value: v, weight: getDimensionWeight(key) });
    }
    for (const [key, val] of Object.entries(profile.inferred)) {
      allDims.push({ key, value: String(val.value), weight: getDimensionWeight(key) });
    }
    allDims.sort((a, b) => b.weight - a.weight);
    const top = allDims.slice(0, 10);
    dimFeedbacks = top.map(d => ({ key: d.key, value: d.value, rating: null, editValue: null }));
  });

  let pastFeedback = $derived(profile?.meta?.feedback_scores ?? []);

  function rate(key: string, r: "up" | "down") {
    dimFeedbacks = dimFeedbacks.map(d => d.key === key ? { ...d, rating: d.rating === r ? null : r } : d);
  }

  function startEdit(key: string, currentVal: string) {
    editingKey = key;
    editTemp = currentVal;
  }

  function applyEdit(key: string) {
    if (!editTemp.trim()) { editingKey = null; return; }
    dimFeedbacks = dimFeedbacks.map(d => d.key === key ? { ...d, editValue: editTemp.trim() } : d);
    editingKey = null;
  }

  function cancelEdit() {
    editingKey = null;
    editTemp = "";
  }

  function saveFeedback() {
    if (!profile || overallScore === 0) return;
    const p = { ...profile };
    const scores = [...(p.meta.feedback_scores ?? [])];
    scores.push({ date: new Date().toISOString(), score: overallScore, note: note.trim() || undefined });
    p.meta = { ...p.meta, feedback_scores: scores };

    for (const d of dimFeedbacks) {
      if (d.editValue !== null && d.key in p.explicit) {
        p.explicit[d.key] = { ...p.explicit[d.key], value: d.editValue };
      }
    }

    setProfile(p);
    saved = true;
    setTimeout(() => { saved = false; }, 2500);
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    } catch { return iso; }
  }

  function labelForKey(key: string): string {
    return key.split(".").pop()?.replace(/_/g, " ") ?? key;
  }

  function starLabel(n: number): string {
    const keys = ["", "feedback.star_1", "feedback.star_2", "feedback.star_3", "feedback.star_4", "feedback.star_5"];
    return keys[n] ? t(keys[n]) : "";
  }
</script>

<div class="screen">
  {#if !profile}
    <div class="empty-state">
      <Icon name="star" size={40} />
      <h1 class="empty-title">{t("feedback.no_profile")}</h1>
      <p class="empty-desc">{t("feedback.no_profile_desc")}</p>
      <button class="btn-primary" onclick={() => goTo("home")}>{t("feedback.go_home")}</button>
    </div>
  {:else}
    <div class="content animate-fade-up" style="--delay: 0ms">
      <div class="page-header">
        <h1 class="page-title">{t("feedback.title")}</h1>
        <p class="page-desc">{t("feedback.desc")}</p>
      </div>

      <section class="section">
        <SectionLabel>{t("feedback.dim_accuracy")}</SectionLabel>
        <p class="section-hint">{t("feedback.dim_hint")}</p>
        <div class="dim-list">
          {#each dimFeedbacks as dim}
            <div class="dim-item">
              <div class="dim-info">
                <span class="dim-key">{labelForKey(dim.key)}</span>
                {#if editingKey === dim.key}
                  <div class="dim-edit-row">
                    <input
                      class="dim-edit-input"
                      bind:value={editTemp}
                      onkeydown={(e) => { if (e.key === "Enter") applyEdit(dim.key); if (e.key === "Escape") cancelEdit(); }}
                      autofocus
                    />
                    <button class="icon-btn accent" onclick={() => applyEdit(dim.key)}>
                      <Icon name="check" size={12} />
                    </button>
                    <button class="icon-btn" onclick={cancelEdit}>
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                {:else}
                  <span class="dim-val" class:edited={dim.editValue !== null}>
                    {dim.editValue ?? dim.value}
                  </span>
                {/if}
              </div>
              <div class="dim-actions">
                <button
                  class="icon-btn"
                  class:active-up={dim.rating === "up"}
                  title="Accurate"
                  onclick={() => rate(dim.key, "up")}
                >
                  <Icon name="chevron-up" size={14} />
                </button>
                <button
                  class="icon-btn"
                  class:active-down={dim.rating === "down"}
                  title="Inaccurate"
                  onclick={() => rate(dim.key, "down")}
                >
                  <Icon name="chevron-down" size={14} />
                </button>
                <button
                  class="icon-btn"
                  title="Edit value"
                  onclick={() => startEdit(dim.key, dim.editValue ?? dim.value)}
                >
                  <Icon name="edit" size={12} />
                </button>
              </div>
            </div>
          {/each}
        </div>
      </section>

      <section class="section">
        <SectionLabel>{t("feedback.overall")}</SectionLabel>
        <div class="stars-row">
          {#each [1,2,3,4,5] as n}
            <button
              class="star-btn"
              class:filled={overallScore >= n}
              onclick={() => { overallScore = overallScore === n ? 0 : n; }}
              title={starLabel(n)}
            >
              <Icon name="star" size={24} />
            </button>
          {/each}
          {#if overallScore > 0}
            <span class="star-label">{starLabel(overallScore)}</span>
          {/if}
        </div>
      </section>

      <section class="section">
        <SectionLabel>{t("feedback.what_better")}</SectionLabel>
        <textarea
          class="note-input"
          bind:value={note}
          placeholder={t("feedback.note_placeholder")}
          rows={3}
        ></textarea>
      </section>

      <div class="save-row">
        <button
          class="btn-primary"
          onclick={saveFeedback}
          disabled={overallScore === 0}
        >
          {#if saved}
            <Icon name="check" size={14} />
            {t("feedback.saved")}
          {:else}
            {t("feedback.save")}
          {/if}
        </button>
        {#if overallScore === 0}
          <span class="save-hint">{t("feedback.select_star")}</span>
        {/if}
      </div>

      {#if pastFeedback.length > 0}
        <section class="section">
          <SectionLabel>{t("feedback.past")}</SectionLabel>
          <div class="past-list">
            {#each [...pastFeedback].reverse() as f}
              <div class="past-item">
                <div class="past-header">
                  <span class="past-date">{formatDate(f.date)}</span>
                  <div class="past-stars">
                    {#each [1,2,3,4,5] as n}
                      <span class="past-star" class:filled={f.score >= n}>
                        <Icon name="star" size={12} />
                      </span>
                    {/each}
                  </div>
                </div>
                {#if f.note}
                  <p class="past-note">{f.note}</p>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  {/if}
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
    max-width: 560px;
    padding: 0 var(--sp-6);
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
  }

  .page-header {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .page-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .page-desc {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .section-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.5;
  }

  .dim-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .dim-item {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-subtle);
    transition: background 0.15s;
  }

  .dim-item:hover {
    background: var(--color-bg-card);
  }

  .dim-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .dim-key {
    font-size: var(--text-micro);
    font-family: var(--font-mono);
    text-transform: capitalize;
    color: var(--color-text-muted);
    letter-spacing: 0.02em;
  }

  .dim-val {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dim-val.edited {
    color: var(--color-accent);
  }

  .dim-edit-row {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .dim-edit-input {
    flex: 1;
    padding: 3px var(--sp-2);
    border-radius: var(--radius-xs);
    border: 1px solid var(--color-accent-border);
    background: var(--color-bg-card);
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    outline: none;
  }

  .dim-actions {
    display: flex;
    gap: var(--sp-1);
    flex-shrink: 0;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-xs);
    background: none;
    border: 1px solid transparent;
    color: var(--color-text-ghost);
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .icon-btn:hover {
    color: var(--color-text-secondary);
    border-color: var(--color-border);
    background: var(--color-bg-card);
  }

  .icon-btn.active-up {
    color: oklch(0.45 0.15 145);
    border-color: oklch(0.45 0.15 145 / 0.3);
    background: oklch(0.45 0.15 145 / 0.08);
  }

  .icon-btn.active-down {
    color: oklch(0.55 0.2 25);
    border-color: oklch(0.55 0.2 25 / 0.3);
    background: oklch(0.55 0.2 25 / 0.08);
  }

  .icon-btn.accent {
    color: var(--color-accent);
    border-color: var(--color-accent-border);
    background: var(--color-accent-bg);
  }

  .stars-row {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .star-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-border-hover);
    padding: var(--sp-1);
    border-radius: var(--radius-xs);
    transition: all 0.15s;
    display: flex;
    align-items: center;
  }

  .star-btn:hover, .star-btn.filled {
    color: oklch(0.75 0.18 85);
  }

  .star-label {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin-left: var(--sp-2);
  }

  .note-input {
    width: 100%;
    padding: var(--sp-3);
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
    box-sizing: border-box;
  }

  .note-input:focus {
    border-color: var(--color-accent-border);
  }

  .note-input::placeholder {
    color: var(--color-text-ghost);
  }

  .save-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .save-hint {
    font-size: var(--text-xs);
    color: var(--color-text-ghost);
  }

  .past-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .past-item {
    padding: var(--sp-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .past-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .past-date {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-muted);
  }

  .past-stars {
    display: flex;
    gap: 2px;
    color: var(--color-border-hover);
  }

  .past-star.filled {
    color: oklch(0.75 0.18 85);
  }

  .past-note {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.4;
  }
</style>
