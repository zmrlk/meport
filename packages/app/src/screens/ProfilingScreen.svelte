<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "../components/Icon.svelte";
  import {
    getEvent, getAnswered, getIsComplete, getProfilingProfile,
    getAnimating, getTotalQuestions, getCurrentQuestionNumber,
    isAIMode, getAIMessages, getAILoading, getAIStreamingText, getAIOptions,
    getSynthesizing, getSynthesisResult,
    submitAnswer, advanceEvent, startAIInterview, sendAIMessage,
    finishEarly, canGoBack, goBack,
    initProfiling, selectPacksAndContinue,
    getSelectedPacks, togglePack,
  } from "../lib/stores/profiling.svelte.js";
  import { goTo, setProfile, hasApiKey } from "../lib/stores/app.svelte.js";
  import { t } from "../lib/i18n.svelte.js";

  // ---------------------------------------------------------------------------
  // Phase management
  // ---------------------------------------------------------------------------

  type Phase =
    | "scanning"
    | "scan-summary"
    | "pack-selection"
    | "ai-chat"
    | "question"
    | "pack-transition"
    | "summary";

  let phase = $state<Phase>("scanning");

  // Scan state
  let scanSignals = $state<{ label: string; value: string }[]>([]);
  let scanDone = $state(false);

  // Pack transition state
  let transitionLabel = $state("");

  // Custom answer
  let showCustomInput = $state(false);
  let customText = $state("");

  // Derived store values
  let event = $derived(getEvent());
  let answered = $derived(getAnswered());
  let complete = $derived(getIsComplete());
  let animating = $derived(getAnimating());
  let profile = $derived(getProfilingProfile());
  let totalQ = $derived(getTotalQuestions());
  let currentQ = $derived(getCurrentQuestionNumber());

  let aiActive = $derived(isAIMode());
  let aiMessages = $derived(getAIMessages());
  let aiLoading = $derived(getAILoading());
  let streamingText = $derived(getAIStreamingText());
  let aiOptions = $derived(getAIOptions());

  let synthesizing = $derived(getSynthesizing());
  let synthesisResult = $derived(getSynthesisResult());
  let selectedPacks = $derived(getSelectedPacks());

  let progressPercent = $derived.by(() => {
    if (phase === "scanning") return 5;
    if (phase === "scan-summary") return 10;
    if (phase === "pack-selection") return 15;
    if (phase === "summary") return 100;
    if (totalQ === 0) return 20;
    return Math.round(15 + (currentQ / totalQ) * 80);
  });

  // ---------------------------------------------------------------------------
  // Available packs
  // ---------------------------------------------------------------------------

  const availablePacks: { id: string; name: string; desc: string; sensitive: boolean }[] = [
    { id: "story",     name: "Story",     desc: t("packs.story_desc"),     sensitive: false },
    { id: "context",   name: "Context",   desc: t("packs.context_desc"),   sensitive: false },
    { id: "work",      name: "Work",       desc: t("packs.work_desc"),       sensitive: false },
    { id: "lifestyle", name: "Lifestyle", desc: t("packs.lifestyle_desc"), sensitive: false },
    { id: "health",    name: "Health",    desc: t("packs.health_desc"),    sensitive: true  },
    { id: "finance",   name: "Finance",   desc: t("packs.finance_desc"),   sensitive: true  },
    { id: "learning",  name: "Learning",  desc: t("packs.learning_desc"),  sensitive: false },
  ];

  // ---------------------------------------------------------------------------
  // Bootstrap: run scan on mount
  // ---------------------------------------------------------------------------

  onMount(() => {
    runScan();
  });

  async function runScan() {
    phase = "scanning";
    scanSignals = [];
    scanDone = false;

    await initProfiling();

    // Collect browser signals
    const sigs: { label: string; value: string }[] = [];
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) sigs.push({ label: t("scan.timezone"), value: tz });

    const lang = navigator.language || navigator.languages?.[0] || "";
    if (lang) sigs.push({ label: t("scan.language"), value: lang });

    const platform = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform
      || navigator.platform || "";
    if (platform) sigs.push({ label: t("scan.platform"), value: platform });

    const hour = new Date().getHours();
    const timeLabel = hour < 6 ? t("scan.night") : hour < 12 ? t("scan.morning") : hour < 18 ? t("scan.afternoon") : t("scan.evening");
    sigs.push({ label: t("scan.local_time"), value: timeLabel });

    scanSignals = sigs;
    scanDone = true;

    // Small delay so user sees the scan completing
    await sleep(600);
    phase = "scan-summary";
  }

  // ---------------------------------------------------------------------------
  // Navigation handlers
  // ---------------------------------------------------------------------------

  async function handleScanContinue() {
    if (hasApiKey()) {
      phase = "ai-chat";
      await startAIInterview();
    } else {
      phase = "pack-selection";
    }
  }

  async function handlePacksConfirm() {
    if (selectedPacks.length === 0) {
      // Default: select all non-sensitive
      for (const p of availablePacks.filter(p => !p.sensitive)) {
        await togglePack(p.id as never);
      }
    }
    await selectPacksAndContinue();
    phase = "question";
  }

  async function handleAnswer(value: string) {
    showCustomInput = false;
    customText = "";
    await submitAnswer(value);

    if (complete) {
      phase = "summary";
      return;
    }

    const next = getEvent();
    if (next?.type === "pack_transition") {
      transitionLabel = (next as { label?: string }).label ?? "";
      phase = "pack-transition";
      await sleep(900);
      await advanceEvent();
      phase = "question";
    }
  }

  async function handleCustomSubmit() {
    if (!customText.trim()) return;
    await handleAnswer(customText.trim());
  }

  async function handleAIOption(opt: string) {
    await sendAIMessage(opt);
    if (complete || synthesisResult) {
      phase = "summary";
    }
  }

  async function handleFinishEarly() {
    await finishEarly();
    phase = "summary";
  }

  async function handleConfirmProfile() {
    const p = profile;
    if (p) {
      setProfile(p);
    }
    goTo("reveal");
  }

  function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
  }

  // Redirect to home if there's nothing to do
  $effect(() => {
    if (!synthesizing && phase === "question" && !event && !complete) {
      goTo("home");
    }
  });
</script>

<div class="screen">

  <!-- Top bar -->
  <div class="topbar">
    <button
      class="back-btn"
      onclick={() => (phase === "scanning" || phase === "scan-summary") ? goTo("home") : goBack()}
      aria-label={t("profiling.back")}
    >
      <Icon name="arrow-left" size={16} />
    </button>

    <div class="progress-track">
      <div class="progress-fill" style="width: {progressPercent}%"></div>
    </div>

    {#if phase === "question" && totalQ > 0}
      <span class="q-counter">{currentQ}/{totalQ}</span>
    {:else if phase === "ai-chat"}
      <span class="q-counter">{t("profiling.ai_label")}</span>
    {:else}
      <span class="q-counter-placeholder"></span>
    {/if}

    <div class="topbar-end">
      {#if (phase === "question" && answered > 4) || (phase === "ai-chat" && aiMessages.length > 4)}
        <button class="finish-btn" onclick={handleFinishEarly}>
          {t("profiling.finish_early")}
        </button>
      {/if}
    </div>
  </div>

  <!-- ─── SCANNING ─────────────────────────────────────────────────────────── -->
  {#if phase === "scanning"}
    <div class="phase-area animate-fade-up">
      <div class="scan-spinner">
        <div class="spinner"></div>
      </div>
      <h2 class="phase-title">{t("profiling.scanning")}</h2>
      <div class="scan-items">
        {#each scanSignals as sig}
          <div class="scan-item">
            <span class="scan-label">{sig.label}</span>
            <span class="scan-value">{sig.value}</span>
          </div>
        {/each}
      </div>
    </div>

  <!-- ─── SCAN SUMMARY ─────────────────────────────────────────────────────── -->
  {:else if phase === "scan-summary"}
    <div class="phase-area animate-fade-up">
      <h2 class="phase-title">{t("profiling.found_title")}</h2>
      <div class="found-list">
        {#each scanSignals as sig}
          <div class="found-row">
            <Icon name="check" size={14} />
            <span class="found-label">{sig.label}</span>
            <span class="found-value">{sig.value}</span>
          </div>
        {/each}
        {#if scanSignals.length === 0}
          <p class="dim-text">{t("profiling.no_signals")}</p>
        {/if}
      </div>

      {#if hasApiKey()}
        <p class="ai-hint">{t("profiling.ai_available")}</p>
      {/if}

      <button class="primary-btn" onclick={handleScanContinue}>
        {hasApiKey() ? t("profiling.start_ai") : t("profiling.start_quiz")}
      </button>
    </div>

  <!-- ─── PACK SELECTION ───────────────────────────────────────────────────── -->
  {:else if phase === "pack-selection"}
    <div class="phase-area animate-fade-up">
      <h2 class="phase-title">{t("profiling.pack_title")}</h2>
      <p class="phase-sub">{t("profiling.pack_sub")}</p>

      <div class="pack-grid">
        {#each availablePacks as pack}
          <button
            class="pack-card {selectedPacks.includes(pack.id as never) ? 'selected' : ''}"
            onclick={() => togglePack(pack.id as never)}
          >
            <span class="pack-name">{pack.name}</span>
            <span class="pack-desc">{pack.desc}</span>
            {#if pack.sensitive}
              <span class="pack-sensitive">{t("profiling.sensitive")}</span>
            {/if}
          </button>
        {/each}
      </div>

      <button class="primary-btn" onclick={handlePacksConfirm}>
        {selectedPacks.length > 0 ? t("profiling.start_selected", { n: String(selectedPacks.length) }) : t("profiling.start_all")}
      </button>
    </div>

  <!-- ─── AI CHAT ──────────────────────────────────────────────────────────── -->
  {:else if phase === "ai-chat"}
    <div class="chat-area animate-fade-up">
      <div class="chat-messages">
        {#each aiMessages as msg}
          <div class="chat-bubble {msg.role === 'assistant' ? 'bubble-ai' : 'bubble-user'}">
            {msg.content}
          </div>
        {/each}

        {#if streamingText}
          <div class="chat-bubble bubble-ai streaming">
            {streamingText}<span class="cursor">|</span>
          </div>
        {:else if aiLoading}
          <div class="chat-bubble bubble-ai loading">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          </div>
        {/if}

        {#if synthesizing}
          <div class="synth-row">
            <div class="spinner small"></div>
            <span class="dim-text">{t("profiling.synthesizing")}</span>
          </div>
        {/if}
      </div>

      {#if aiOptions.length > 0 && !aiLoading && !streamingText && !synthesizing}
        <div class="options-grid">
          {#each aiOptions as opt}
            <button class="option-pill" onclick={() => handleAIOption(opt)}>{opt}</button>
          {/each}
        </div>
      {/if}
    </div>

  <!-- ─── QUESTION ─────────────────────────────────────────────────────────── -->
  {:else if phase === "question"}
    {#if event?.type === "question"}
      {@const q = event.question}
      <div class="question-card animate-fade-up">
        <div class="q-header">
          <span class="q-pack-label">{event.packLabel ?? ""}</span>
          <span class="q-number">{currentQ}/{totalQ}</span>
        </div>

        <h2 class="q-text">{q.text}</h2>

        {#if q.why_this_matters}
          <p class="q-hint">{q.why_this_matters}</p>
        {/if}

        <div class="options-grid">
          {#each q.options as opt}
            <button
              class="option-pill {animating ? 'disabled' : ''}"
              onclick={() => handleAnswer(opt.value)}
              disabled={animating}
            >
              {opt.label}
            </button>
          {/each}
        </div>

        {#if q.allow_custom}
          {#if showCustomInput}
            <div class="custom-input-row">
              <input
                class="custom-input"
                type="text"
                bind:value={customText}
                placeholder={t("profiling.custom_placeholder")}
                onkeydown={e => e.key === "Enter" && handleCustomSubmit()}
                autofocus
              />
              <button class="option-pill accent" onclick={handleCustomSubmit}>{t("profiling.submit")}</button>
            </div>
          {:else}
            <button class="custom-toggle" onclick={() => { showCustomInput = true; customText = ""; }}>
              {t("profiling.write_own")}
            </button>
          {/if}
        {/if}

        <div class="q-nav">
          {#if canGoBack()}
            <button class="nav-btn" onclick={() => goBack()}>{t("profiling.back")}</button>
          {:else}
            <span></span>
          {/if}
          <button class="nav-btn dim" onclick={() => handleAnswer("__skip__")}>{t("profiling.skip")}</button>
        </div>
      </div>
    {:else if event?.type === "complete" || complete}
      <!-- Trigger summary -->
      {(async () => { phase = "summary"; return ""; })()}
    {/if}

  <!-- ─── PACK TRANSITION ──────────────────────────────────────────────────── -->
  {:else if phase === "pack-transition"}
    <div class="phase-area animate-fade-up">
      <div class="spinner"></div>
      <p class="transition-label">{transitionLabel || t("profiling.next_pack")}</p>
    </div>

  <!-- ─── SUMMARY ──────────────────────────────────────────────────────────── -->
  {:else if phase === "summary"}
    <div class="phase-area animate-fade-up">
      {#if synthesizing}
        <div class="spinner"></div>
        <p class="dim-text">{t("profiling.synthesizing")}</p>
      {:else if profile}
        <h2 class="phase-title">{t("profiling.summary_title")}</h2>

        <div class="summary-dims">
          {#each Object.entries(profile.explicit).slice(0, 10) as [key, dim]}
            <div class="summary-row">
              <span class="summary-key">{key.split(".").pop()?.replace(/_/g, " ") ?? key}</span>
              <span class="summary-val">{Array.isArray(dim.value) ? dim.value.join(", ") : String(dim.value)}</span>
            </div>
          {/each}
        </div>

        {#if profile.export_rules && profile.export_rules.length > 0}
          <div class="rules-preview">
            <p class="rules-label">{t("profiling.top_rules")}</p>
            {#each profile.export_rules.slice(0, 3) as rule}
              <div class="rule-row">
                <span class="rule-bullet">→</span>
                <span class="rule-text">{rule}</span>
              </div>
            {/each}
          </div>
        {/if}

        <button class="primary-btn accent" onclick={handleConfirmProfile}>
          {t("profiling.confirm")}
        </button>
        <button class="secondary-btn" onclick={() => goTo("home")}>
          {t("profiling.save_later")}
        </button>
      {:else}
        <p class="dim-text">{t("profiling.no_profile")}</p>
        <button class="nav-btn" onclick={() => goTo("home")}>{t("nav.home")}</button>
      {/if}
    </div>
  {/if}

</div>

<style>
  /* ─── Layout ─────────────────────────────────────────────────────────────── */

  .screen {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    background: var(--color-bg, #0a0a0a);
    color: rgba(255, 255, 255, 0.9);
    font-family: Inter, system-ui, sans-serif;
    overflow: hidden;
  }

  /* ─── Top bar ─────────────────────────────────────────────────────────────── */

  .topbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    flex-shrink: 0;
  }

  .back-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    transition: color 0.15s;
  }

  .back-btn:hover {
    color: rgba(255, 255, 255, 0.9);
  }

  .progress-track {
    flex: 1;
    height: 3px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #29ef82;
    border-radius: 2px;
    transition: width 0.4s ease;
  }

  .q-counter {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    font-family: "JetBrains Mono", monospace;
    white-space: nowrap;
  }

  .q-counter-placeholder {
    width: 40px;
  }

  .topbar-end {
    min-width: 80px;
    display: flex;
    justify-content: flex-end;
  }

  .finish-btn {
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .finish-btn:hover {
    border-color: rgba(255, 255, 255, 0.3);
    color: rgba(255, 255, 255, 0.8);
  }

  /* ─── Phase areas ─────────────────────────────────────────────────────────── */

  .phase-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 20px;
    gap: 16px;
    overflow-y: auto;
  }

  .phase-title {
    font-size: 20px;
    font-weight: 600;
    text-align: center;
    margin: 0;
    color: rgba(255, 255, 255, 0.95);
  }

  .phase-sub {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.5);
    text-align: center;
    margin: 0;
  }

  /* ─── Scan ────────────────────────────────────────────────────────────────── */

  .scan-spinner {
    margin-bottom: 8px;
  }

  .scan-items {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    max-width: 320px;
  }

  .scan-item {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
  }

  .scan-label {
    color: rgba(255, 255, 255, 0.5);
  }

  .scan-value {
    color: rgba(255, 255, 255, 0.8);
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
  }

  /* ─── Found list ──────────────────────────────────────────────────────────── */

  .found-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    max-width: 340px;
  }

  .found-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.75);
  }

  .found-row :global(svg) {
    color: #29ef82;
    flex-shrink: 0;
  }

  .found-label {
    color: rgba(255, 255, 255, 0.45);
    font-size: 13px;
    flex-shrink: 0;
  }

  .found-value {
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
  }

  .ai-hint {
    font-size: 12px;
    color: #29ef82;
    text-align: center;
    margin: 0;
  }

  /* ─── Pack grid ───────────────────────────────────────────────────────────── */

  .pack-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    width: 100%;
    max-width: 380px;
  }

  .pack-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 12px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .pack-card:hover {
    border-color: rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.05);
  }

  .pack-card.selected {
    border-color: #29ef82;
    background: rgba(41, 239, 130, 0.06);
  }

  .pack-name {
    font-size: 14px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
  }

  .pack-desc {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.45);
    line-height: 1.4;
  }

  .pack-sensitive {
    font-size: 11px;
    color: rgba(255, 180, 0, 0.7);
    margin-top: 2px;
  }

  /* ─── AI Chat ─────────────────────────────────────────────────────────────── */

  .chat-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .chat-bubble {
    max-width: 85%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.5;
    word-break: break-word;
  }

  .bubble-ai {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    align-self: flex-start;
    color: rgba(255, 255, 255, 0.85);
    border-radius: 4px 12px 12px 12px;
  }

  .bubble-user {
    background: rgba(41, 239, 130, 0.1);
    border: 1px solid rgba(41, 239, 130, 0.2);
    align-self: flex-end;
    color: rgba(255, 255, 255, 0.9);
    border-radius: 12px 4px 12px 12px;
  }

  .bubble-ai.loading {
    display: flex;
    gap: 4px;
    align-items: center;
    padding: 12px 16px;
  }

  .dot {
    width: 6px;
    height: 6px;
    background: rgba(255, 255, 255, 0.4);
    border-radius: 50%;
    animation: blink 1.2s infinite;
  }

  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes blink {
    0%, 80%, 100% { opacity: 0.3; }
    40% { opacity: 1; }
  }

  .cursor {
    animation: cursor-blink 0.8s infinite;
    color: #29ef82;
  }

  @keyframes cursor-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  .synth-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
  }

  /* ─── Options grid ────────────────────────────────────────────────────────── */

  .options-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 20px 16px;
  }

  .option-pill {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    padding: 8px 14px;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }

  .option-pill:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.25);
    color: rgba(255, 255, 255, 0.95);
  }

  .option-pill.accent {
    border-color: #29ef82;
    color: #29ef82;
  }

  .option-pill.accent:hover {
    background: rgba(41, 239, 130, 0.1);
  }

  .option-pill.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  /* ─── Question card ───────────────────────────────────────────────────────── */

  .question-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 24px 20px 16px;
    gap: 16px;
    overflow-y: auto;
  }

  .q-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .q-pack-label {
    font-size: 11px;
    font-family: "JetBrains Mono", monospace;
    color: rgba(255, 255, 255, 0.3);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .q-number {
    font-size: 11px;
    font-family: "JetBrains Mono", monospace;
    color: rgba(255, 255, 255, 0.3);
  }

  .q-text {
    font-size: 18px;
    font-weight: 500;
    line-height: 1.4;
    margin: 0;
    color: rgba(255, 255, 255, 0.95);
  }

  .q-hint {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.35);
    margin: 0;
    line-height: 1.5;
  }

  .custom-input-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .custom-input {
    flex: 1;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.9);
    font-size: 14px;
    font-family: inherit;
    padding: 8px 12px;
    outline: none;
  }

  .custom-input:focus {
    border-color: rgba(41, 239, 130, 0.4);
  }

  .custom-toggle {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.35);
    font-size: 13px;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
    text-align: left;
    transition: color 0.15s;
  }

  .custom-toggle:hover {
    color: rgba(255, 255, 255, 0.6);
  }

  .q-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: auto;
    padding-top: 8px;
  }

  /* ─── Pack transition ─────────────────────────────────────────────────────── */

  .transition-label {
    font-size: 15px;
    color: rgba(255, 255, 255, 0.55);
    text-align: center;
    margin: 0;
  }

  /* ─── Summary ─────────────────────────────────────────────────────────────── */

  .summary-dims {
    width: 100%;
    max-width: 380px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    font-size: 13px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
  }

  .summary-key {
    color: rgba(255, 255, 255, 0.45);
    text-transform: capitalize;
    flex-shrink: 0;
  }

  .summary-val {
    color: rgba(255, 255, 255, 0.85);
    text-align: right;
    font-size: 13px;
  }

  .rules-preview {
    width: 100%;
    max-width: 380px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .rules-label {
    font-size: 11px;
    font-family: "JetBrains Mono", monospace;
    color: rgba(255, 255, 255, 0.3);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0 0 4px;
  }

  .rule-row {
    display: flex;
    gap: 8px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.65);
    line-height: 1.5;
  }

  .rule-bullet {
    color: #29ef82;
    flex-shrink: 0;
  }

  /* ─── Shared buttons ──────────────────────────────────────────────────────── */

  .primary-btn {
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.9);
    font-size: 15px;
    font-weight: 500;
    padding: 12px 28px;
    border-radius: 12px;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
    width: 100%;
    max-width: 340px;
  }

  .primary-btn:hover {
    background: rgba(255, 255, 255, 0.11);
    border-color: rgba(255, 255, 255, 0.25);
  }

  .primary-btn.accent {
    background: rgba(41, 239, 130, 0.1);
    border-color: #29ef82;
    color: #29ef82;
  }

  .primary-btn.accent:hover {
    background: rgba(41, 239, 130, 0.16);
  }

  .secondary-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.35);
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
    padding: 4px 0;
    transition: color 0.15s;
  }

  .secondary-btn:hover {
    color: rgba(255, 255, 255, 0.6);
  }

  .nav-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.45);
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
    padding: 6px 0;
    transition: color 0.15s;
  }

  .nav-btn:hover {
    color: rgba(255, 255, 255, 0.75);
  }

  .nav-btn.dim {
    color: rgba(255, 255, 255, 0.3);
  }

  /* ─── Spinner ─────────────────────────────────────────────────────────────── */

  .spinner {
    width: 28px;
    height: 28px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-top-color: #29ef82;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .spinner.small {
    width: 16px;
    height: 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ─── Utility ─────────────────────────────────────────────────────────────── */

  .dim-text {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.35);
    text-align: center;
    margin: 0;
  }

  .animate-fade-up {
    animation: fadeUp 0.2s ease-out;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
