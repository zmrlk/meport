<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import { goTo, getProfile, hasProfile, clearProfile, setProfile } from "../lib/stores/app.svelte.js";
  import { loadSessionState, clearSessionState } from "../lib/stores/profiling.svelte.js";
  import { t } from "../lib/i18n.svelte.js";
  import { instructionsToProfile } from "@meport/core/importer";
  import logoDark from "../assets/logo-dark.png";

  // ─── State ───────────────────────────────────────────────────
  let profileExists = $derived(hasProfile());
  let profile = $derived(getProfile());
  let completeness = $derived(profile?.completeness ?? 0);
  let dimensionCount = $derived(profile ? Object.keys(profile.explicit).length : 0);
  let inferredCount = $derived(profile ? Object.keys(profile.inferred).length : 0);

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
    // ProfilingScreen's onMount will call initProfiling — don't double-init here
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
          // Local parser couldn't extract structured data. Accept it anyway as a raw text profile
          // so the user can still export it to other platforms.
          importError = t("profile.import_hint");
          return;
        }
        setProfile(parsed);
        await goTo("profile");
      } else {
        // export mode — navigate to export with pasted text as base
        await goTo("export");
      }
    } catch {
      importError = t("profile.import_parse_error");
    } finally {
      importProcessing = false;
    }
  }

  function exportRules(profile: NonNullable<ReturnType<typeof getProfile>>) {
    const rules = profile.exportRules ?? [];
    if (rules.length > 0) return rules.slice(0, 3);
    // Fallback: derive from explicit dims
    return Object.entries(profile.explicit)
      .slice(0, 3)
      .map(([key, val]) => `${key}: ${val}`);
  }
</script>

<div class="home">

  <!-- ─── NO PROFILE ──────────────────────────────────────────── -->
  {#if !profileExists && !sessionInProgress}
    <div class="screen no-profile">
      <div class="brand">
        <img src={logoDark} alt="Meport" class="brand-logo" />
      </div>

      <div class="hero">
        <h1 class="headline">{t("home.headline")}</h1>
        <p class="subline">{t("home.subline")}</p>
      </div>

      {#if !showImportPanel}
        <div class="actions">
          <button class="btn-primary" onclick={createProfile}>
            <Icon name="sparkle" size={16} />
            {t("home.start_profiling")}
          </button>

          <button class="btn-secondary" onclick={() => showImportPanel = true}>
            <Icon name="import" size={16} />
            {t("paste.title")}
          </button>
        </div>
      {:else}
        <!-- Import panel -->
        <div class="import-panel">
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
              <small>copy to 14 platforms as-is</small>
            </label>
          </div>

          {#if importError}
            <p class="import-error">{importError}</p>
          {/if}

          <div class="import-actions">
            <button class="btn-primary" onclick={handleImport} disabled={!importText.trim() || importProcessing}>
              {importProcessing ? "..." : t("paste.analyze")}
            </button>
            <button class="btn-ghost" onclick={() => { showImportPanel = false; importError = ""; }}>
              {t("paste.skip")}
            </button>
          </div>
        </div>
      {/if}

      <!-- Before/After demo -->
      <div class="demo-preview">
        <div class="demo-divider">
          <span class="demo-divider-label">See the difference</span>
        </div>
        <div class="demo-columns">
          <div class="demo-col demo-before">
            <div class="demo-col-label">{t("home.without")}</div>
            <div class="demo-prompt">"Plan me a weekend trip"</div>
            <div class="demo-response">I'd love to help! Where are you thinking? What's your budget? Mountains or sea? How many people? Are you looking for relaxation or adventure?</div>
          </div>
          <div class="demo-col demo-after">
            <div class="demo-col-label">{t("home.with")}</div>
            <div class="demo-prompt">"Plan me a weekend trip"</div>
            <div class="demo-response">Krakow base, mountains direction — Szczawnica is 2h out. Labrador-friendly trail to Trzy Korony, ~$120 budget covers gas + accommodation.</div>
          </div>
        </div>
      </div>

      <p class="trust">{t("home.trust")}</p>
    </div>

  <!-- ─── SESSION IN PROGRESS ───────────────────────────────────── -->
  {:else if !profileExists && sessionInProgress}
    <div class="screen session-progress">
      <div class="brand">
        <img src={logoDark} alt="Meport" class="brand-logo" />
      </div>

      <div class="hero">
        <h1 class="headline">Profile in progress</h1>
        <p class="subline">You started building your profile. Continue where you left off.</p>
      </div>

      <div class="actions">
        <button class="btn-primary" onclick={continueSession}>
          <Icon name="arrow-right" size={16} />
          Continue
        </button>
        <button class="btn-ghost danger" onclick={() => showStartOver = true}>
          Start over
        </button>
      </div>

      {#if showStartOver}
        <div class="confirm-box">
          <p>Discard progress and start fresh?</p>
          <div class="confirm-actions">
            <button class="btn-danger-sm" onclick={startOver}>Yes, start over</button>
            <button class="btn-ghost-sm" onclick={() => showStartOver = false}>Cancel</button>
          </div>
        </div>
      {/if}
    </div>

  <!-- ─── PROFILE EXISTS ────────────────────────────────────────── -->
  {:else if profileExists && profile}
    <div class="screen has-profile">
      <div class="profile-header">
        <div class="profile-identity">
          <span class="dot"></span>
          <span class="profile-name">{profile.meta?.name ?? "Meport"}</span>
          <span class="completeness-badge">{Math.round(completeness * 100)}% complete</span>
        </div>
        <p class="profile-stats">{dimensionCount + inferredCount} dimensions · {dimensionCount} explicit</p>
      </div>

      <div class="action-cards">
        <button class="action-card" onclick={() => goTo("export")}>
          <Icon name="download" size={20} />
          <span class="card-label">{t("home.export")}</span>
          <span class="card-sub">{t("home.platforms")}</span>
        </button>
        <button class="action-card" onclick={async () => { const { initSmartDeepen } = await import("../lib/stores/profiling.svelte.js"); await initSmartDeepen(profile!); await goTo("profiling"); }}>
          <Icon name="layers" size={20} />
          <span class="card-label">{t("home.deepen")}</span>
          <span class="card-sub">{t("home.deepen_smart")}</span>
        </button>
        <button class="action-card" onclick={() => goTo("profile")}>
          <Icon name="edit" size={20} />
          <span class="card-label">Edit</span>
          <span class="card-sub">view & edit</span>
        </button>
      </div>

      {#if profile}
        {@const rules = exportRules(profile)}
        {#if rules.length > 0}
          <div class="rules-preview">
            <p class="rules-title">Your top rules:</p>
            <ul class="rules-list">
              {#each rules as rule}
                <li>{rule}</li>
              {/each}
            </ul>
          </div>
        {/if}
      {/if}

      <button class="btn-start-over" onclick={() => showStartOver = true}>
        <Icon name="trash" size={14} />
        Start over
      </button>

      {#if showStartOver}
        <div class="confirm-box">
          <p>{t("profile.delete_confirm")}</p>
          <div class="confirm-actions">
            <button class="btn-danger-sm" onclick={() => { clearProfile(); showStartOver = false; }}>Yes, delete</button>
            <button class="btn-ghost-sm" onclick={() => showStartOver = false}>Cancel</button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* ─── Layout ─────────────────────────────────────────────── */
  .home {
    min-height: 100vh;
    background: #0a0a0a;
    color: rgba(255, 255, 255, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1.5rem;
    font-family: inherit;
  }

  .screen {
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  /* ─── Brand ──────────────────────────────────────────────── */
  .brand {
    display: flex;
    align-items: center;
  }

  .brand-logo {
    height: 28px;
    width: auto;
    object-fit: contain;
    filter: drop-shadow(0 0 8px rgba(41, 239, 130, 0.15));
  }

  /* ─── Hero ───────────────────────────────────────────────── */
  .hero {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .headline {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.15;
    margin: 0;
    color: rgba(255, 255, 255, 0.95);
    white-space: pre-line;
  }

  .subline {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.6);
    margin: 0;
    line-height: 1.5;
  }

  /* ─── Buttons ────────────────────────────────────────────── */
  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .btn-primary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem 1.5rem;
    background: #29ef82;
    color: #0a0a0a;
    border: none;
    border-radius: 8px;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
    width: 100%;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-primary:active {
    transform: scale(0.98);
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-secondary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem 1.5rem;
    background: transparent;
    color: rgba(255, 255, 255, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
    width: 100%;
  }

  .btn-secondary:hover {
    border-color: rgba(255, 255, 255, 0.4);
    color: rgba(255, 255, 255, 0.95);
  }

  .btn-ghost {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.45);
    font-size: 0.875rem;
    cursor: pointer;
    padding: 0.5rem;
    text-align: center;
    transition: color 0.15s;
  }

  .btn-ghost:hover {
    color: rgba(255, 255, 255, 0.7);
  }

  .btn-ghost.danger:hover {
    color: #ef4444;
  }

  /* ─── Import panel ───────────────────────────────────────── */
  .import-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
  }

  .import-label {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.6);
    margin: 0;
  }

  .import-textarea {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.9);
    padding: 0.75rem;
    font-size: 0.875rem;
    font-family: inherit;
    resize: vertical;
    min-height: 100px;
    box-sizing: border-box;
  }

  .import-textarea:focus {
    outline: none;
    border-color: rgba(41, 239, 130, 0.4);
  }

  .import-modes {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .mode-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 6px;
    transition: background 0.1s;
  }

  .mode-option:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .mode-option input[type="radio"] {
    accent-color: #29ef82;
    flex-shrink: 0;
  }

  .mode-option span {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.85);
    font-weight: 500;
  }

  .mode-option small {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.4);
    margin-left: 0.25rem;
  }

  .import-error {
    font-size: 0.8125rem;
    color: #ef4444;
    margin: 0;
  }

  .import-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* ─── Before/After demo ──────────────────────────────────── */
  .demo-preview {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .demo-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .demo-divider::before,
  .demo-divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
  }

  .demo-divider-label {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.35);
    white-space: nowrap;
  }

  .demo-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .demo-col {
    padding: 1rem;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .demo-before {
    background: rgba(239, 68, 68, 0.06);
    border: 1px solid rgba(239, 68, 68, 0.12);
  }

  .demo-after {
    background: rgba(41, 239, 130, 0.06);
    border: 1px solid rgba(41, 239, 130, 0.12);
  }

  .demo-col-label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .demo-before .demo-col-label {
    color: rgba(239, 68, 68, 0.7);
  }

  .demo-after .demo-col-label {
    color: rgba(41, 239, 130, 0.7);
  }

  .demo-prompt {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.5);
    font-style: italic;
  }

  .demo-response {
    font-size: 0.8125rem;
    color: rgba(255, 255, 255, 0.75);
    line-height: 1.5;
  }

  /* ─── Trust line ─────────────────────────────────────────── */
  .trust {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.3);
    margin: 0;
    text-align: center;
  }

  /* ─── Profile dashboard ──────────────────────────────────── */
  .profile-header {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .profile-identity {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }

  .profile-name {
    font-size: 1.25rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.95);
  }

  .completeness-badge {
    font-size: 0.75rem;
    font-weight: 500;
    color: #29ef82;
    background: rgba(41, 239, 130, 0.1);
    border: 1px solid rgba(41, 239, 130, 0.2);
    border-radius: 20px;
    padding: 0.2rem 0.6rem;
    margin-left: auto;
  }

  .profile-stats {
    font-size: 0.8125rem;
    color: rgba(255, 255, 255, 0.5);
    margin: 0;
  }

  /* ─── Action cards ───────────────────────────────────────── */
  .action-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  .action-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 0.75rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    color: rgba(255, 255, 255, 0.85);
  }

  .action-card:hover {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .card-label {
    font-size: 0.8125rem;
    font-weight: 600;
    text-align: center;
  }

  .card-sub {
    font-size: 0.6875rem;
    color: rgba(255, 255, 255, 0.4);
    text-align: center;
  }

  /* ─── Rules preview ──────────────────────────────────────── */
  .rules-preview {
    padding: 1rem 1.25rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 8px;
  }

  .rules-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 0.625rem;
  }

  .rules-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .rules-list li {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.75);
    padding-left: 1rem;
    position: relative;
    line-height: 1.4;
  }

  .rules-list li::before {
    content: "→";
    position: absolute;
    left: 0;
    color: #29ef82;
    font-size: 0.75rem;
  }

  /* ─── Start over ─────────────────────────────────────────── */
  .btn-start-over {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    background: transparent;
    border: 1px solid rgba(239, 68, 68, 0.15);
    border-radius: 6px;
    color: rgba(239, 68, 68, 0.5);
    font-size: 0.8125rem;
    padding: 0.5rem 1rem;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
    align-self: flex-start;
  }

  .btn-start-over:hover {
    border-color: rgba(239, 68, 68, 0.4);
    color: #ef4444;
  }

  /* ─── Confirm box ────────────────────────────────────────── */
  .confirm-box {
    padding: 1rem;
    background: rgba(239, 68, 68, 0.07);
    border: 1px solid rgba(239, 68, 68, 0.15);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .confirm-box p {
    margin: 0;
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.8);
  }

  .confirm-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-danger-sm {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    color: #ef4444;
    font-size: 0.8125rem;
    padding: 0.4rem 0.875rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-danger-sm:hover {
    background: rgba(239, 68, 68, 0.25);
  }

  .btn-ghost-sm {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.8125rem;
    padding: 0.4rem 0.875rem;
    cursor: pointer;
    transition: color 0.15s;
  }

  .btn-ghost-sm:hover {
    color: rgba(255, 255, 255, 0.8);
  }
</style>
