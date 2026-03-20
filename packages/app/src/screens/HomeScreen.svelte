<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import { goTo, getProfile, hasProfile, clearProfile, setProfile } from "../lib/stores/app.svelte.js";
  import { loadSessionState, clearSessionState } from "../lib/stores/profiling.svelte.js";
  import { t, getLocale } from "../lib/i18n.svelte.js";
  let locale = $derived(getLocale());
  import { instructionsToProfile } from "@meport/core/importer";
  import logoDark from "../assets/logo-dark.png";

  // ─── State ───────────────────────────────────────────────────
  let profileExists = $derived(hasProfile());
  let profile = $derived(getProfile());
  let rawCompleteness = $derived(profile?.completeness ?? 0);
  // completeness is already 0-100 from profile — don't multiply again
  let completeness = $derived(rawCompleteness > 1 ? rawCompleteness : rawCompleteness * 100);
  let dimensionCount = $derived(profile ? Object.keys(profile.explicit).length : 0);
  let inferredCount = $derived(profile?.inferred ? Object.keys(profile.inferred).length : 0);

  let sessionInProgress = $state(false);
  let showImportPanel = $state(false);
  let showStartOver = $state(false);
  let importText = $state("");
  let importMode = $state<"adapt" | "export">("adapt");
  let importError = $state("");
  let importProcessing = $state(false);

  // Check for in-progress session on mount
  $effect(() => {
    const saved = loadSessionState();
    sessionInProgress = saved !== null && !profileExists;
  });

  // ─── Actions ─────────────────────────────────────────────────
  async function createProfile() {
    await goTo("profiling");
  }

  async function continueSession() {
    await goTo("profiling");
  }

  function startOver() {
    clearSessionState();
    sessionInProgress = false;
    showStartOver = false;
  }

  async function handleImport() {
    if (!importText.trim()) return;
    importError = "";
    importProcessing = true;
    try {
      if (importMode === "adapt") {
        const parsed = instructionsToProfile(importText);
        const hasData = parsed && (Object.keys(parsed.explicit ?? {}).length > 0 || Object.keys(parsed.inferred ?? {}).length > 0);
        if (!hasData) {
          importError = t("profile.import_hint");
          return;
        }
        setProfile(parsed);
        await goTo("profile");
      } else {
        await goTo("export");
      }
    } catch {
      importError = t("profile.import_parse_error");
    } finally {
      importProcessing = false;
    }
  }

  function exportRules(profile: NonNullable<ReturnType<typeof getProfile>>) {
    const rules = profile.synthesis?.exportRules ?? [];
    if (rules.length > 0) {
      return rules.slice(0, 3).map((r: unknown) =>
        typeof r === "string" ? r : typeof r === "object" && r !== null && "value" in r ? String((r as { value: unknown }).value) : JSON.stringify(r)
      );
    }
    // Fallback: derive from explicit dims
    return Object.entries(profile.explicit)
      .slice(0, 3)
      .map(([key, dim]) => {
        const v = Array.isArray(dim.value) ? dim.value.join(", ") : String(dim.value);
        const label = key.split(".").pop()?.replace(/_/g, " ") ?? key;
        return `${label}: ${v}`;
      });
  }
</script>

<!-- ─── NO PROFILE ──────────────────────────────────────────── -->
{#if !profileExists && !sessionInProgress}
  <div class="page">
    <div class="page-content landing">
      <div class="brand">
        <img src={logoDark} alt="Meport" class="brand-logo" />
      </div>

      <div class="page-header hero">
        <h1 class="hero-title">{t("home.headline")}</h1>
        <p class="page-subtitle hero-sub">{t("home.subline")}</p>
      </div>

      {#if !showImportPanel}
        <div class="actions">
          <button class="btn-primary btn-full" onclick={createProfile}>
            <Icon name="sparkle" size={16} />
            {t("home.start_profiling")}
          </button>
          <button class="btn-secondary btn-full action-card-soon" disabled>
            <Icon name="import" size={16} />
            {t("paste.title")} <span class="soon-badge">({t("home.coming_soon")})</span>
          </button>
        </div>
      {:else}
        <div class="card import-panel">
          <p class="import-label">{t("paste.subtitle")}</p>
          <textarea
            class="import-textarea"
            placeholder={t("paste.placeholder")}
            bind:value={importText}
            rows={5}
          ></textarea>

          <div class="import-modes">
            <label class="mode-option">
              <input type="radio" bind:group={importMode} value="adapt" />
              <span>{t("home.start_ai")}</span>
              <small>parse into Meport profile</small>
            </label>
            <label class="mode-option">
              <input type="radio" bind:group={importMode} value="export" />
              <span>{t("nav.export")}</span>
              <small>copy to 12 platforms as-is</small>
            </label>
          </div>

          {#if importError}
            <p class="import-error">{importError}</p>
          {/if}

          <div class="import-actions">
            <button class="btn-primary btn-full" onclick={handleImport} disabled={!importText.trim() || importProcessing}>
              {importProcessing ? "..." : t("paste.analyze")}
            </button>
            <button class="btn-ghost btn-full" onclick={() => { showImportPanel = false; importError = ""; }}>
              {t("paste.skip")}
            </button>
          </div>
        </div>
      {/if}

      <!-- Before/After demo -->
      <div class="demo-preview">
        <div class="demo-divider">
          <span class="demo-divider-label">{t("home.see_difference") ?? "Zobacz roznice"}</span>
        </div>
        <div class="demo-columns">
          <div class="demo-col demo-before">
            <div class="demo-col-label">{t("home.without")}</div>
            <div class="demo-prompt">"Zaplanuj mi weekendowy wyjazd"</div>
            <div class="demo-response">Chetnie pomoge! Gdzie myslisz? Jaki budzet? Gory czy morze? Ile osob? Szukasz relaksu czy przygody?</div>
          </div>
          <div class="demo-col demo-after">
            <div class="demo-col-label">{t("home.with")}</div>
            <div class="demo-prompt">"Zaplanuj mi weekendowy wyjazd"</div>
            <div class="demo-response">Baza Krakow, kierunek gory — Szczawnica 2h drogi. Szlak na Trzy Korony, budzet ~500 PLN pokryje paliwo + nocleg. Weekend solo, wiec polecam schronisko.</div>
          </div>
        </div>
      </div>

      <p class="trust">{t("home.trust")}</p>
    </div>
  </div>

<!-- ─── SESSION IN PROGRESS ───────────────────────────────────── -->
{:else if !profileExists && sessionInProgress}
  <div class="page">
    <div class="page-content landing">
      <div class="brand">
        <img src={logoDark} alt="Meport" class="brand-logo" />
      </div>

      <div class="page-header">
        <h1 class="hero-title">{t("home.session_headline")}</h1>
        <p class="page-subtitle">{t("home.session_subline")}</p>
      </div>

      <div class="actions">
        <button class="btn-primary btn-full" onclick={continueSession}>
          <Icon name="arrow-right" size={16} />
          {t("home.session_continue")}
        </button>
        <button class="btn-ghost btn-full danger" onclick={() => showStartOver = true}>
          {t("home.session_start_over")}
        </button>
      </div>

      {#if showStartOver}
        <div class="card confirm-box">
          <p>{t("home.session_start_over")}?</p>
          <div class="confirm-actions">
            <button class="btn-danger-sm" onclick={startOver}>{t("home.session_start_over")}</button>
            <button class="btn-ghost btn-sm" onclick={() => showStartOver = false}>{locale === "pl" ? "Anuluj" : "Cancel"}</button>
          </div>
        </div>
      {/if}
    </div>
  </div>

<!-- ─── PROFILE EXISTS (Dashboard) ──────────────────────────── -->
{:else if profileExists && profile}
  {@const name = String(profile.explicit["identity.preferred_name"]?.value || profile.explicit["identity.full_name"]?.value || profile.meta?.name || t("home.user_fallback"))}
  {@const pct = Math.round(completeness)}
  {@const dims = dimensionCount + inferredCount}
  {@const rules = exportRules(profile)}
  <div class="page">
    <div class="page-content">
      <!-- Logo -->
      <div class="dash-logo">
        <img src={logoDark} alt="Meport" class="dash-logo-img" />
      </div>

      <!-- Identity -->
      <div class="dash-identity">
        <div class="dash-avatar">{name.charAt(0)}</div>
        <div>
          <h1 class="page-title">{name}</h1>
          <p class="page-subtitle">{dims} wymiarow · {pct}% kompletny</p>
        </div>
      </div>

      <!-- Completeness bar -->
      <div class="progress-bar">
        <div class="progress-track"><div class="progress-fill" style="width: {pct}%"></div></div>
        <span class="progress-label">{pct}%</span>
      </div>

      <!-- Quick actions -->
      <div class="action-grid">
        <button class="action-card" onclick={() => goTo("profile")}>
          <Icon name="user" size={20} />
          <span class="action-card-label">Profil</span>
          <span class="action-card-sub">przegladaj i edytuj</span>
        </button>
        <button class="action-card" onclick={() => goTo("export")}>
          <Icon name="download" size={20} />
          <span class="action-card-label">Eksport</span>
          <span class="action-card-sub">12 platform</span>
        </button>
        <button class="action-card" onclick={async () => { const { initSmartDeepen } = await import("../lib/stores/profiling.svelte.js"); await initSmartDeepen(profile!); await goTo("profiling"); }}>
          <Icon name="layers" size={20} />
          <span class="action-card-label">{t("home.deepen") ?? "Pogłęb"}</span>
          <span class="action-card-sub">{t("home.add_more") ?? "dodaj wymiary"}</span>
        </button>
      </div>

      <!-- Top rules -->
      {#if rules.length > 0}
        <div class="card dash-rules">
          <p class="section-label">Top reguly</p>
          {#each rules as rule}
            <div class="dash-rule"><span class="dash-rule-arrow">→</span> {rule}</div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* ─── Landing (no profile / session) ─── */
  .landing {
    max-width: 480px;
    padding-top: var(--sp-12);
  }

  .brand {
    display: flex;
    align-items: center;
  }

  .brand-logo {
    height: 28px;
    width: auto;
    object-fit: contain;
    filter: drop-shadow(0 0 8px oklch(from var(--color-accent) l c h / 0.15));
  }

  .hero-title {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.15;
    margin: 0;
    color: var(--color-text);
    white-space: pre-line;
    letter-spacing: -0.02em;
  }

  .hero-sub {
    font-size: 1rem;
    line-height: 1.5;
  }

  /* ─── Actions ─── */
  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .btn-full {
    width: 100%;
  }

  .danger:hover {
    color: var(--color-error);
  }

  /* ─── Import panel ─── */
  .import-panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .import-label {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .import-textarea {
    width: 100%;
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xs);
    color: var(--color-text);
    padding: var(--sp-3);
    font-size: var(--text-sm);
    font-family: inherit;
    resize: vertical;
    min-height: 100px;
    box-sizing: border-box;
  }

  .import-textarea:focus {
    outline: none;
    border-color: var(--color-accent-border);
  }

  .import-modes {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .mode-option {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    cursor: pointer;
    padding: var(--sp-2);
    border-radius: var(--radius-xs);
    transition: background 0.1s;
  }

  .mode-option:hover {
    background: var(--color-bg-subtle);
  }

  .mode-option input[type="radio"] {
    accent-color: var(--color-accent);
    flex-shrink: 0;
  }

  .mode-option span {
    font-size: var(--text-sm);
    color: var(--color-text);
    font-weight: 500;
  }

  .mode-option small {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin-left: var(--sp-1);
  }

  .import-error {
    font-size: 0.8125rem;
    color: var(--color-error);
    margin: 0;
  }

  .import-actions {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  /* ─── Before/After demo ─── */
  .demo-preview {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .demo-divider {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .demo-divider::before,
  .demo-divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--color-border);
  }

  .demo-divider-label {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .demo-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-3);
  }

  .demo-col {
    padding: var(--sp-4);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .demo-before {
    background: var(--color-error-bg);
    border: 1px solid var(--color-error-border);
  }

  .demo-after {
    background: var(--color-accent-bg);
    border: 1px solid var(--color-accent-border);
  }

  .demo-col-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .demo-before .demo-col-label {
    color: var(--color-error);
  }

  .demo-after .demo-col-label {
    color: var(--color-accent);
  }

  .demo-prompt {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-style: italic;
  }

  .demo-response {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  /* ─── Trust ─── */
  .trust {
    font-size: var(--text-xs);
    color: var(--color-text-ghost);
    margin: 0;
    text-align: center;
  }

  .action-card-soon {
    opacity: 0.4;
    cursor: default;
    pointer-events: none;
  }

  .soon-badge {
    font-size: var(--text-xs);
    color: var(--color-text-ghost);
    font-style: italic;
  }

  /* ─── Dashboard ─── */
  .dash-logo {
    display: flex;
    justify-content: center;
    margin-bottom: var(--sp-2);
  }

  .dash-logo-img {
    height: 40px;
    width: auto;
    object-fit: contain;
    filter: drop-shadow(0 0 12px oklch(from var(--color-accent) l c h / 0.2));
  }

  .dash-identity {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .dash-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--color-accent-bg);
    border: 1px solid var(--color-accent-border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 700;
    color: var(--color-accent);
    flex-shrink: 0;
  }

  .dash-rules {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .dash-rule {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    display: flex;
    gap: 6px;
    padding: 2px 0;
  }

  .dash-rule-arrow {
    color: var(--color-accent);
    flex-shrink: 0;
  }

  /* ─── Confirm box ─── */
  .confirm-box {
    border-color: var(--color-error-border);
    background: var(--color-error-bg);
  }

  .confirm-box p {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text);
  }

  .confirm-actions {
    display: flex;
    gap: var(--sp-2);
    margin-top: var(--sp-2);
  }

  .btn-danger-sm {
    background: var(--color-error-bg);
    border: 1px solid var(--color-error-border);
    border-radius: var(--radius-xs);
    color: var(--color-error);
    font-size: var(--text-xs);
    padding: var(--sp-1) var(--sp-3);
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-danger-sm:hover {
    background: oklch(from var(--color-error) l c h / 0.15);
  }
</style>
