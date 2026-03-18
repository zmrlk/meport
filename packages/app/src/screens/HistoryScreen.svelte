<script lang="ts">
  import { getProfile, setProfile, goTo } from "../lib/stores/app.svelte.js";
  import type { PersonaProfile } from "@meport/core/types";
  import { t } from "../lib/i18n.svelte.js";
  import Icon from "../components/Icon.svelte";
  import SectionLabel from "../components/SectionLabel.svelte";

  interface HistoryEntry {
    date: string;
    completeness: number;
    dimensionCount: number;
    snapshot: PersonaProfile;
  }

  let profile = $derived(getProfile());

  function loadHistory(): HistoryEntry[] {
    try {
      const raw = localStorage.getItem("meport:history");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  let history = $state<HistoryEntry[]>(loadHistory());
  let selectedIndex = $state<number | null>(null);
  let compareMode = $state(false);
  let restoreSuccess = $state(false);

  let selectedEntry = $derived(selectedIndex !== null ? history[selectedIndex] : null);

  function formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
        + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  }

  function restore(entry: HistoryEntry) {
    if (!confirm(t("history.restore_confirm", { date: formatDate(entry.date) }))) return;
    setProfile(entry.snapshot);
    restoreSuccess = true;
    history = loadHistory();
    setTimeout(() => { restoreSuccess = false; }, 2500);
  }

  function getDiff(current: PersonaProfile, older: PersonaProfile): { added: string[]; removed: string[]; changed: string[] } {
    const curKeys = new Set(Object.keys(current.explicit));
    const oldKeys = new Set(Object.keys(older.explicit));
    const added = [...curKeys].filter(k => !oldKeys.has(k));
    const removed = [...oldKeys].filter(k => !curKeys.has(k));
    const changed = [...curKeys].filter(k => {
      if (!oldKeys.has(k)) return false;
      return String(current.explicit[k]?.value) !== String(older.explicit[k]?.value);
    });
    return { added, removed, changed };
  }

  let diff = $derived.by(() => {
    if (!compareMode || !selectedEntry || !profile) return null;
    return getDiff(profile, selectedEntry.snapshot);
  });

  function labelForKey(key: string): string {
    return key.split(".").pop()?.replace(/_/g, " ") ?? key;
  }
</script>

<div class="screen">
  {#if !profile}
    <div class="empty-state">
      <Icon name="clock" size={40} />
      <h1 class="empty-title">{t("history.no_profile")}</h1>
      <p class="empty-desc">{t("history.no_profile_desc")}</p>
      <button class="btn-primary" onclick={() => goTo("home")}>{t("history.go_home")}</button>
    </div>
  {:else if history.length === 0}
    <div class="empty-state">
      <Icon name="clock" size={40} />
      <h1 class="empty-title">{t("history.no_history")}</h1>
      <p class="empty-desc">{t("history.no_history_desc")}</p>
    </div>
  {:else}
    <div class="layout">
      <div class="sidebar">
        <div class="sidebar-header animate-fade-up" style="--delay: 0ms">
          <h1 class="sidebar-title">{t("history.title")}</h1>
          <span class="sidebar-count">{history.length} {t("history.snapshots")}</span>
        </div>

        {#if restoreSuccess}
          <div class="restore-notice animate-fade-up" style="--delay: 0ms">
            <Icon name="check" size={14} />
            {t("history.profile_restored")}
          </div>
        {/if}

        <div class="timeline animate-fade-up" style="--delay: 150ms">
          {#each [...history].reverse() as entry, i}
            {@const idx = history.length - 1 - i}
            <button
              class="timeline-item"
              class:selected={selectedIndex === idx}
              onclick={() => { selectedIndex = idx; compareMode = false; }}
            >
              <div class="timeline-dot"></div>
              <div class="timeline-content">
                <span class="timeline-date">{formatDate(entry.date)}</span>
                <div class="timeline-stats">
                  <span class="tstat">{entry.completeness}% complete</span>
                  <span class="tstat">{entry.dimensionCount} dims</span>
                </div>
              </div>
            </button>
          {/each}
        </div>
      </div>

      <div class="detail animate-fade-up" style="--delay: 200ms">
        {#if selectedEntry}
          <div class="detail-header">
            <div>
              <h2 class="detail-title">{formatDate(selectedEntry.date)}</h2>
              <p class="detail-meta">{selectedEntry.completeness}% complete · {selectedEntry.dimensionCount} dimensions</p>
            </div>
            <div class="detail-actions">
              <button
                class="btn-secondary btn-sm"
                class:btn-active={compareMode}
                onclick={() => { compareMode = !compareMode; }}
              >
                <Icon name="layers" size={12} />
                {compareMode ? t("history.hide_diff") : t("history.compare")}
              </button>
              <button class="btn-primary btn-sm" onclick={() => restore(selectedEntry!)}>
                <Icon name="enter" size={12} />
                {t("history.restore")}
              </button>
            </div>
          </div>

          {#if compareMode && diff}
            <div class="diff-section">
              <SectionLabel>{t("history.diff_vs_current")}</SectionLabel>
              {#if diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0}
                <p class="diff-empty">{t("history.no_diff")}</p>
              {:else}
                {#if diff.added.length}
                  <div class="diff-group">
                    <span class="diff-label added">+ Added ({diff.added.length})</span>
                    {#each diff.added as key}
                      <div class="diff-item added">{labelForKey(key)}</div>
                    {/each}
                  </div>
                {/if}
                {#if diff.removed.length}
                  <div class="diff-group">
                    <span class="diff-label removed">- Removed ({diff.removed.length})</span>
                    {#each diff.removed as key}
                      <div class="diff-item removed">{labelForKey(key)}</div>
                    {/each}
                  </div>
                {/if}
                {#if diff.changed.length}
                  <div class="diff-group">
                    <span class="diff-label changed">~ Changed ({diff.changed.length})</span>
                    {#each diff.changed as key}
                      <div class="diff-item changed">
                        <span>{labelForKey(key)}</span>
                        <span class="diff-old">{String(selectedEntry.snapshot.explicit[key]?.value)}</span>
                        <Icon name="arrow-right" size={10} />
                        <span class="diff-new">{String(profile!.explicit[key]?.value)}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              {/if}
            </div>
          {/if}

          <div class="snapshot-dims">
            <SectionLabel>{t("history.snapshot_dims")}</SectionLabel>
            <div class="dims-list">
              {#each Object.entries(selectedEntry.snapshot.explicit) as [key, val]}
                <div class="dim-row">
                  <span class="dim-key">{labelForKey(key)}</span>
                  <span class="dim-val">{Array.isArray(val.value) ? val.value.join(", ") : String(val.value)}</span>
                </div>
              {/each}
            </div>
          </div>
        {:else}
          <div class="detail-placeholder">
            <Icon name="clock" size={32} />
            <p>{t("history.select_snapshot")}</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .screen {
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: flex;
  }

  .layout {
    width: 100%;
    height: 100%;
    display: flex;
    overflow: hidden;
  }

  .sidebar {
    width: 260px;
    flex-shrink: 0;
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    padding: var(--sp-4);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .sidebar-title {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .sidebar-count {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-ghost);
  }

  .restore-notice {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-4);
    background: var(--color-accent-bg);
    color: var(--color-accent);
    font-size: var(--text-xs);
    flex-shrink: 0;
  }

  .timeline {
    flex: 1;
    overflow-y: auto;
    padding: var(--sp-2);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .timeline-item {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: none;
    border: none;
    cursor: pointer;
    transition: background 0.15s;
    text-align: left;
  }

  .timeline-item:hover {
    background: var(--color-bg-subtle);
  }

  .timeline-item.selected {
    background: var(--color-accent-bg);
  }

  .timeline-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-border-hover);
    flex-shrink: 0;
    margin-top: 5px;
  }

  .timeline-item.selected .timeline-dot {
    background: var(--color-accent);
  }

  .timeline-content {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .timeline-date {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
  }

  .timeline-item.selected .timeline-date {
    color: var(--color-text);
  }

  .timeline-stats {
    display: flex;
    gap: var(--sp-2);
  }

  .tstat {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-ghost);
  }

  .detail {
    flex: 1;
    overflow-y: auto;
    padding: var(--sp-6);
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .detail-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--sp-4);
  }

  .detail-title {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
  }

  .detail-meta {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: var(--sp-1) 0 0 0;
  }

  .detail-actions {
    display: flex;
    gap: var(--sp-2);
    flex-shrink: 0;
  }

  .detail-placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-3);
    color: var(--color-text-ghost);
    font-size: var(--text-sm);
  }

  .diff-section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .diff-empty {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
  }

  .diff-group {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .diff-label {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding-bottom: var(--sp-1);
  }

  .diff-label.added { color: oklch(0.45 0.15 145); }
  .diff-label.removed { color: oklch(0.55 0.2 25); }
  .diff-label.changed { color: oklch(0.65 0.15 85); }

  .diff-item {
    font-size: var(--text-xs);
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--radius-xs);
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .diff-item.added {
    background: oklch(0.45 0.15 145 / 0.08);
    color: oklch(0.45 0.15 145);
  }

  .diff-item.removed {
    background: oklch(0.55 0.2 25 / 0.08);
    color: oklch(0.55 0.2 25);
  }

  .diff-item.changed {
    background: oklch(0.65 0.15 85 / 0.08);
    color: var(--color-text-secondary);
  }

  .diff-old {
    text-decoration: line-through;
    opacity: 0.6;
  }

  .diff-new {
    font-weight: 500;
    color: oklch(0.45 0.15 145);
  }

  .snapshot-dims {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .dims-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .dim-row {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-xs);
    background: var(--color-bg-subtle);
  }

  .dim-key {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    min-width: 160px;
    text-transform: capitalize;
  }

  .dim-val {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
  }

  .btn-secondary.btn-active {
    border-color: var(--color-accent);
    color: var(--color-accent);
    background: var(--color-accent-bg);
  }
</style>
