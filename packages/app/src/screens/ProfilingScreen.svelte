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
    runFileScan, getIsFileScanAvailable, injectScanData,
    analyzeScanData, getScanAnalysis, getScanAnalyzing, getScanAnalysisError,
    getScanStreamText, waitForQuestions,
    synthesizeProfile, getSynthesisError,
    getIsDeepening,
    type ScanAnalysisSection,
  } from "../lib/stores/profiling.svelte.js";
  import { goTo, setProfile, hasApiKey, getApiProvider } from "../lib/stores/app.svelte.js";
  import { getLocale } from "../lib/i18n.svelte.js";
  import { t } from "../lib/i18n.svelte.js";
  import { isTauri, scanSystem, type SystemScanResult } from "../lib/tauri-bridge.js";

  // ---------------------------------------------------------------------------
  // Phase management
  // ---------------------------------------------------------------------------

  type Phase =
    | "scan-consent"
    | "scanning"
    | "scan-analysis"
    | "scan-verify"
    | "scan-summary"
    | "pack-selection"
    | "ai-chat"
    | "question"
    | "pack-transition"
    | "summary";

  let phase = $state<Phase>("scan-consent");
  let phaseHistory = $state<Phase[]>([]);

  // Transient phases (loading screens) — don't add to back history
  const transientPhases: Set<Phase> = new Set(["scanning", "scan-analysis", "pack-transition"]);

  function goToPhase(next: Phase) {
    if (!transientPhases.has(phase)) {
      phaseHistory = [...phaseHistory, phase];
    }
    phase = next;
  }

  // Scan consent — what user allows us to scan
  type ScanArea = "folders" | "apps" | "browser" | "devtools" | "shell" | "git" | "screentime" | "writing";
  let isTauriApp = $state(false);
  let consentAreas = $state<Set<ScanArea>>(new Set());

  // Scan state
  let scanSignals = $state<{ label: string; value: string }[]>([]);
  let scanDone = $state(false);
  let scanStep = $state("");
  let fullScanResult = $state<SystemScanResult | null>(null);

  // Scan summary state — which categories are expanded / excluded
  let expandedCats = $state<Set<string>>(new Set());
  let excludedCats = $state<Set<string>>(new Set());

  function toggleExpand(cat: string) {
    const next = new Set(expandedCats);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    expandedCats = next;
  }

  function toggleExclude(cat: string) {
    const next = new Set(excludedCats);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    excludedCats = next;
  }

  // Pack transition state
  let transitionLabel = $state("");

  // Custom answer
  let showCustomInput = $state(false);
  let customText = $state("");

  // File scan available (File System Access API)
  let fileScanOk = $state(false);

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

  let scanAnalysisResult = $derived(getScanAnalysis());
  let scanAnalyzing = $derived(getScanAnalyzing());
  let scanAnalysisError = $derived(getScanAnalysisError());
  let scanStreamText = $derived(getScanStreamText());
  let synthesisError = $derived(getSynthesisError());

  // Analysis progress timer
  let analysisElapsed = $state(0);
  let analysisTimer: ReturnType<typeof setInterval> | null = null;
  let analysisStepIndex = $state(0);

  const analysisSteps = [
    { icon: "📂", text: "Czytam strukturę folderów..." },
    { icon: "🔍", text: "Szukam wzorców w nazewnictwie..." },
    { icon: "⚙️", text: "Analizuję zainstalowane aplikacje..." },
    { icon: "🌐", text: "Sprawdzam zakładki i historię..." },
    { icon: "💻", text: "Profiluję narzędzia deweloperskie..." },
    { icon: "🧠", text: "Łączę kropki między źródłami..." },
    { icon: "📊", text: "Buduję profil behawioralny..." },
    { icon: "✨", text: "Finalizuję analizę..." },
  ];

  // Start/stop timer when entering/leaving scan-analysis
  $effect(() => {
    if (phase === "scan-analysis" && !scanAnalysisError) {
      analysisElapsed = 0;
      analysisStepIndex = 0;
      analysisTimer = setInterval(() => {
        analysisElapsed++;
        // Cycle through steps every ~12 seconds
        if (analysisElapsed % 12 === 0 && analysisStepIndex < analysisSteps.length - 1) {
          analysisStepIndex++;
        }
      }, 1000);
    } else if (analysisTimer) {
      clearInterval(analysisTimer);
      analysisTimer = null;
    }
  });

  // Correction input state
  let correctionText = $state("");

  // Pre-generated interview questions (from scan analysis)
  let interviewQuestions = $derived(scanAnalysisResult?.interview_questions ?? []);
  let interviewIndex = $state(0);
  let interviewAnswers = $state<Record<string, string>>({});
  let buildingProfile = $state(false);

  let progressPercent = $derived.by(() => {
    if (phase === "scan-consent") return 0;
    if (phase === "scanning") return 5;
    if (phase === "scan-analysis") return 15;
    if (phase === "scan-verify") return 25;
    if (phase === "scan-summary") return 10;
    if (phase === "pack-selection") return 30;
    if (phase === "summary") return 100;
    // AI interview questions (pre-generated)
    if (phase === "ai-chat" && interviewQuestions.length > 0) {
      return Math.round(30 + (interviewIndex / interviewQuestions.length) * 65);
    }
    // Pack questions
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

  // Scan consent area definitions
  // needsTauri = only in desktop app, needsFileApi = needs showDirectoryPicker (Chrome/Edge)
  const scanAreaDefs: { id: ScanArea; icon: string; needsTauri: boolean; needsFileApi: boolean }[] = [
    { id: "folders",    icon: "folder",    needsTauri: false, needsFileApi: true },
    { id: "apps",       icon: "layout",    needsTauri: true,  needsFileApi: false },
    { id: "browser",    icon: "globe",     needsTauri: false, needsFileApi: false },
    { id: "devtools",   icon: "code",      needsTauri: true,  needsFileApi: false },
    { id: "shell",      icon: "terminal",  needsTauri: true,  needsFileApi: false },
    { id: "git",        icon: "git-branch",needsTauri: true,  needsFileApi: false },
    { id: "screentime", icon: "clock",     needsTauri: true,  needsFileApi: false },
    { id: "writing",    icon: "edit",      needsTauri: false, needsFileApi: false },
  ];

  function isAreaAvailable(area: typeof scanAreaDefs[number]): boolean {
    if (area.needsTauri && !isTauriApp) return false;
    // In Tauri, folders use native FS — no need for File System Access API
    if (area.needsFileApi && !isTauriApp && !fileScanOk) return false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  onMount(async () => {
    isTauriApp = isTauri();
    fileScanOk = getIsFileScanAvailable();

    // If deepening (category or smart deepen), skip scan and go straight to questions
    // Do NOT call initProfiling() — the store already has questions from initCategoryDeepening/initDeepening
    if (getIsDeepening()) {
      phase = "question";
      return;
    }

    // Pre-select all available areas
    const defaults = new Set<ScanArea>();
    for (const area of scanAreaDefs) {
      if (isAreaAvailable(area)) defaults.add(area.id);
    }
    consentAreas = defaults;

    // Restore scan state after hot-reload
    try {
      const saved = sessionStorage.getItem("meport:scan-state");
      if (saved) {
        const state = JSON.parse(saved);
        if (state.phase && state.fullScanResult) {
          fullScanResult = state.fullScanResult;
          scanSignals = state.scanSignals ?? [];
          scanDone = true;
          phase = state.phase as Phase;
          sessionStorage.removeItem("meport:scan-state");
          await initProfiling();
          return;
        }
      }
    } catch {}

    await initProfiling();
  });

  // Persist scan state before unload (hot-reload protection)
  function saveScanState() {
    if (fullScanResult && (phase === "scan-summary" || phase === "ai-chat")) {
      sessionStorage.setItem("meport:scan-state", JSON.stringify({
        phase,
        fullScanResult,
        scanSignals,
      }));
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", saveScanState);
  }

  function toggleConsent(area: ScanArea) {
    const next = new Set(consentAreas);
    if (next.has(area)) next.delete(area);
    else next.add(area);
    consentAreas = next;
  }

  // ---------------------------------------------------------------------------
  // Scan execution — runs based on consent choices
  // ---------------------------------------------------------------------------

  async function runScan() {
    goToPhase("scanning");
    scanSignals = [];
    scanDone = false;
    fullScanResult = null;

    const sigs: { label: string; value: string }[] = [];

    // 1. Always collect browser signals (free, no consent needed)
    scanStep = t("scan.language");
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

    // 2. Tauri deep scan — use Rust scan_system command
    if (isTauriApp && consentAreas.size > 0) {
      scanStep = t("profiling.deep_scanning");
      try {
        const areas = [...consentAreas];
        const result = await scanSystem(areas);
        fullScanResult = result;

        // Convert scan results to display signals
        for (const [category, items] of Object.entries(result.categories)) {
          const count = items.length;
          const preview = items.slice(0, 3).join(", ");
          const suffix = count > 3 ? ` +${count - 3}` : "";
          sigs.push({ label: category, value: `${preview}${suffix}` });
        }

        if (result.privacy_filtered > 0) {
          sigs.push({ label: t("profiling.consent_privacy"), value: `${result.privacy_filtered} filtered` });
        }
      } catch (err) {
        // Scan failed — continue with browser signals only
        console.warn("[meport] Tauri scan failed:", err);
      }
    } else if (!isTauriApp) {
      // 3. Browser-mode: File System Access API for folders
      if (consentAreas.has("folders") && fileScanOk) {
        scanStep = t("profiling.consent_folders");
        try {
          const ok = await runFileScan();
          if (ok) {
            sigs.push({ label: t("profiling.consent_folders"), value: "scanned" });
          }
        } catch {
          // User cancelled picker — continue silently
        }
      }

    }

    scanSignals = sigs;
    scanDone = true;
    scanStep = "";

    // ALWAYS show scan-summary first — user reviews and excludes categories BEFORE AI sees anything
    await sleep(400);
    goToPhase("scan-summary");
  }

  // ---------------------------------------------------------------------------
  // Navigation handlers
  // ---------------------------------------------------------------------------

  async function handleConsentContinue() {
    await runScan();
  }

  async function handleConsentSkip() {
    // Skip all scanning, go straight to profiling
    consentAreas = new Set();
    goToPhase("scanning");
    scanSignals = [];
    scanDone = false;

    // Minimal browser signals only
    const sigs: { label: string; value: string }[] = [];
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) sigs.push({ label: t("scan.timezone"), value: tz });
    const lang = navigator.language || navigator.languages?.[0] || "";
    if (lang) sigs.push({ label: t("scan.language"), value: lang });
    scanSignals = sigs;
    scanDone = true;

    await sleep(300);

    if (hasApiKey()) {
      goToPhase("ai-chat");
      await startAIInterview();
    } else {
      goToPhase("pack-selection");
    }
  }

  let waitingForQuestions = $state(false);

  async function handleVerifyCorrect() {
    if (interviewQuestions.length > 0) {
      // Pre-generated questions available — fast path
      interviewIndex = 0;
      interviewAnswers = {};
      goToPhase("ai-chat");
    } else {
      // Questions still generating — wait up to 30s with loading indicator
      waitingForQuestions = true;
      await waitForQuestions();
      waitingForQuestions = false;

      if (interviewQuestions.length > 0) {
        interviewIndex = 0;
        interviewAnswers = {};
        goToPhase("ai-chat");
      } else {
        // Questions failed — fallback to AI chat
        goToPhase("ai-chat");
        await startAIInterview();
      }
    }
  }

  async function handleVerifyFix() {
    if (correctionText.trim()) {
      injectScanData(
        (fullScanResult
          ? Object.entries(fullScanResult.categories)
              .map(([cat, items]) => `### ${cat}\n${items.join("\n")}`)
              .join("\n\n")
          : "") +
        `\n\n### USER CORRECTIONS\n${correctionText.trim()}`
      );
    }

    if (interviewQuestions.length > 0) {
      interviewIndex = 0;
      interviewAnswers = {};
      goToPhase("ai-chat");
    } else {
      goToPhase("ai-chat");
      await startAIInterview();
    }
  }

  function handleInterviewAnswer(questionId: string, answer: string) {
    interviewAnswers = { ...interviewAnswers, [questionId]: answer };
    if (interviewIndex < interviewQuestions.length - 1) {
      interviewIndex++;
    } else {
      // All questions answered — build final profile
      buildFinalProfile();
    }
  }

  async function buildFinalProfile() {
    buildingProfile = true;
    goToPhase("summary");

    try {
      await synthesizeProfile(
        scanAnalysisResult,
        interviewAnswers,
        fullScanResult?.categories ?? {},
        correctionText.trim() || undefined,
      );
    } catch (err) {
      console.error("[meport] Final synthesis failed:", err);
    }

    buildingProfile = false;
  }

  async function handleScanContinue() {
    if (!fullScanResult) {
      if (hasApiKey()) {
        goToPhase("ai-chat");
        await startAIInterview();
      } else {
        goToPhase("pack-selection");
      }
      return;
    }

    // Build scan text from NON-excluded categories only
    const scanText = Object.entries(fullScanResult.categories)
      .filter(([cat]) => !excludedCats.has(cat))
      .map(([cat, items]) => `### ${cat}\n${items.join("\n")}`)
      .join("\n\n");

    injectScanData(scanText, fullScanResult.username);

    // If AI available → analyze AFTER user has reviewed and excluded
    if (scanText.trim() && hasApiKey()) {
      goToPhase("scan-analysis");

      try {
        const analysisResult = await analyzeScanData(scanText);

        if (analysisResult) {
          goToPhase("scan-verify");
        } else {
          // Analysis returned null — skip to AI chat or pack selection
          goToPhase("ai-chat");
          await startAIInterview();
        }
      } catch {
        // Analysis crashed — skip to AI chat
        goToPhase("ai-chat");
        await startAIInterview();
      }
    } else if (hasApiKey()) {
      goToPhase("ai-chat");
      await startAIInterview();
    } else {
      goToPhase("pack-selection");
    }
  }

  async function handlePacksConfirm() {
    if (selectedPacks.length === 0) {
      // Default: select all non-sensitive
      for (const p of availablePacks.filter(p => !p.sensitive)) {
        await togglePack(p.id as never);
      }
    }
    await selectPacksAndContinue(selectedPacks as any);
    goToPhase("question");
  }

  async function handleAnswer(value: string) {
    showCustomInput = false;
    customText = "";
    await submitAnswer(value);

    if (complete) {
      goToPhase("summary");
      return;
    }

    const next = getEvent();
    if (next?.type === "pack_transition") {
      transitionLabel = (next as { label?: string }).label ?? "";
      phase = "pack-transition"; // temporary — not tracked in history
      await sleep(900);
      await advanceEvent();
      phase = "question"; // return to question — not tracked
    }
  }

  async function handleCustomSubmit() {
    if (!customText.trim()) return;
    await handleAnswer(customText.trim());
  }

  async function handleAIOption(opt: string) {
    await sendAIMessage(opt);
    if (complete || synthesisResult) {
      goToPhase("summary");
    }
  }

  async function handleFinishEarly() {
    if (phase === "ai-chat" && interviewQuestions.length > 0) {
      // Interview questions path — build profile from what we have
      await buildFinalProfile();
    } else {
      await finishEarly();
      goToPhase("summary");
    }
  }

  async function handleConfirmProfile() {
    const p = profile;
    if (p) {
      setProfile(p);
    }
    goTo("profile");
  }

  function handleBack() {
    if (phaseHistory.length > 0) {
      const prev = phaseHistory[phaseHistory.length - 1];
      phaseHistory = phaseHistory.slice(0, -1);
      phase = prev;
    } else {
      goTo(getIsDeepening() ? "profile" : "home");
    }
  }

  function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
  }

  // Pack question complete → go to summary
  $effect(() => {
    if (phase === "question" && (event?.type === "complete" || complete) && answered > 0) {
      goToPhase("summary");
    }
  });

  // Redirect to home only if we've started answering and run out of questions
  $effect(() => {
    if (!synthesizing && phase === "question" && !event && !complete && answered > 0) {
      goTo("home");
    }
  });
</script>

<div class="screen">

  <!-- Top bar -->
  <div class="topbar">
    <button
      class="back-btn"
      onclick={handleBack}
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
      {#if (phase === "question" && answered > 4) || (phase === "ai-chat" && (aiMessages.length > 4 || interviewIndex > 2))}
        <button class="finish-btn" onclick={handleFinishEarly}>
          {t("profiling.finish_early")}
        </button>
      {/if}
    </div>
  </div>

  <!-- ─── SCAN CONSENT ──────────────────────────────────────────────────────── -->
  {#if phase === "scan-consent"}
    <div class="phase-area animate-fade-up">
      <h2 class="phase-title">{t("profiling.consent_title")}</h2>
      <p class="phase-sub">{t("profiling.consent_sub")}</p>

      <div class="consent-grid">
        {#each scanAreaDefs as area}
          {@const available = isAreaAvailable(area)}
          {@const enabled = consentAreas.has(area.id)}
          <button
            class="consent-card {enabled && available ? 'selected' : ''} {!available ? 'disabled' : ''}"
            onclick={() => available && toggleConsent(area.id)}
            disabled={!available}
          >
            <Icon name={area.icon} size={18} />
            <span class="consent-name">{t(`profiling.consent_${area.id}`)}</span>
            <span class="consent-desc">{t(`profiling.consent_${area.id}_desc`)}</span>
            {#if !available}
              <span class="consent-locked">{t("profiling.consent_needs_desktop")}</span>
            {/if}
          </button>
        {/each}
      </div>

      <p class="privacy-note">{t("profiling.consent_privacy")}</p>

      <button class="primary-btn" onclick={handleConsentContinue}>
        {t("profiling.consent_scan_btn")}
      </button>
      <button class="secondary-btn" onclick={handleConsentSkip}>
        {t("profiling.consent_skip")}
      </button>
    </div>

  <!-- ─── SCANNING ─────────────────────────────────────────────────────────── -->
  {:else if phase === "scanning"}
    <div class="phase-area animate-fade-up">
      <div class="scan-spinner">
        <div class="spinner"></div>
      </div>
      <h2 class="phase-title">{t("profiling.deep_scanning")}</h2>
      {#if scanStep}
        <p class="dim-text">{t("profiling.scan_step", { step: scanStep })}</p>
      {/if}
      <div class="scan-items">
        {#each scanSignals as sig}
          <div class="scan-item">
            <span class="scan-label">{sig.label}</span>
            <span class="scan-value">{sig.value}</span>
          </div>
        {/each}
      </div>
    </div>

  <!-- ─── SCAN ANALYSIS (AI processing) ──────────────────────────────────── -->
  {:else if phase === "scan-analysis"}
    <div class="phase-area animate-fade-up">
      {#if scanAnalysisError}
        <h2 class="phase-title">{t("profiling.analyzing_failed")}</h2>
        <p class="dim-text error-text">{scanAnalysisError}</p>
        <button class="primary-btn" onclick={async () => {
          if (fullScanResult) {
            const scanText = Object.entries(fullScanResult.categories)
              .filter(([cat]) => !excludedCats.has(cat))
              .map(([cat, items]) => `### ${cat}\n${items.join("\n")}`)
              .join("\n\n");
            const result = await analyzeScanData(scanText);
            if (result) goToPhase("scan-verify");
          }
        }}>
          {t("profiling.retry")}
        </button>
        <button class="secondary-btn" onclick={() => goToPhase("pack-selection")}>
          {t("profiling.consent_skip")}
        </button>
      {:else}
        <div class="scan-spinner">
          <div class="spinner"></div>
        </div>
        <h2 class="phase-title">{t("profiling.analyzing_title")}</h2>
        <p class="dim-text">{t("profiling.analyzing_sub")}</p>

        <!-- Animated analysis steps -->
        <div class="analysis-progress">
          {#each analysisSteps.slice(0, analysisStepIndex + 1) as step, i}
            <div class="analysis-step {i === analysisStepIndex ? 'active' : 'done'}">
              <span class="step-icon">{step.icon}</span>
              <span class="step-text">{step.text}</span>
              {#if i < analysisStepIndex}
                <span class="step-check">✓</span>
              {/if}
            </div>
          {/each}
        </div>

        <p class="analysis-timer">{Math.floor(analysisElapsed / 60)}:{String(analysisElapsed % 60).padStart(2, "0")} / ~2:00</p>

        {#if scanStreamText.length > 0}
          <div class="stream-preview">
            <pre class="stream-text">{scanStreamText.slice(-400)}</pre>
          </div>
        {/if}
      {/if}
    </div>

  <!-- ─── SCAN VERIFY (wow screen — AI analysis results) ─────────────────── -->
  {:else if phase === "scan-verify"}
    <div class="phase-area scan-verify-area animate-fade-up">
      {#if scanAnalysisResult}
        <div class="analysis-sections">
          {#each scanAnalysisResult.sections as section}
            <div class="analysis-card">
              <div class="analysis-header">
                <span class="analysis-icon">{section.icon}</span>
                <span class="analysis-title">{section.title}</span>
                <span class="analysis-confidence {section.confidence}">{section.confidence}</span>
              </div>
              <div class="analysis-findings">
                {#each section.findings as finding}
                  <p class="analysis-finding">{finding}</p>
                {/each}
              </div>
              {#if section.questions}
                <div class="analysis-questions">
                  {#each section.questions as q}
                    <p class="analysis-question">? {q}</p>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>

        {#if scanAnalysisResult.open_questions.length > 0}
          <div class="open-questions">
            <p class="oq-label">{t("profiling.verify_questions")}</p>
            {#each scanAnalysisResult.open_questions as q, i}
              <div class="oq-row">
                <p class="oq-item">{q}</p>
                <input
                  class="oq-input"
                  type="text"
                  placeholder={t("profiling.verify_fix_placeholder")}
                  onchange={(e: Event) => {
                    const val = (e.target as HTMLInputElement).value;
                    if (val.trim()) {
                      interviewAnswers = { ...interviewAnswers, [`oq_${i}`]: `${q} → ${val}` };
                    }
                  }}
                />
              </div>
            {/each}
          </div>
        {/if}

        <div class="verify-actions">
          <button class="primary-btn accent" onclick={handleVerifyCorrect} disabled={waitingForQuestions}>
            {#if waitingForQuestions}
              <span class="dot"></span><span class="dot"></span><span class="dot"></span> {t("profiling.generating_questions") ?? "Preparing questions..."}
            {:else}
              {t("profiling.verify_correct")}
            {/if}
          </button>
          <div class="verify-fix">
            <input
              class="custom-input"
              type="text"
              bind:value={correctionText}
              placeholder={t("profiling.verify_fix_placeholder")}
              onkeydown={e => e.key === "Enter" && correctionText.trim() && handleVerifyFix()}
            />
            <button class="option-pill" onclick={handleVerifyFix} disabled={!correctionText.trim()}>
              {t("profiling.verify_fix")}
            </button>
          </div>
          <button class="secondary-btn" onclick={() => { goToPhase("ai-chat"); startAIInterview(); }}>
            {t("profiling.verify_skip")}
          </button>
        </div>
      {:else}
        <p class="dim-text">{t("profiling.analyzing_failed")}</p>
        <button class="primary-btn" onclick={() => { goToPhase("scan-summary"); }}>
          {t("profiling.continue")}
        </button>
      {/if}
    </div>

  <!-- ─── SCAN SUMMARY ─────────────────────────────────────────────────────── -->
  {:else if phase === "scan-summary"}
    <div class="phase-area scan-summary-area animate-fade-up">
      <h2 class="phase-title">{t("profiling.found_title")}</h2>
      <p class="phase-sub">{t("profiling.found_sub")}</p>

      {#if fullScanResult && Object.keys(fullScanResult.categories).length > 0}
        <div class="cat-list">
          {#each Object.entries(fullScanResult.categories) as [catName, items]}
            {@const excluded = excludedCats.has(catName)}
            {@const expanded = expandedCats.has(catName)}
            {@const visibleItems = expanded ? items : items.slice(0, 3)}
            <div class="cat-card {excluded ? 'excluded' : ''}">
              <div class="cat-header" role="button" tabindex="0" onclick={() => toggleExpand(catName)} onkeydown={e => e.key === "Enter" && toggleExpand(catName)}>
                <div class="cat-info">
                  <span class="cat-name">{catName}</span>
                  <span class="cat-count">{t("profiling.items_found", { count: String(items.length) })}</span>
                </div>
                <button class="cat-toggle" onclick={(e: MouseEvent) => { e.stopPropagation(); toggleExclude(catName); }}>
                  {excluded ? t("profiling.excluded") : "✓"}
                </button>
              </div>

              {#if !excluded}
                <div class="cat-items">
                  {#each visibleItems as item}
                    <span class="cat-item">{item.length > 50 ? item.slice(0, 50) + "..." : item}</span>
                  {/each}
                </div>
                {#if items.length > 3}
                  <button class="cat-expand" onclick={() => toggleExpand(catName)}>
                    {expanded ? t("profiling.hide") : `${t("profiling.show_all")} (${items.length})`}
                  </button>
                {/if}
              {/if}
            </div>
          {/each}
        </div>

        {#if fullScanResult.privacy_filtered > 0}
          <p class="privacy-note">{t("profiling.privacy_filtered", { count: String(fullScanResult.privacy_filtered) })}</p>
        {/if}
      {:else}
        <!-- Browser-only signals (no Tauri scan) -->
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
      {/if}

      {#if hasApiKey()}
        {#if getApiProvider() === "ollama"}
          <div class="ai-disclaimer local">
            <Icon name="check" size={14} />
            <span>{getLocale() === "pl"
              ? "Analiza AI przez Ollama — wszystko zostaje na Twoim komputerze."
              : "AI analysis via Ollama — everything stays on your computer."
            }</span>
          </div>
        {:else}
          <div class="ai-disclaimer cloud">
            <Icon name="info" size={14} />
            <span>{getLocale() === "pl"
              ? `Dane z niezablokowanych kategorii zostaną wysłane do ${getApiProvider().toUpperCase()} (zewnętrzny serwer) w celu analizy AI.`
              : `Data from non-excluded categories will be sent to ${getApiProvider().toUpperCase()} (external server) for AI analysis.`
            }</span>
          </div>
        {/if}
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

  <!-- ─── AI INTERVIEW (pre-generated questions — no wait) ────────────────── -->
  {:else if phase === "ai-chat"}
    {#if interviewQuestions.length > 0 && interviewIndex < interviewQuestions.length}
      {@const q = interviewQuestions[interviewIndex]}
      <div class="question-card animate-fade-up">
        <div class="q-header">
          <span class="q-pack-label">AI Interview</span>
          <span class="q-number">{interviewIndex + 1}/{interviewQuestions.length}</span>
        </div>

        <h2 class="q-text">{q.text}</h2>

        {#if q.why}
          <p class="q-hint">{q.why}</p>
        {/if}

        <div class="options-grid">
          {#each q.options as opt}
            {#if opt.includes("(") && (opt.includes("wpisz") || opt.includes("type"))}
              <!-- "Other" option — show input field -->
              <div class="custom-answer-row">
                <input
                  class="custom-input"
                  type="text"
                  placeholder={opt}
                  bind:value={customText}
                  onkeydown={e => e.key === "Enter" && customText.trim() && handleInterviewAnswer(q.id, customText.trim())}
                />
                {#if customText.trim()}
                  <button class="option-pill accent" onclick={() => { handleInterviewAnswer(q.id, customText.trim()); customText = ""; }}>
                    OK
                  </button>
                {/if}
              </div>
            {:else}
              <button class="option-pill" onclick={() => handleInterviewAnswer(q.id, opt)}>
                {opt}
              </button>
            {/if}
          {/each}
        </div>

        <div class="q-nav">
          {#if interviewIndex > 0}
            <button class="nav-btn" onclick={() => interviewIndex--}>{t("profiling.back")}</button>
          {:else}
            <span></span>
          {/if}
          <button class="nav-btn dim" onclick={() => handleInterviewAnswer(q.id, "__skip__")}>{t("profiling.skip")}</button>
        </div>
      </div>
    {:else if buildingProfile}
      <div class="phase-area animate-fade-up">
        <div class="spinner"></div>
        <p class="dim-text">{t("profiling.synthesizing")}</p>
      </div>
    {:else}
      <!-- Fallback: old AI chat -->
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
        </div>

        {#if aiOptions.length > 0 && !aiLoading && !streamingText}
          <div class="options-grid">
            {#each aiOptions as opt}
              <button class="option-pill" onclick={() => handleAIOption(opt)}>{opt}</button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

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
      <div class="phase-area animate-fade-up">
        <div class="spinner"></div>
        <p class="dim-text">{t("profiling.synthesizing")}</p>
      </div>
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

        {@const dimLabels: Record<string, string> = {
          "preferred_name": "Imię",
          "language": "Język",
          "role_type": "Rola",
          "occupation": "Zawód",
          "industry": "Branża",
          "tech_stack": "Tech Stack",
          "schedule": "Rytm pracy",
          "motivation": "Motywacja",
          "communication": "Komunikacja",
          "energy": "Energia",
          "stress": "Stres",
          "learning": "Nauka",
          "work_style": "Styl pracy",
          "goals": "Cele",
          "self_description": "Opis",
          "vision": "Wizja",
          "life_stage": "Etap życia",
        }}
        <div class="summary-dims">
          {#each Object.entries(profile.explicit).filter(([k]) => k !== "context.occupation").slice(0, 10) as [key, dim]}
            {@const shortKey = key.split(".").pop() ?? key}
            <div class="summary-row">
              <span class="summary-key">{dimLabels[shortKey] ?? shortKey.replace(/_/g, " ")}</span>
              <span class="summary-val">{Array.isArray(dim.value) ? dim.value.join(", ") : String(dim.value)}</span>
            </div>
          {/each}
        </div>

        {#if profile.synthesis?.exportRules && profile.synthesis.exportRules.length > 0}
          <div class="rules-preview">
            <p class="rules-label">{t("profiling.top_rules")}</p>
            {#each profile.synthesis.exportRules.slice(0, 3) as rule}
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
      {:else if synthesisError}
        <h2 class="phase-title">{t("profiling.analyzing_failed")}</h2>
        <p class="dim-text error-text">{synthesisError}</p>
        <button class="primary-btn" onclick={() => buildFinalProfile()}>
          {t("profiling.retry")}
        </button>
        <button class="secondary-btn" onclick={() => goTo("home")}>{t("nav.home")}</button>
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
    background: var(--color-bg, var(--color-bg));
    color: var(--color-text);
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
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    transition: color 0.15s;
  }

  .back-btn:hover {
    color: var(--color-text);
  }

  .progress-track {
    flex: 1;
    height: 3px;
    background: var(--color-border);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-accent);
    border-radius: 2px;
    transition: width 0.4s ease;
  }

  .q-counter {
    font-size: 12px;
    color: var(--color-text-muted);
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
    border: 1px solid var(--color-border-hover);
    color: var(--color-text-muted);
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .finish-btn:hover {
    border-color: var(--color-text-ghost);
    color: var(--color-text);
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
    color: var(--color-text);
  }

  .phase-sub {
    font-size: 14px;
    color: var(--color-text-muted);
    text-align: center;
    margin: 0;
  }

  /* ─── Consent grid ─────────────────────────────────────────────────────── */

  .consent-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    width: 100%;
    max-width: 460px;
  }

  .consent-card {
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 12px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--color-text-muted);
  }

  .consent-card:hover:not(.disabled) {
    border-color: var(--color-text-ghost);
    background: var(--color-bg-hover);
  }

  .consent-card.selected {
    border-color: var(--color-accent);
    background: var(--color-accent-bg);
    color: var(--color-text);
  }

  .consent-card.disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .consent-card :global(svg) {
    color: inherit;
    margin-bottom: 2px;
  }

  .consent-card.selected :global(svg) {
    color: var(--color-accent);
  }

  .consent-name {
    font-size: 13px;
    font-weight: 500;
    color: inherit;
  }

  .consent-desc {
    font-size: 11px;
    color: var(--color-text-muted);
    line-height: 1.4;
  }

  .consent-card.selected .consent-desc {
    color: var(--color-text-muted);
  }

  .consent-locked {
    font-size: 10px;
    color: var(--color-warning);
    margin-top: 2px;
  }

  .privacy-note {
    font-size: 11px;
    color: var(--color-text-ghost);
    text-align: center;
    margin: 0;
    max-width: 340px;
    line-height: 1.4;
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
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: 8px;
  }

  .scan-label {
    color: var(--color-text-muted);
  }

  .scan-value {
    color: var(--color-text);
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
  }

  /* ─── Scan verify (wow screen) ───────────────────────────────────────────── */

  .scan-verify-area {
    justify-content: flex-start;
    padding-top: 16px;
    gap: 12px;
    overflow: hidden;
  }

  .analysis-sections {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 520px;
    flex: 1;
    overflow-y: auto;
    padding: 0 2px;
    min-height: 0;
  }

  .analysis-card {
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 14px 16px;
  }

  .analysis-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .analysis-icon {
    font-size: 18px;
  }

  .analysis-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
    flex: 1;
  }

  .analysis-confidence {
    font-size: 10px;
    font-family: "JetBrains Mono", monospace;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .analysis-confidence.high {
    color: var(--color-accent);
    background: var(--color-accent-glow);
  }

  .analysis-confidence.medium {
    color: var(--color-warning);
    background: var(--color-warning-bg);
  }

  .analysis-confidence.low {
    color: var(--color-text-muted);
    background: var(--color-bg-hover);
  }

  .analysis-findings {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .analysis-finding {
    font-size: 13px;
    color: var(--color-text-secondary);
    line-height: 1.5;
    margin: 0;
    padding-left: 8px;
    border-left: 2px solid var(--color-border);
  }

  .analysis-questions {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--color-border);
  }

  .analysis-question {
    font-size: 12px;
    color: var(--color-warning);
    margin: 0;
    line-height: 1.5;
  }

  .open-questions {
    width: 100%;
    max-width: 520px;
    padding: 12px 16px;
    background: var(--color-warning-bg);
    border: 1px solid var(--color-warning-border);
    border-radius: 10px;
  }

  .oq-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-warning);
    margin: 0 0 6px;
  }

  .oq-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }

  .oq-item {
    font-size: 13px;
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .oq-input {
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text);
    font-size: 13px;
    font-family: inherit;
    padding: 6px 10px;
    outline: none;
  }

  .oq-input:focus {
    border-color: var(--color-accent-border);
  }

  .verify-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: 100%;
    max-width: 440px;
  }

  .verify-fix {
    display: flex;
    gap: 8px;
    width: 100%;
    align-items: center;
  }

  .verify-fix .custom-input {
    flex: 1;
  }

  /* ─── Scan summary ───────────────────────────────────────────────────────── */

  .scan-summary-area {
    justify-content: flex-start;
    padding-top: 32px;
  }

  .cat-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    max-width: 440px;
    max-height: 50vh;
    overflow-y: auto;
    padding: 0 2px;
  }

  .cat-card {
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 10px 12px;
    transition: all 0.15s;
  }

  .cat-card.excluded {
    opacity: 0.35;
    border-style: dashed;
  }

  .cat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
  }

  .cat-info {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .cat-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text);
  }

  .cat-count {
    font-size: 11px;
    color: var(--color-text-muted);
    font-family: "JetBrains Mono", monospace;
  }

  .cat-toggle {
    background: none;
    border: 1px solid var(--color-border-hover);
    border-radius: 6px;
    color: var(--color-accent);
    font-size: 11px;
    padding: 2px 8px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .cat-card.excluded .cat-toggle {
    color: var(--color-text-muted);
    border-color: var(--color-border);
  }

  .cat-items {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 8px;
  }

  .cat-item {
    font-size: 11px;
    color: var(--color-text-secondary);
    background: var(--color-bg-subtle);
    border-radius: 4px;
    padding: 2px 6px;
    line-height: 1.4;
    word-break: break-word;
  }

  .cat-expand {
    background: none;
    border: none;
    color: var(--color-text-ghost);
    font-size: 11px;
    cursor: pointer;
    padding: 4px 0 0;
    font-family: inherit;
    transition: color 0.15s;
  }

  .cat-expand:hover {
    color: var(--color-text-secondary);
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
    color: var(--color-text-secondary);
  }

  .found-row :global(svg) {
    color: var(--color-accent);
    flex-shrink: 0;
  }

  .found-label {
    color: var(--color-text-muted);
    font-size: 13px;
    flex-shrink: 0;
  }

  .found-value {
    color: var(--color-text);
    font-size: 13px;
  }

  .ai-hint {
    font-size: 12px;
    color: var(--color-accent);
    text-align: center;
    margin: 0;
  }

  .ai-disclaimer {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 11px;
    line-height: 1.5;
    text-align: left;
  }

  .ai-disclaimer.local {
    background: var(--color-accent-bg);
    border: 1px solid var(--color-accent-border);
    color: var(--color-accent);
  }

  .ai-disclaimer.cloud {
    background: oklch(from var(--color-warning) l c h / 0.06);
    border: 1px solid oklch(from var(--color-warning) l c h / 0.12);
    color: var(--color-text-muted);
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
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
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
    border-color: var(--color-text-ghost);
    background: var(--color-bg-hover);
  }

  .pack-card.selected {
    border-color: var(--color-accent);
    background: var(--color-accent-bg);
  }

  .pack-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text);
  }

  .pack-desc {
    font-size: 12px;
    color: var(--color-text-muted);
    line-height: 1.4;
  }

  .pack-sensitive {
    font-size: 11px;
    color: var(--color-warning);
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
    background: var(--color-bg-hover);
    border: 1px solid var(--color-border);
    align-self: flex-start;
    color: var(--color-text);
    border-radius: 4px 12px 12px 12px;
  }

  .bubble-user {
    background: var(--color-accent-glow);
    border: 1px solid var(--color-accent-border);
    align-self: flex-end;
    color: var(--color-text);
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
    background: var(--color-text-muted);
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
    color: var(--color-accent);
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
    background: var(--color-bg-hover);
    border: 1px solid var(--color-border-hover);
    color: var(--color-text);
    font-size: 13px;
    padding: 8px 14px;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }

  .option-pill:hover {
    background: var(--color-border);
    border-color: var(--color-text-ghost);
    color: var(--color-text);
  }

  .option-pill.accent {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .option-pill.accent:hover {
    background: var(--color-accent-glow);
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
    color: var(--color-text-ghost);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .q-number {
    font-size: 11px;
    font-family: "JetBrains Mono", monospace;
    color: var(--color-text-ghost);
  }

  .q-text {
    font-size: 18px;
    font-weight: 500;
    line-height: 1.4;
    margin: 0;
    color: var(--color-text);
  }

  .q-hint {
    font-size: 13px;
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.5;
  }

  .custom-input-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .custom-answer-row {
    display: flex;
    gap: 8px;
    align-items: center;
    grid-column: 1 / -1;
  }

  .custom-input {
    flex: 1;
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border-hover);
    border-radius: 10px;
    color: var(--color-text);
    font-size: 14px;
    font-family: inherit;
    padding: 8px 12px;
    outline: none;
  }

  .custom-input:focus {
    border-color: var(--color-accent-border);
  }

  .custom-toggle {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 13px;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
    text-align: left;
    transition: color 0.15s;
  }

  .custom-toggle:hover {
    color: var(--color-text-secondary);
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
    color: var(--color-text-secondary);
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
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: 8px;
  }

  .summary-key {
    color: var(--color-text-muted);
    text-transform: capitalize;
    flex-shrink: 0;
  }

  .summary-val {
    color: var(--color-text);
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
    color: var(--color-text-ghost);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0 0 4px;
  }

  .rule-row {
    display: flex;
    gap: 8px;
    font-size: 13px;
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .rule-bullet {
    color: var(--color-accent);
    flex-shrink: 0;
  }

  /* ─── Shared buttons ──────────────────────────────────────────────────────── */

  .primary-btn {
    background: var(--color-border);
    border: 1px solid var(--color-text-ghost);
    color: var(--color-text);
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
    background: var(--color-border-hover);
    border-color: var(--color-text-ghost);
  }

  .primary-btn.accent {
    background: var(--color-accent-glow);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .primary-btn.accent:hover {
    background: var(--color-accent-border);
  }

  .secondary-btn {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
    padding: 4px 0;
    transition: color 0.15s;
  }

  .secondary-btn:hover {
    color: var(--color-text-secondary);
  }

  .nav-btn {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
    padding: 6px 0;
    transition: color 0.15s;
  }

  .nav-btn:hover {
    color: var(--color-text-secondary);
  }

  .nav-btn.dim {
    color: var(--color-text-ghost);
  }

  /* ─── Spinner ─────────────────────────────────────────────────────────────── */

  .spinner {
    width: 28px;
    height: 28px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-accent);
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
    color: var(--color-text-muted);
    text-align: center;
    margin: 0;
  }

  .error-text {
    color: var(--color-error);
    font-size: 12px;
    margin-top: 8px;
  }

  .analysis-progress {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 20px;
    max-width: 320px;
    margin-inline: auto;
    text-align: left;
  }

  .analysis-step {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    padding: 4px 0;
    transition: opacity 0.3s;
  }

  .analysis-step.done {
    opacity: 0.35;
  }

  .analysis-step.active {
    opacity: 1;
    color: var(--color-text);
  }

  .step-icon {
    font-size: 14px;
    width: 20px;
    text-align: center;
  }

  .step-text {
    flex: 1;
    color: inherit;
  }

  .step-check {
    color: var(--color-success);
    font-size: 12px;
  }

  .analysis-timer {
    font-size: 12px;
    color: var(--color-text-ghost);
    text-align: center;
    margin-top: 12px;
    font-variant-numeric: tabular-nums;
  }

  .stream-preview {
    margin-top: 16px;
    max-height: 120px;
    overflow: hidden;
    mask-image: linear-gradient(transparent, black 20%, black 80%, transparent);
    -webkit-mask-image: linear-gradient(transparent, black 20%, black 80%, transparent);
  }

  .stream-text {
    font-family: inherit;
    font-size: 11px;
    color: var(--color-text-ghost);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.4;
    margin: 0;
    text-align: left;
    max-width: 400px;
    margin-inline: auto;
  }

  .animate-fade-up {
    animation: fadeUp 0.2s ease-out;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
