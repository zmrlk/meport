<script lang="ts">
  import QuestionCard from "../components/QuestionCard.svelte";
  import TierTransition from "../components/TierTransition.svelte";
  import Icon from "../components/Icon.svelte";
  import {
    getEvent, getAnswered, getIsComplete, getAnimating, getProfilingProfile,
    getTotalQuestions, getCurrentQuestionNumber,
    submitAnswer, advanceEvent, finishEarly, canGoBack, goBack,
    isAIMode, getAIMessages, getAILoading, getAIDepth, getAIPhaseLabel, getAIStreamingText, getAIOptions,
    sendAIMessage, finishAIEarly,
    getAIEnriching, getSynthesizing, getBrowserSignals, hasEnricher,
    getFollowUpQuestions, getFollowUpIndex, getInFollowUpPhase, getLoadingFollowUps,
    submitFollowUp, skipFollowUps,
    runFileScan, getFileScanResult, getIsFileScanAvailable,
    getInSummaryPhase, getIntermediateSummary, getSummaryLoading, getRefinementRound,
    confirmSummary, requestCorrections,
    getAccumulatedExportRules, getAccumulatedInferredCount, getProfilingMode,
    getDiscoveredDimensions,
    getPasteAnalyzing, getPasteDone, getPasteExtractedCount,
    submitPaste, skipPaste,
    isRapidMode, getRapidPhase, getMegaResult, getMicroQuestions, getMicroIndex, getMicroRound, getSynthesisProgress,
    submitRapidImport, skipRapidImport, submitMicroAnswer, skipMicroQuestions,
    submitMultiSourceImport, recordBehavioralSignal,
    cancelRapidSynthesis, retrySynthesis, getSynthesisError, getSynthesisElapsed, initProfiling,
    selectPacksAndContinue,
    getSelectedPacks, togglePack, type PackId,
    loadSessionState, clearSessionState,
  } from "../lib/stores/profiling.svelte.js";
  import type { ImportSource } from "@meport/core/enricher";
  import { goTo, setProfile, getProfile as getAppProfile } from "../lib/stores/app.svelte.js";
  import { getDimensionLabel } from "../lib/profile-display.js";
  import { t } from "../lib/i18n.svelte.js";

  let event = $derived(getEvent());
  let answered = $derived(getAnswered());
  let complete = $derived(getIsComplete());
  let animating = $derived(getAnimating());
  let profile = $derived(getProfilingProfile());
  let totalQ = $derived(getTotalQuestions());
  let currentQ = $derived(getCurrentQuestionNumber());

  // AI mode state
  let aiActive = $derived(isAIMode());
  let aiMessages = $derived(getAIMessages());
  let aiLoading = $derived(getAILoading());
  let aiDepth = $derived(getAIDepth());
  let aiPhase = $derived(getAIPhaseLabel());

  let streamingText = $derived(getAIStreamingText());
  let aiOptions = $derived(getAIOptions());

  let aiEnriching = $derived(getAIEnriching());
  let synthesizing = $derived(getSynthesizing());
  let signals = $derived(getBrowserSignals());
  let aiEnabled = $derived(hasEnricher());
  let followUps = $derived(getFollowUpQuestions());
  let followUpIdx = $derived(getFollowUpIndex());
  let inFollowUp = $derived(getInFollowUpPhase());
  let loadingFollowUps = $derived(getLoadingFollowUps());
  let currentFollowUp = $derived(inFollowUp && followUps.length > followUpIdx ? followUps[followUpIdx] : null);

  // Summary phase state
  let inSummary = $derived(getInSummaryPhase());
  let summaryResult = $derived(getIntermediateSummary());
  let summaryLoading = $derived(getSummaryLoading());
  let round = $derived(getRefinementRound());
  let correctionText = $state("");
  let showCorrectionInput = $state(false);

  // Synthesis overlay live data
  let exportRulesPreview = $derived(getAccumulatedExportRules());
  let aiInferredCount = $derived(getAccumulatedInferredCount());
  let mode = $derived(getProfilingMode());
  let discoveredDims = $derived(getDiscoveredDimensions(4));

  // Rapid mode state
  let rapid = $derived(isRapidMode());
  let rapidPhase = $derived(getRapidPhase());
  let megaResult = $derived(getMegaResult());
  let microQuestions = $derived(getMicroQuestions());
  let microIdx = $derived(getMicroIndex());
  let microRound = $derived(getMicroRound());
  let currentMicro = $derived(microQuestions.length > microIdx ? microQuestions[microIdx] : null);

  // Rapid import state
  let rapidText = $state("");
  let rapidPlatform = $state("chatgpt");
  let rapidConvPlatform = $state("chatgpt");
  let rapidFiles = $state<{ name: string; content: string }[]>([]);
  let rapidFileInput: HTMLInputElement;
  let rapidDragging = $state(false);
  let rapidTab = $state<"instructions" | "conversations" | "files">("instructions");
  let rapidTabSwitches = $state(0);
  let autoDetectedPlatform = $state<string | null>(null);
  let rapidFolderScanning = $state(false);
  let rapidFolderResult = $state<string | null>(null);
  let canScanFolders = $state(typeof window !== "undefined" && "showDirectoryPicker" in window);
  let rapidKeystrokeCount = $state(0);
  let rapidFirstKeystrokeAt = $state(0);
  // Per-platform paste texts
  let platformTexts = $state<Record<string, string>>({ chatgpt: "", claude: "", cursor: "", gemini: "" });
  let activePlatform = $state<string | null>(null);
  let rapidConvText = $derived(Object.values(platformTexts).filter(v => v.trim()).join("\n\n---\n\n"));
  let rapidSourceCount = $derived(
    (rapidText.trim() ? 1 : 0) + Object.values(platformTexts).filter(v => v.trim()).length + rapidFiles.length + (rapidFolderResult ? 1 : 0)
  );

  // Existing profile dimensions — show what we already know
  let locale = $derived(t("nav.home") === "Start" ? "pl" as const : "en" as const);
  let existingProfile = $derived(getAppProfile());
  let userName = $derived.by(() => {
    const p = existingProfile;
    if (!p) return "";
    const name = p.explicit["identity.preferred_name"];
    return name ? String(name.value) : "";
  });
  let existingDims = $derived.by(() => {
    const p = existingProfile;
    if (!p) return [];
    const chips: { label: string; value: string }[] = [];
    for (const [key, dim] of Object.entries(p.explicit)) {
      if (key === "identity.preferred_name") continue; // shown separately in header
      const label = getDimensionLabel(key, locale);
      const val = Array.isArray(dim.value) ? dim.value.join(", ") : String(dim.value);
      if (val) chips.push({ label, value: val });
    }
    for (const [key, inf] of Object.entries(p.inferred)) {
      const label = getDimensionLabel(key, locale);
      if (inf.value) chips.push({ label, value: String(inf.value) });
    }
    return chips.slice(0, 8);
  });

  // Rotating progress messages during waits
  const progressMessages = [
    { pl: "Analizuję wzorce komunikacji...", en: "Analyzing communication patterns..." },
    { pl: "Łączę wymiary krzyżowo...", en: "Cross-referencing dimensions..." },
    { pl: "Wykrywam styl poznawczy...", en: "Detecting cognitive style..." },
    { pl: "Buduję reguły eksportu...", en: "Building export rules..." },
    { pl: "Szukam sprzeczności...", en: "Looking for contradictions..." },
    { pl: "Generuję predykcje behawioralne...", en: "Generating behavioral predictions..." },
  ];
  let progressMsgIdx = $state(0);
  let progressInterval: ReturnType<typeof setInterval> | null = null;

  // Rotate messages when synthesizing or loading follow-ups
  $effect(() => {
    if (synthesizing || loadingFollowUps) {
      progressMsgIdx = 0;
      progressInterval = setInterval(() => {
        progressMsgIdx = (progressMsgIdx + 1) % progressMessages.length;
      }, 2500);
      return () => { if (progressInterval) clearInterval(progressInterval); };
    } else {
      if (progressInterval) clearInterval(progressInterval);
    }
  });

  let currentProgressMsg = $derived(
    progressMessages[progressMsgIdx]?.[t("nav.home") === "Start" ? "pl" : "en"] ?? ""
  );

  // Session resume
  let resumeSession = $state<{ answeredCount: number; mode: string } | null>(null);

  $effect(() => {
    const saved = loadSessionState();
    if (saved && saved.answeredCount > 0) {
      resumeSession = { answeredCount: saved.answeredCount, mode: saved.mode };
    }
  });

  function dismissResume() {
    resumeSession = null;
    clearSessionState();
  }

  // Scanning intro phase
  let scanning = $state(true);
  let scanItems = $state<{ label: string; value: string }[]>([]);
  let scanDone = $state(false);
  let scanPhase = $state<"signals" | "offer" | "scanning" | "results" | "done" | "paste">("signals");

  // Pack selection phase — shown after scanning, before questions
  let packSelecting = $state(false);
  let localSelectedPacks = $derived(getSelectedPacks());

  const availablePacks: { id: PackId; icon: string; name: string; desc: string; sensitive: boolean }[] = [
    { id: "story",     icon: "📖", name: "Story",     desc: "Background, motivations, identity",    sensitive: false },
    { id: "context",   icon: "📍", name: "Context",   desc: "Occupation, location, life stage",     sensitive: false },
    { id: "work",      icon: "💼", name: "Work",       desc: "Habits, energy, deadlines",            sensitive: false },
    { id: "lifestyle", icon: "🏠", name: "Lifestyle", desc: "Routines, hobbies, social",            sensitive: false },
    { id: "health",    icon: "🧠", name: "Health",    desc: "Neurodivergent traits, wellness",      sensitive: true  },
    { id: "finance",   icon: "💰", name: "Finance",   desc: "Budget, spending style",               sensitive: true  },
    { id: "learning",  icon: "📚", name: "Learning",  desc: "How you learn, what you study",        sensitive: false },
  ];

  async function startWithPacks() {
    packSelecting = false;
    // If triggered by a pack_selection event from the pack engine, continue the generator
    if (event?.type === "pack_selection") {
      await selectPacksAndContinue(localSelectedPacks as PackId[]);
    }
  }

  let fileScan = $derived(getFileScanResult());
  let fileScanAvailable = $derived(getIsFileScanAvailable());

  // Paste state
  let pasteAnalyzing = $derived(getPasteAnalyzing());
  let pasteDone = $derived(getPasteDone());
  let pasteExtractedCount = $derived(getPasteExtractedCount());
  let pasteText = $state("");
  let pastePlatform = $state("chatgpt");
  let pasteError = $state("");
  let pasteFileInput: HTMLInputElement;

  let chatInput = $state("");
  let showTextInput = $state(false);
  let chatContainer: HTMLDivElement;
  let lastUserText = $state("");

  // Run scanning animation on mount
  $effect(() => {
    // Build scan items from browser signals — show for ALL users as a warm intro
    const items: { label: string; value: string }[] = [];
    if (signals["identity.locale"]) items.push({ label: t("scan.language"), value: signals["identity.locale"].toUpperCase() });
    if (signals["identity.timezone"]) items.push({ label: t("scan.timezone"), value: signals["identity.timezone"] });
    if (signals["context.platform"]) items.push({ label: t("scan.platform"), value: signals["context.platform"] });
    if (signals["context.device"]) items.push({ label: t("scan.device"), value: signals["context.device"] });

    if (items.length === 0) {
      // Essential mode + AI: show paste directly
      if (mode === "essential" && aiEnabled) {
        scanPhase = "paste";
      } else {
        scanning = false;
      }
      return;
    }

    scanItems = items;
    scanPhase = "signals";

    // Brief intro then transition
    const signalsDuration = 1200 + items.length * 150;
    const timer = setTimeout(() => {
      // Essential mode + AI: transition to paste instead of dismissing
      if (mode === "essential" && aiEnabled) {
        scanPhase = "paste";
      } else {
        dismissScanning();
      }
    }, signalsDuration);

    return () => clearTimeout(timer);
  });

  function dismissScanning() {
    scanDone = true;
    setTimeout(() => {
      scanning = false;
      packSelecting = true;
    }, 400);
  }

  async function handleScanFiles() {
    scanPhase = "scanning";
    const ok = await runFileScan();
    scanPhase = ok ? "results" : "done"; // silent skip on error
    if (ok) setTimeout(() => dismissScanning(), 1500);
    else dismissScanning();
  }

  function handleSkipScan() {
    dismissScanning();
  }

  async function handlePasteSubmit() {
    if (!pasteText.trim()) return;
    pasteError = "";
    const ok = await submitPaste(pasteText.trim(), pastePlatform);
    if (ok) {
      // Show success briefly, then proceed to questions
      setTimeout(() => dismissScanning(), 1200);
    } else {
      // AI failed or extracted nothing — show error, let user retry or skip
      pasteError = t("paste.error");
    }
  }

  function handlePasteSkip() {
    skipPaste();
    dismissScanning();
  }

  function handlePasteFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pasteText = reader.result as string;
    };
    reader.readAsText(file);
  }

  // Navigate to reveal when profiling completes and synthesis is done
  $effect(() => {
    if (complete && profile && !synthesizing) {
      setProfile(profile);
      goTo("reveal");
    }
  });

  // Pack engine: when pack_selection event fires, show the pack picker UI
  $effect(() => {
    if (event?.type === "pack_selection" && !packSelecting) {
      packSelecting = true;
    }
  });

  // Pack engine: pack_complete is a transient event — auto-advance to next pack/profiling_complete
  $effect(() => {
    if (event?.type === "pack_complete") {
      advanceEvent();
    }
  });

  // Auto-scroll chat on new messages and streaming
  $effect(() => {
    if ((aiMessages.length || streamingText) && chatContainer) {
      setTimeout(() => chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: "smooth" }), 50);
    }
  });

  function handleAnswer(value: string | string[]) {
    // Pack engine: "question" and "confirm" | Legacy engine: "question" and "follow_up"
    if (event?.type === "question" || event?.type === "follow_up" || event?.type === "confirm") {
      submitAnswer((event as any).question.id, value);
    }
  }

  function handleSkip() {
    if (event?.type === "question" || event?.type === "follow_up" || event?.type === "confirm") {
      submitAnswer((event as any).question.id, "", true);
    }
  }

  function handleBack() {
    goBack();
  }

  function handleTierContinue() {
    // Pack engine: "pack_start" / "pack_complete" | Legacy: "tier_start" / "tier_complete"
    if (
      event?.type === "tier_start" || event?.type === "tier_complete" ||
      event?.type === "pack_start" || event?.type === "pack_complete"
    ) {
      advanceEvent();
    }
  }

  async function handleFinishEarly() {
    if (aiActive) {
      const p = finishAIEarly();
      if (p) { setProfile(p); goTo("reveal"); }
    } else {
      // finishEarly now runs synthesis — profile + reveal handled via $effect
      await finishEarly();
    }
  }

  async function handleOptionClick(option: string) {
    if (aiLoading) return;
    showTextInput = false;
    chatInput = "";
    lastUserText = option;
    await sendAIMessage(option);
  }

  async function handleChatSend() {
    const text = chatInput.trim();
    if (!text || aiLoading) return;
    chatInput = "";
    showTextInput = false;
    lastUserText = text;
    await sendAIMessage(text);
  }

  async function handleRetry() {
    if (!lastUserText || aiLoading) return;
    await sendAIMessage(lastUserText);
  }

  function handleChatKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  }

  // Real progress percentage — accounts for iterative phases
  let progressPercent = $derived(
    aiActive
      ? Math.min(aiDepth, 99)
      : inSummary
        ? Math.min(85 + round * 5, 97)
        : inFollowUp
          ? Math.min(80 + followUpIdx * 3, 90)
          : totalQ > 0 ? Math.min(Math.round((currentQ / totalQ) * 80), 80) : 0
  );

  // Detect error in last AI message
  let aiLastMessageIsError = $derived.by(() => {
    const last = aiMessages.length > 0 ? aiMessages[aiMessages.length - 1] : null;
    if (!last || last.role !== "assistant") return false;
    const c = last.content.toLowerCase();
    return c.includes("nie udało się") || c.includes("error") || c.includes("rate limited");
  });

  // Rapid mode handlers
  async function handleRapidSubmit() {
    const sources: ImportSource[] = [];

    // Collect "about yourself" text
    if (rapidText.trim()) {
      sources.push({
        type: "instructions",
        platform: rapidPlatform,
        content: rapidText.trim(),
      });
    }

    // Collect per-platform paste data
    for (const [platform, text] of Object.entries(platformTexts)) {
      if (text.trim()) {
        sources.push({
          type: "instructions",
          platform,
          content: text.trim(),
        });
      }
    }

    // Collect from files
    for (const f of rapidFiles) {
      sources.push({
        type: "file",
        content: f.content,
        filename: f.name,
      });
    }

    if (sources.length === 0) return;

    // Record behavioral signals
    recordBehavioralSignal("keystrokeCount", rapidKeystrokeCount);
    recordBehavioralSignal("tabSwitchCount", rapidTabSwitches);
    if (rapidFirstKeystrokeAt > 0) {
      recordBehavioralSignal("timeToFirstKeystrokeMs", rapidFirstKeystrokeAt);
    }

    await submitMultiSourceImport(sources);
  }

  function handleRapidKeystroke() {
    rapidKeystrokeCount++;
    if (rapidFirstKeystrokeAt === 0) {
      rapidFirstKeystrokeAt = Date.now();
      recordBehavioralSignal("timeToFirstKeystrokeMs", rapidFirstKeystrokeAt - performance.timeOrigin);
    }
  }

  function detectPasteSource(text: string): string | null {
    const sample = text.slice(0, 200).toLowerCase();
    if (sample.includes("you are chatgpt") || sample.includes("openai")) return "chatgpt";
    if (sample.includes("human:") || sample.includes("claude") || sample.includes("anthropic")) return "claude";
    if (sample.includes("cursor") || sample.includes(".cursorrules")) return "cursor";
    if (sample.includes("gemini") || sample.includes("google ai")) return "gemini";
    return null;
  }

  function handleRapidPaste() {
    handleRapidKeystroke();
    const detected = detectPasteSource(rapidText);
    if (detected) {
      autoDetectedPlatform = detected;
      rapidPlatform = detected;
    }
  }

  function handleTabSwitch(tab: "instructions" | "conversations" | "files") {
    if (rapidTab !== tab) {
      rapidTab = tab;
      rapidTabSwitches++;
    }
  }

  async function handleRapidSkip() {
    await skipRapidImport();
  }

  function handleRapidFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = () => {
        let content = reader.result as string;
        if (file.name.toLowerCase().endsWith(".html") && content.includes("NETSCAPE-Bookmark")) {
          content = parseBookmarksHtml(content);
        }
        rapidFiles = [...rapidFiles, { name: file.name, content }];
      };
      reader.readAsText(file);
    }
  }

  function removeRapidFile(idx: number) {
    rapidFiles = rapidFiles.filter((_, i) => i !== idx);
  }

  function parseBookmarksHtml(html: string): string {
    // Extract bookmark titles and URLs from exported bookmarks.html
    const links: string[] = [];
    const regex = /<A[^>]*HREF="([^"]*)"[^>]*>([^<]*)<\/A>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const url = match[1];
      const title = match[2].trim();
      if (title && url) links.push(`${title} — ${url}`);
    }
    return links.length > 0
      ? `Browser bookmarks (${links.length}):\n${links.join("\n")}`
      : html; // fallback: treat as raw text
  }

  function handleRapidDrop(e: DragEvent) {
    e.preventDefault();
    rapidDragging = false;
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.name.match(/\.(txt|md|pdf|docx|json|cursorrules|html)$/i)) continue;
      const reader = new FileReader();
      reader.onload = () => {
        let content = reader.result as string;
        if (file.name.toLowerCase().endsWith(".html") && content.includes("NETSCAPE-Bookmark")) {
          content = parseBookmarksHtml(content);
        }
        rapidFiles = [...rapidFiles, { name: file.name, content }];
      };
      reader.readAsText(file);
    }
  }

  async function handleRapidFolderScan() {
    rapidFolderScanning = true;
    try {
      const ok = await runFileScan();
      if (ok) {
        const result = getFileScanResult();
        if (result) {
          rapidFolderResult = `Folder scan: ${result.totalScanned} items, ${result.folders.length} folders, ${Object.keys(result.fileTypes).length} file types`;
        }
      }
    } catch {
      // User cancelled picker or API not available
    }
    rapidFolderScanning = false;
  }

  // Rotating synthesis messages
  const synthMessages = [
    { pl: "Rozpoznaję styl komunikacji...", en: "Recognizing communication style..." },
    { pl: "Buduję profil kognitywny...", en: "Building cognitive profile..." },
    { pl: "Generuję reguły eksportu...", en: "Generating export rules..." },
    { pl: "Szukam wzorców osobowości...", en: "Finding personality patterns..." },
    { pl: "Analizuję sprzeczności...", en: "Analyzing contradictions..." },
  ];
  let synthMsgIdx = $state(0);
  let synthInterval: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    if (rapid && rapidPhase === "synthesizing") {
      synthMsgIdx = 0;
      synthInterval = setInterval(() => {
        synthMsgIdx = (synthMsgIdx + 1) % synthMessages.length;
      }, 2500);
      return () => { if (synthInterval) clearInterval(synthInterval); };
    } else {
      if (synthInterval) clearInterval(synthInterval);
    }
  });

  let currentSynthMsg = $derived(
    synthMessages[synthMsgIdx]?.[t("nav.home") === "Start" ? "pl" : "en"] ?? ""
  );

  let synthError = $derived(getSynthesisError());
  let synthElapsed = $derived(getSynthesisElapsed());

  // Recovery: if user lands here with no active session (e.g. page refresh), redirect home
  $effect(() => {
    const isPackSelection = event?.type === "pack_selection";
    if (!event && !aiActive && !complete && !inFollowUp && !inSummary && !synthesizing && !rapid && !scanning && !packSelecting && !isPackSelection) {
      goTo("home");
    }
  });
</script>

<div class="screen">
  <!-- Top bar -->
  <div class="topbar">
    <button class="back-btn" onclick={() => goTo("home")} aria-label={t("profiling.back")}>
      <Icon name="arrow-left" size={16} />
    </button>

    <!-- Progress bar -->
    <div class="progress-track">
      <div class="progress-fill" style="width: {progressPercent}%"></div>
    </div>

    <!-- Phase / counter — only shown when actively questioning -->
    {#if aiActive}
      <span class="q-counter">{aiPhase}</span>
    {:else if (event?.type === "question" || event?.type === "follow_up" || event?.type === "confirm") && totalQ > 0}
      <span class="q-counter">{t("profiling.progress", { current: String(currentQ), total: String(totalQ) })}</span>
    {:else}
      <span class="q-counter-placeholder"></span>
    {/if}

    <!-- Finish early -->
    <div class="live-counter">
      {#if aiActive && aiDepth > 30}
        <button class="finish-btn" onclick={handleFinishEarly}>
          {t("profiling.ai_finish_early")}
        </button>
      {:else if !aiActive && (answered > 5 || (mode === "essential" && answered >= 2))}
        <button class="finish-btn" onclick={handleFinishEarly}>
          {t("profiling.finish_early")}
        </button>
      {/if}
    </div>
  </div>

  {#if resumeSession}
    <div class="resume-banner animate-fade-up">
      <span class="resume-text">
        Previous session: {resumeSession.answeredCount} questions answered ({resumeSession.mode} mode).
        Continue from question 1 — your answers are not saved, but the session will pick up the same mode.
      </span>
      <div class="resume-actions">
        <button class="resume-btn-primary" onclick={dismissResume}>Start fresh</button>
      </div>
    </div>
  {/if}

  {#if rapid}
    <!-- Rapid Mode: data-first pipeline -->
    <div class="rapid-area">
      {#if rapidPhase === "import"}
        <div class="rapid-import animate-fade-up">
          <!-- Existing profile — what we already know -->
          {#if userName || existingDims.length > 0}
            <div class="rapid-existing">
              <p class="rapid-existing-title">
                <Icon name="check" size={12} />
                {userName ? `${userName}, ` : ""}{t("rapid.already_know")}
              </p>
              {#if existingDims.length > 0}
                <div class="rapid-existing-chips">
                  {#each existingDims as dim}
                    <span class="rapid-existing-chip">
                      <span class="rapid-chip-label">{dim.label}</span>
                      <span class="rapid-chip-value">{dim.value}</span>
                    </span>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <!-- Primary: Tell us about yourself -->
          <div class="rapid-section">
            <h2 class="rapid-section-title">{t("rapid.about_title")}</h2>
            <p class="rapid-section-sub">{t("rapid.about_subtitle")}</p>
            <textarea
              class="paste-textarea rapid-textarea"
              bind:value={rapidText}
              placeholder={t("rapid.about_placeholder")}
              rows="4"
              oninput={handleRapidPaste}
            ></textarea>
            {#if autoDetectedPlatform}
              <span class="rapid-auto-detected">
                <Icon name="sparkle" size={10} />
                {t("rapid.auto_detected", { platform: autoDetectedPlatform })}
              </span>
            {/if}
          </div>

          <!-- Secondary: Files & folder scan -->
          <div class="rapid-section">
            <div class="rapid-two-buttons"
              ondrop={handleRapidDrop}
              ondragover={(e: DragEvent) => { e.preventDefault(); rapidDragging = true; }}
              ondragleave={() => { rapidDragging = false; }}
            >
              {#if canScanFolders}
                <button
                  class="rapid-action-card"
                  onclick={handleRapidFolderScan}
                  disabled={rapidFolderScanning}
                >
                  <Icon name="folder" size={20} />
                  <span class="rapid-action-card-title">{rapidFolderScanning ? t("rapid.scanning_folder") : t("rapid.scan_folder")}</span>
                  <span class="rapid-action-card-sub">{t("rapid.scan_folder_sub")}</span>
                </button>
              {/if}

              <button
                class="rapid-action-card"
                class:dragging={rapidDragging}
                onclick={() => rapidFileInput?.click()}
              >
                <Icon name="upload" size={20} />
                <span class="rapid-action-card-title">{t("rapid.add_files_bookmarks")}</span>
                <span class="rapid-action-card-sub">{t("rapid.add_files_bookmarks_sub")}</span>
              </button>
              <input
                bind:this={rapidFileInput}
                type="file"
                accept=".txt,.md,.pdf,.docx,.json,.cursorrules,.html"
                multiple
                onchange={handleRapidFile}
                style="display:none"
              />
            </div>

            {#if rapidFiles.length > 0}
              <div class="rapid-files">
                {#each rapidFiles as file, i}
                  <div class="rapid-file">
                    <Icon name="file-text" size={12} />
                    <span class="rapid-file-name">{file.name}</span>
                    <button class="rapid-file-remove" onclick={() => removeRapidFile(i)}>×</button>
                  </div>
                {/each}
              </div>
            {/if}

            {#if rapidFolderResult}
              <div class="rapid-file rapid-file-success">
                <Icon name="check" size={12} />
                <span class="rapid-file-name">{rapidFolderResult}</span>
              </div>
            {/if}
          </div>

          <!-- Tertiary: AI data — collapsible, optional -->
          <div class="rapid-section rapid-section-optional">
            <button class="rapid-optional-toggle" onclick={() => { activePlatform = activePlatform ? null : "chatgpt"; }}>
              <span class="rapid-optional-label">{t("rapid.ai_data_toggle")}</span>
              <Icon name={activePlatform ? "chevron-up" : "chevron-down"} size={14} />
            </button>

            {#if activePlatform}
              <div class="rapid-platforms-grid animate-fade-up">
                <div class="rapid-platform-pills">
                  {#each [
                    { id: "chatgpt", label: "ChatGPT" },
                    { id: "claude", label: "Claude" },
                    { id: "cursor", label: "Cursor" },
                    { id: "gemini", label: "Gemini" },
                  ] as p}
                    <button
                      class="paste-platform-pill"
                      class:active={activePlatform === p.id}
                      class:has-data={platformTexts[p.id]?.trim()}
                      onclick={() => { activePlatform = p.id; }}
                    >
                      {p.label}
                      {#if platformTexts[p.id]?.trim()}
                        <Icon name="check" size={10} />
                      {/if}
                    </button>
                  {/each}
                </div>

                {#each [
                  { id: "chatgpt", hint: "rapid.hint_chatgpt", placeholder: "rapid.ph_chatgpt" },
                  { id: "claude", hint: "rapid.hint_claude", placeholder: "rapid.ph_claude" },
                  { id: "cursor", hint: "rapid.hint_cursor", placeholder: "rapid.ph_cursor" },
                  { id: "gemini", hint: "rapid.hint_gemini", placeholder: "rapid.ph_gemini" },
                ] as p}
                  {#if activePlatform === p.id}
                    <div class="rapid-platform-body animate-fade-up">
                      <p class="rapid-platform-hint">{t(p.hint)}</p>
                      <textarea
                        class="paste-textarea rapid-textarea-sm"
                        bind:value={platformTexts[p.id]}
                        placeholder={t(p.placeholder)}
                        rows="3"
                        oninput={handleRapidKeystroke}
                      ></textarea>
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
          </div>

          <!-- Actions -->
          <div class="rapid-actions-area">
            {#if rapidSourceCount > 1}
              <p class="rapid-source-count">
                {t("rapid.source_count", { count: String(rapidSourceCount) })}
              </p>
            {/if}
            <button
              class="rapid-analyze-btn"
              onclick={handleRapidSubmit}
              disabled={rapidSourceCount === 0}
            >
              <Icon name="sparkle" size={14} />
              {t("rapid.analyze_btn")}
            </button>
            <button class="rapid-skip-btn-visible" onclick={handleRapidSkip}>
              {t("rapid.skip_visible")}
            </button>
          </div>
        </div>

      {:else if rapidPhase === "synthesizing"}
        <div class="rapid-synth animate-fade-up">
          <div class="scan-ring"></div>
          <p class="rapid-synth-title">{t("rapid.synthesizing")}</p>
          <p class="rapid-synth-sub progress-rotate">{currentSynthMsg}</p>
          {#if synthElapsed > 0}
            <span class="rapid-synth-elapsed">{synthElapsed}s...</span>
          {/if}
          <button class="rapid-synth-cancel" onclick={() => cancelRapidSynthesis()}>
            {t("rapid.cancel")}
          </button>
        </div>

      {:else if rapidPhase === "error"}
        <div class="rapid-error animate-fade-up">
          <div class="rapid-error-icon"><Icon name="x" size={24} /></div>
          <p class="rapid-error-title">{t("rapid.error_title")}</p>
          <p class="rapid-error-msg">{synthError}</p>
          <div class="rapid-error-actions">
            <button class="rapid-analyze-btn" onclick={() => retrySynthesis()}>
              <Icon name="sparkle" size={14} />
              {t("rapid.retry")}
            </button>
            <button class="rapid-skip-btn" onclick={() => initProfiling("essential")}>
              {t("rapid.fallback")}
            </button>
          </div>
        </div>

      {:else if rapidPhase === "micro" && currentMicro}
        <div class="rapid-micro animate-fade-up">
          <div class="followup-header">
            <span class="followup-badge"><Icon name="sparkle" size={12} /> AI{microRound > 1 ? ` · Round ${microRound}` : ""}</span>
            <span class="followup-progress">{microIdx + 1} / {microQuestions.length}</span>
          </div>
          <p class="followup-question">{currentMicro.question}</p>
          {#if currentMicro.why}
            <p class="rapid-micro-why">{t("rapid.micro_why")} {currentMicro.why}</p>
          {/if}
          <div class="followup-options">
            {#if currentMicro.type === "comparison" && currentMicro.compareA && currentMicro.compareB}
              <!-- Show Don't Tell: two AI responses to compare -->
              <div class="comparison-container">
                <button
                  class="comparison-option"
                  onclick={() => submitMicroAnswer(currentMicro!.id, "A")}
                >
                  <span class="comparison-label">A</span>
                  <span class="comparison-text">{currentMicro.compareA}</span>
                </button>
                <button
                  class="comparison-option"
                  onclick={() => submitMicroAnswer(currentMicro!.id, "B")}
                >
                  <span class="comparison-label">B</span>
                  <span class="comparison-text">{currentMicro.compareB}</span>
                </button>
                <button
                  class="option-pill ai-option comparison-depends"
                  onclick={() => submitMicroAnswer(currentMicro!.id, "Depends on context")}
                >
                  {t("rapid.depends") || "Depends on context"}
                </button>
              </div>
            {:else if currentMicro.options && currentMicro.options.length > 0}
              {#each currentMicro.options as option}
                <button
                  class="option-pill ai-option"
                  onclick={() => submitMicroAnswer(currentMicro!.id, option)}
                >
                  {option}
                </button>
              {/each}
            {:else}
              <div class="rapid-micro-text">
                <textarea
                  class="paste-textarea"
                  rows="3"
                  placeholder="..."
                  onkeydown={(e: KeyboardEvent) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      const val = (e.target as HTMLTextAreaElement).value.trim();
                      if (val) submitMicroAnswer(currentMicro!.id, val);
                    }
                  }}
                ></textarea>
              </div>
            {/if}
          </div>
          <button class="skip-followups" onclick={() => skipMicroQuestions()}>
            {t("rapid.micro_skip")} <Icon name="arrow-right" size={12} />
          </button>
        </div>
      {/if}
    </div>
  {:else if scanning}
    <!-- Scanning intro -->
    <div class="scan-area">
      <div class="scan-content" class:scan-fade-out={scanDone}>
        {#if scanPhase === "signals"}
          <div class="scan-icon">
            <div class="scan-ring"></div>
          </div>
          <p class="scan-title">{t("scan.title")}</p>
          {#each scanItems as item, i}
            <div class="scan-item animate-fade-up" style="--delay: {300 + i * 200}ms">
              <span class="scan-label">{item.label}</span>
              <span class="scan-value">{item.value}</span>
            </div>
          {/each}
        {:else if scanPhase === "offer"}
          <div class="scan-offer animate-fade-up">
            <p class="scan-offer-title">{t("scan.offer_title")}</p>
            <p class="scan-offer-desc">{t("scan.offer_desc")}</p>
            <div class="scan-offer-buttons">
              <button class="scan-btn-primary" onclick={handleScanFiles}>
                <Icon name="folder" size={16} /> {t("scan.scan_files")}
              </button>
              <button class="scan-btn-skip" onclick={handleSkipScan}>
                {t("scan.skip")}
              </button>
            </div>
          </div>
        {:else if scanPhase === "scanning"}
          <div class="scan-icon">
            <div class="scan-ring"></div>
          </div>
          <p class="scan-title">{t("scan.scanning")}</p>
        {:else if scanPhase === "results" && fileScan}
          <div class="scan-results animate-fade-up">
            <p class="scan-results-check"><Icon name="check" size={24} /></p>
            <p class="scan-title">{t("scan.found")} {fileScan.totalScanned} items</p>
            <p class="scan-results-detail">{fileScan.files.length} {t("scan.files_label")} · {fileScan.folders.length} {t("scan.folders_label")}</p>
          </div>
        {:else if scanPhase === "paste"}
          <div class="paste-area animate-fade-up">
            {#if pasteAnalyzing}
              <div class="paste-loading">
                <div class="scan-ring"></div>
                <p class="paste-loading-text">{t("paste.analyzing")}</p>
              </div>
            {:else if pasteDone}
              <div class="paste-done animate-fade-up">
                <p class="paste-done-check"><Icon name="check" size={24} /></p>
                <p class="paste-done-text">{t("paste.done").replace("{count}", String(pasteExtractedCount))}</p>
              </div>
            {:else}
              <p class="paste-title">{t("paste.title")}</p>
              <p class="paste-subtitle">{t("paste.subtitle")}</p>

              <!-- Platform selector cards -->
              <div class="paste-platform-cards">
                {#each [
                  { value: "chatgpt", label: "ChatGPT", hint: t("rapid.hint_chatgpt"), ph: t("rapid.ph_chatgpt") },
                  { value: "claude", label: "Claude", hint: t("rapid.hint_claude"), ph: t("rapid.ph_claude") },
                  { value: "cursor", label: "Cursor", hint: t("rapid.hint_cursor"), ph: t("rapid.ph_cursor") },
                  { value: "other", label: "Inne", hint: "", ph: t("paste.placeholder") },
                ] as p}
                  <button
                    class="paste-platform-card"
                    class:active={pastePlatform === p.value}
                    onclick={() => { pastePlatform = pastePlatform === p.value ? "" : p.value; }}
                  >
                    <Icon name="message-circle" size={14} />
                    <span>{p.label}</span>
                    {#if pastePlatform === p.value}
                      <Icon name="chevron-up" size={12} />
                    {:else}
                      <Icon name="chevron-down" size={12} />
                    {/if}
                  </button>
                  {#if pastePlatform === p.value}
                    <div class="paste-platform-expand animate-fade-up">
                      {#if p.hint}
                        <p class="paste-platform-hint">{p.hint}</p>
                      {/if}
                      <textarea
                        class="paste-textarea"
                        bind:value={pasteText}
                        placeholder={p.ph}
                        rows="4"
                      ></textarea>
                    </div>
                  {/if}
                {/each}
              </div>

              <div class="paste-actions">
                <button
                  class="paste-analyze-btn"
                  onclick={handlePasteSubmit}
                  disabled={!pasteText.trim()}
                >
                  <Icon name="sparkle" size={14} />
                  {t("paste.analyze")}
                </button>
                <button class="paste-file-btn" onclick={() => pasteFileInput?.click()}>
                  <Icon name="upload" size={12} />
                  {t("paste.or_file")}
                </button>
                <input
                  bind:this={pasteFileInput}
                  type="file"
                  accept=".txt,.md,.json,.cursorrules,.html"
                  onchange={handlePasteFile}
                  style="display:none"
                />
              </div>
              {#if pasteError}
                <p class="paste-error">{pasteError}</p>
              {/if}

              <button class="paste-skip-btn" onclick={handlePasteSkip}>
                {t("paste.skip")} <Icon name="arrow-right" size={12} />
              </button>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {:else if packSelecting}
    <!-- Pack selection phase -->
    <div class="pack-selector-area">
      <div class="pack-selector animate-fade-up">
        <h2 class="pack-title">What should your profile cover?</h2>
        <p class="pack-subtitle">Core communication and AI preferences are always included.</p>

        <div class="pack-grid">
          {#each availablePacks as pack}
            <button
              class="pack-card"
              class:selected={localSelectedPacks.includes(pack.id)}
              onclick={() => togglePack(pack.id)}
            >
              <span class="pack-icon">{pack.icon}</span>
              <strong class="pack-name">{pack.name}</strong>
              <span class="pack-desc">{pack.desc}</span>
              {#if pack.sensitive}
                <span class="pack-badge">Sensitive · Optional</span>
              {/if}
            </button>
          {/each}
        </div>

        <button class="pack-start-btn" onclick={startWithPacks}>
          Start profiling ({localSelectedPacks.length + 2} packs)
        </button>
      </div>
    </div>
  {:else if inFollowUp}
    <!-- AI Follow-up questions phase -->
    <div class="followup-area">
      {#if loadingFollowUps}
        <div class="followup-loading">
          <div class="scan-ring"></div>
          <p class="followup-loading-text progress-rotate">{currentProgressMsg}</p>
          {#if discoveredDims.length > 0}
            <div class="discovered-dims">
              {#each discoveredDims as dim, i}
                <span class="discovered-dim animate-fade-up" style="--delay: {200 + i * 300}ms"><Icon name="check" size={10} /> {dim}</span>
              {/each}
            </div>
          {/if}
        </div>
      {:else if currentFollowUp}
        <div class="followup-card ai-styled animate-fade-up">
          <div class="followup-header">
            <span class="followup-badge"><Icon name="sparkle" size={12} /> {t("profiling.ai_question")}</span>
            <span class="followup-progress">{followUpIdx + 1} / {followUps.length}</span>
          </div>
          <p class="followup-question">{currentFollowUp.question}</p>
          {#if currentFollowUp.why}
            <p class="followup-why">{currentFollowUp.why}</p>
          {/if}
          <div class="followup-options">
            {#each currentFollowUp.options as option}
              <button
                class="option-pill ai-option"
                onclick={() => submitFollowUp(currentFollowUp!.id, option)}
              >
                {option}
              </button>
            {/each}
          </div>
          <button class="skip-followups" onclick={skipFollowUps}>
            {t("profiling.skip_to_profile")} <Icon name="arrow-right" size={12} />
          </button>
        </div>
      {/if}
    </div>
  {:else if inSummary}
    <!-- Intermediate summary phase -->
    <div class="summary-area">
      {#if summaryLoading}
        <div class="followup-loading">
          <div class="scan-ring"></div>
          <p class="followup-loading-text">{t("profiling.ai_analyzing")}</p>
        </div>
      {:else if summaryResult}
        <div class="summary-card animate-fade-up">
          <span class="followup-badge"><Icon name="sparkle" size={12} /> {t("summary.round")} {round}</span>

          {#if summaryResult.archetype}
            <p class="summary-archetype">{summaryResult.archetype}</p>
          {/if}

          <p class="summary-narrative">{summaryResult.narrative}</p>

          {#if summaryResult.emergent.length > 0}
            <div class="summary-patterns">
              {#each summaryResult.emergent as pattern}
                <div class="summary-pattern-item">
                  <span class="summary-pattern-title">{pattern.title}</span>
                  <span class="summary-pattern-obs">{pattern.observation}</span>
                </div>
              {/each}
            </div>
          {/if}

          {#if summaryResult.exportRules && summaryResult.exportRules.length > 0}
            <div class="summary-rules">
              <span class="summary-rules-heading">{t("reveal.export_rules")}</span>
              {#each summaryResult.exportRules.slice(0, 5) as rule, i}
                <div class="summary-rule-item">
                  <span class="summary-rule-arrow"><Icon name="arrow-right" size={10} /></span>
                  <span class="summary-rule-text">{rule}</span>
                </div>
              {/each}
              {#if summaryResult.exportRules.length > 5}
                <span class="summary-rules-more">+{summaryResult.exportRules.length - 5} {t("summary.more_rules")}</span>
              {/if}
            </div>
          {/if}

          {#if showCorrectionInput}
            <div class="correction-input-area">
              <textarea
                class="correction-input"
                bind:value={correctionText}
                placeholder={t("summary.correction_placeholder")}
                rows="2"
              ></textarea>
              <div class="correction-buttons">
                <button
                  class="correction-send"
                  onclick={() => { requestCorrections(correctionText); correctionText = ""; showCorrectionInput = false; }}
                  disabled={!correctionText.trim()}
                >{t("summary.send_correction")}</button>
                <button
                  class="correction-cancel"
                  onclick={() => { showCorrectionInput = false; }}
                >{t("profiling.back")}</button>
              </div>
            </div>
          {:else}
            <div class="summary-actions">
              <button class="summary-confirm" onclick={confirmSummary}>
                {t("summary.looks_good")}
              </button>
              <button class="summary-correct" onclick={() => { showCorrectionInput = true; }}>
                {t("summary.fix_something")}
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {:else if aiActive}
    <!-- AI Chat mode -->
    {#if aiLoading && aiMessages.length === 0}
      <!-- Empty state: connecting -->
      <div class="ai-connecting">
        <div class="scan-ring"></div>
        <p class="ai-connecting-text">{t("profiling.ai_connecting")}</p>
      </div>
    {:else}
      <div class="chat-area" bind:this={chatContainer}>
        {#each aiMessages as msg, i}
          <div class="chat-bubble {msg.role}" class:animate-fade-up={true} style="--delay: {i * 50}ms">
            <span class="chat-role">{msg.role === "assistant" ? "meport" : t("profiling.you")}</span>
            <p class="chat-text">{msg.content}</p>
          </div>
        {/each}
        {#if aiLoading}
          <div class="chat-bubble assistant typing">
            <span class="chat-role">meport</span>
            {#if streamingText}
              <p class="chat-text">{streamingText}</p>
            {:else}
              <span class="typing-dots">
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              </span>
            {/if}
          </div>
        {/if}

        <!-- Retry button on error -->
        {#if aiLastMessageIsError && !aiLoading && lastUserText}
          <div class="retry-row">
            <button class="retry-btn" onclick={handleRetry}>
              {t("profiling.ai_retry")}
            </button>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Options / Input -->
    <div class="response-bar">
      {#if aiLoading}
        <!-- nothing while loading -->
      {:else if showTextInput}
        <div class="chat-input-bar">
          <textarea
            class="chat-input"
            bind:value={chatInput}
            onkeydown={handleChatKeydown}
            placeholder={t("profiling.chat_placeholder")}
            rows="1"
          ></textarea>
          <button class="chat-send" onclick={handleChatSend} disabled={!chatInput.trim()}><Icon name="send" size={16} /></button>
          <button class="chat-cancel" onclick={() => { showTextInput = false; }}><Icon name="x" size={16} /></button>
        </div>
      {:else if aiOptions.length > 0}
        <div class="options-row">
          {#each aiOptions as option}
            <button class="option-pill" onclick={() => handleOptionClick(option)}>
              {option}
            </button>
          {/each}
          <button class="option-pill option-write" onclick={() => { showTextInput = true; }}>
            <Icon name="edit" size={14} /> {t("profiling.write_own")}
          </button>
        </div>
      {:else}
        <div class="chat-input-bar">
          <textarea
            class="chat-input"
            bind:value={chatInput}
            onkeydown={handleChatKeydown}
            placeholder={t("profiling.chat_placeholder")}
            rows="1"
          ></textarea>
          <button class="chat-send" onclick={handleChatSend} disabled={!chatInput.trim()}><Icon name="send" size={16} /></button>
        </div>
      {/if}
    </div>

    <!-- Bottom status -->
    <div class="bottom-bar">
      <div class="dimension-counter">
        <span class="dim-num">{answered}</span>
        <span class="dim-label">{answered === 1 ? t("profiling.dim_captured") : t("profiling.dims_captured")}</span>
      </div>
      <div class="depth-indicator">
        <span class="depth-num">{aiDepth}%</span>
        <span class="dim-label">{t("profiling.depth")}</span>
      </div>
    </div>
  {:else}
    <!-- Card area (question mode) -->
    <div class="card-area">
      {#if event?.type === "question" || event?.type === "follow_up"}
        <QuestionCard
          question={(event as any).question}
          {animating}
          onAnswer={handleAnswer}
          onSkip={handleSkip}
        />
        {#if canGoBack()}
          <button class="back-btn-q" onclick={handleBack}>
            ← {t("profiling.back_question")}
          </button>
        {/if}
      {:else if event?.type === "confirm"}
        <!-- Pack engine: scan-detected value awaiting confirmation — rendered as regular question -->
        <QuestionCard
          question={(event as any).question}
          {animating}
          onAnswer={handleAnswer}
          onSkip={handleSkip}
        />
        {#if canGoBack()}
          <button class="back-btn-q" onclick={handleBack}>
            ← {t("profiling.back_question")}
          </button>
        {/if}
      {:else if event?.type === "tier_start"}
        <TierTransition
          tier={(event as any).tier}
          headline={t(`tier.name.${(event as any).tier}`) !== `tier.name.${(event as any).tier}` ? t(`tier.name.${(event as any).tier}`) : (event as any).name}
          body={t(`tier.intro.${(event as any).tier}`) !== `tier.intro.${(event as any).tier}` ? t(`tier.intro.${(event as any).tier}`) : (event as any).intro}
          kind="start"
          onContinue={handleTierContinue}
        />
      {:else if event?.type === "tier_complete"}
        <TierTransition
          tier={(event as any).tier}
          headline={t(`tier.complete.${(event as any).tier}`) !== `tier.complete.${(event as any).tier}` ? t(`tier.complete.${(event as any).tier}`) : (event as any).headline}
          body={t(`tier.complete.${(event as any).tier}.body`) !== `tier.complete.${(event as any).tier}.body` ? t(`tier.complete.${(event as any).tier}.body`) : (event as any).body}
          onContinue={handleTierContinue}
        />
      {:else if event?.type === "pack_start"}
        <!-- Pack engine: new pack starting — show as tier transition -->
        <TierTransition
          tier={0}
          headline={(event as any).packName}
          body={(event as any).intro}
          kind="start"
          onContinue={handleTierContinue}
        />
      {:else if event?.type === "pack_complete"}
        <!-- Pack engine: pack complete — advance automatically, nothing to render -->
        {#if false}{/if}
      {/if}
    </div>

    <!-- Bottom status -->
    <div class="bottom-bar">
      {#if answered >= 3}
        <div class="dimension-counter">
          <span class="dim-num">{answered}</span>
          <span class="dim-label">{t("profiling.dims_captured")}</span>
        </div>
      {:else}
        <div class="dimension-counter">
          <span class="dim-label dim-label-fade">{t("profiling.keep_going")}</span>
        </div>
      {/if}
      {#if aiEnabled}
        <div class="ai-badge" class:ai-active={aiEnriching}>
          <span class="ai-dot-badge"></span>
          <span class="ai-badge-text">{aiEnriching ? t("profiling.ai_working") : t("profiling.ai_connected")}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if synthesizing}
  <div class="synthesis-overlay">
    <div class="synthesis-content">
      <div class="synthesis-logo">
        <div class="synthesis-ring"></div>
      </div>
      <p class="synthesis-text">{t("profiling.building")}</p>
      <p class="synthesis-sub progress-rotate">{currentProgressMsg}</p>

      <!-- Live discovery feed — show what we already know -->
      <div class="synthesis-feed">
        <div class="feed-stats">
          <div class="feed-stat">
            <span class="feed-stat-num">{answered}</span>
            <span class="feed-stat-lbl">{t("profiling.dims_captured")}</span>
          </div>
          <div class="feed-stat">
            <span class="feed-stat-num">{aiInferredCount}</span>
            <span class="feed-stat-lbl">AI inferred</span>
          </div>
          {#if exportRulesPreview.length > 0}
            <div class="feed-stat">
              <span class="feed-stat-num">{exportRulesPreview.length}</span>
              <span class="feed-stat-lbl">rules</span>
            </div>
          {/if}
        </div>

        {#if exportRulesPreview.length > 0}
          <div class="feed-rules">
            {#each exportRulesPreview.slice(0, 3) as rule, i}
              <div class="feed-rule animate-fade-up" style="--delay: {800 + i * 400}ms">
                <span class="feed-rule-arrow"><Icon name="arrow-right" size={10} /></span>
                <span class="feed-rule-text">{rule}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .screen {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  /* Resume banner */
  .resume-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-4);
    background: var(--color-accent-bg);
    border-bottom: 1px solid var(--color-accent-border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .resume-text {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    line-height: 1.4;
    flex: 1;
  }

  .resume-actions {
    display: flex;
    gap: var(--sp-2);
    flex-shrink: 0;
  }

  .resume-btn-primary {
    padding: 6px 14px;
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    border-radius: var(--radius-xs);
    border: 1px solid var(--color-border);
    background: var(--color-bg-card);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background 0.15s;
  }

  .resume-btn-primary:hover {
    background: var(--color-bg-subtle);
    color: var(--color-text);
  }

  /* Top bar */
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    flex-shrink: 0;
    z-index: 10;
  }

  .back-btn {
    display: flex;
    align-items: center;
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--radius-xs);
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .back-btn:hover {
    color: var(--color-text-secondary);
    background: var(--color-bg-hover);
  }

  .progress-track {
    flex: 1;
    height: 3px;
    background: oklch(from #ffffff l c h / 0.06);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-accent);
    border-radius: 2px;
    transition: width 0.5s var(--ease-out-expo);
    box-shadow: 0 0 8px oklch(from #29ef82 l c h / 0.30);
  }

  .q-counter {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    min-width: 3rem;
    text-align: right;
  }

  .q-counter-placeholder {
    flex-shrink: 0;
    min-width: 3rem;
  }

  .live-counter {
    flex-shrink: 0;
  }

  .finish-btn {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-accent);
    background: var(--color-accent-bg);
    border: 1px solid var(--color-accent-border);
    padding: var(--sp-1) var(--sp-3);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s;
  }

  .finish-btn:hover {
    background: oklch(from #29ef82 l c h / 0.12);
  }

  /* Card area */
  .card-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-6);
    width: 100%;
    max-width: var(--content-width);
    margin: 0 auto;
  }

  .back-btn-q {
    background: none;
    border: none;
    color: var(--color-text-ghost);
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    cursor: pointer;
    padding: var(--sp-1) var(--sp-3);
    transition: color 0.2s;
  }

  .back-btn-q:hover {
    color: var(--color-text-muted);
  }

  /* ─── Chat area (AI mode) ─── */
  .chat-area {
    flex: 1;
    overflow-y: auto;
    padding: var(--sp-3) var(--sp-4);
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    max-width: 600px;
    margin: 0 auto;
    width: 100%;
  }

  .chat-bubble {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-md);
    max-width: 85%;
    animation: fade-up 0.3s var(--ease-out-expo) both;
    animation-delay: var(--delay, 0ms);
  }

  .chat-bubble.assistant {
    align-self: flex-start;
    background: oklch(from #ffffff l c h / 0.04);
    border: 1px solid oklch(from #ffffff l c h / 0.06);
  }

  .chat-bubble.user {
    align-self: flex-end;
    background: oklch(from #29ef82 l c h / 0.08);
    border: 1px solid oklch(from #29ef82 l c h / 0.12);
  }

  .chat-role {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-ghost);
  }

  .chat-text {
    font-size: var(--text-sm);
    line-height: 1.55;
    color: var(--color-text);
    margin: 0;
    white-space: pre-wrap;
  }

  .typing-dots {
    display: flex;
    gap: var(--sp-1);
    padding: var(--sp-1) 0;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-text-muted);
    animation: typing-bounce 1.2s infinite;
  }

  .dot:nth-child(2) { animation-delay: 0.15s; }
  .dot:nth-child(3) { animation-delay: 0.3s; }

  @keyframes typing-bounce {
    0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
    30% { opacity: 1; transform: translateY(-3px); }
  }

  /* AI connecting empty state */
  .ai-connecting {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-4);
  }

  .ai-connecting-text {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
  }

  /* Retry button */
  .retry-row {
    display: flex;
    justify-content: center;
    padding: var(--sp-2) 0;
  }

  .retry-btn {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    padding: var(--sp-1) var(--sp-3);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s;
  }

  .retry-btn:hover {
    color: var(--color-text);
    border-color: var(--color-border-strong);
  }

  /* Response bar (options or text input) */
  .response-bar {
    flex-shrink: 0;
    padding: var(--sp-2) var(--sp-4) var(--sp-3);
    max-width: 600px;
    margin: 0 auto;
    width: 100%;
  }

  .options-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    justify-content: center;
  }

  .option-pill {
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-md);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: all 0.2s;
  }

  .option-pill:hover {
    background: oklch(from #29ef82 l c h / 0.10);
    border-color: oklch(from #29ef82 l c h / 0.25);
    color: var(--color-accent);
    transform: translateY(-1px);
  }

  .option-pill:active {
    transform: translateY(0);
  }

  .option-write {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    background: none;
    border-style: dashed;
    border-color: oklch(from #ffffff l c h / 0.08);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .option-write:hover {
    border-color: oklch(from #ffffff l c h / 0.15);
    color: var(--color-text-secondary);
    background: oklch(from #ffffff l c h / 0.03);
  }

  /* Chat input */
  .chat-input-bar {
    display: flex;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4);
    border-top: 1px solid var(--color-border);
    flex-shrink: 0;
    max-width: 600px;
    margin: 0 auto;
    width: 100%;
  }

  .chat-input {
    flex: 1;
    resize: none;
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--sp-2) var(--sp-3);
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    line-height: 1.4;
    outline: none;
    transition: border-color 0.2s;
  }

  .chat-input:focus {
    border-color: var(--color-accent-border);
  }

  .chat-input:disabled {
    opacity: 0.5;
  }

  .chat-send {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-sm);
    background: var(--color-accent);
    border: none;
    color: #080a09;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
    align-self: flex-end;
  }

  .chat-send:hover:not(:disabled) {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
  }

  .chat-send:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .chat-cancel {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-sm);
    background: var(--color-bg-hover);
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
    align-self: flex-end;
  }

  .chat-cancel:hover {
    color: var(--color-text);
    background: oklch(from #ffffff l c h / 0.10);
  }

  /* Depth indicator */
  .depth-indicator {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
  }

  .depth-num {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-accent);
    font-variant-numeric: tabular-nums;
  }

  /* Bottom bar */
  .bottom-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-3) var(--sp-4);
    flex-shrink: 0;
  }

  .dimension-counter {
    display: flex;
    align-items: baseline;
    gap: var(--sp-1);
  }

  .dim-num {
    font-family: var(--font-mono);
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--color-accent);
    font-variant-numeric: tabular-nums;
  }

  .dim-label {
    font-size: var(--text-xs);
    color: var(--color-text-ghost);
  }

  .dim-label-fade {
    font-style: italic;
    opacity: 0.6;
  }

  /* ─── Scanning intro ─── */
  .scan-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--sp-6);
  }

  .scan-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
    transition: opacity 0.4s ease, transform 0.4s ease;
  }

  .scan-fade-out {
    opacity: 0;
    transform: translateY(-10px);
  }

  .scan-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--sp-2);
  }

  .scan-ring {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid oklch(from #29ef82 l c h / 0.15);
    border-top-color: var(--color-accent);
    animation: synthesis-spin 1s linear infinite;
  }

  .scan-title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    margin: 0;
    letter-spacing: -0.01em;
  }

  .scan-item {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-1) 0;
  }

  .scan-label {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-ghost);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    min-width: 80px;
    text-align: right;
  }

  .scan-value {
    font-size: var(--text-xs);
    color: var(--color-accent);
    font-weight: 500;
  }

  /* ─── Scan offer / results ─── */
  .scan-offer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
    text-align: center;
    max-width: 320px;
  }

  .scan-offer-title {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    letter-spacing: -0.01em;
  }

  .scan-offer-desc {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.5;
  }

  .scan-offer-buttons {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    width: 100%;
    margin-top: var(--sp-1);
  }

  .scan-btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-4);
    border-radius: var(--radius-sm);
    background: var(--color-accent);
    border: none;
    color: #080a09;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .scan-btn-primary:hover {
    background: var(--color-accent-hover, var(--color-accent));
    transform: translateY(-1px);
  }

  .scan-btn-skip {
    padding: var(--sp-2) var(--sp-4);
    border-radius: var(--radius-sm);
    background: none;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: all 0.2s;
  }

  .scan-btn-skip:hover {
    border-color: oklch(from #ffffff l c h / 0.18);
    color: var(--color-text-secondary);
  }

  .scan-results {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    text-align: center;
  }

  .scan-results-check {
    color: var(--color-accent);
    margin: 0;
  }

  .scan-results-detail {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-ghost);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* ─── Paste / instruction import ─── */
  .paste-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
    width: 100%;
    max-width: 420px;
    text-align: center;
  }

  .paste-title {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
  }

  .paste-subtitle {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.4;
  }

  .paste-platforms {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
    justify-content: center;
  }

  .paste-platform-pill {
    padding: var(--sp-1) var(--sp-3);
    border-radius: var(--radius-md);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all 0.2s;
  }

  .paste-platform-pill:hover {
    border-color: var(--color-border-hover);
  }

  .paste-platform-pill.active {
    border-color: var(--color-accent);
    color: var(--color-accent);
    background: var(--color-accent-bg);
  }

  /* Paste platform cards (expandable) */
  .paste-platform-cards {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    width: 100%;
  }

  .paste-platform-card {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    width: 100%;
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--radius-md);
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .paste-platform-card span {
    flex: 1;
    text-align: left;
  }

  .paste-platform-card:hover {
    background: oklch(from #ffffff l c h / 0.03);
  }

  .paste-platform-card.active {
    border-color: oklch(from #29ef82 l c h / 0.3);
  }

  .paste-platform-expand {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: 0 var(--sp-2) var(--sp-2);
  }

  .paste-platform-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
    opacity: 0.8;
    line-height: 1.4;
  }

  .paste-textarea {
    width: 100%;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    padding: var(--sp-3);
    resize: vertical;
    line-height: 1.5;
    box-sizing: border-box;
    transition: border-color 0.2s;
  }

  .paste-textarea:focus {
    outline: none;
    border-color: var(--color-accent);
  }

  .paste-textarea::placeholder {
    color: var(--color-text-ghost);
  }

  .paste-actions {
    display: flex;
    gap: var(--sp-2);
    align-items: center;
    width: 100%;
  }

  .paste-analyze-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-4);
    background: var(--color-accent);
    border: none;
    border-radius: var(--radius-sm);
    color: #080a09;
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .paste-analyze-btn:hover:not(:disabled) {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
  }

  .paste-analyze-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .paste-file-btn {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    padding: var(--sp-2) var(--sp-3);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all 0.2s;
  }

  .paste-file-btn:hover {
    border-color: var(--color-border-hover);
    color: var(--color-text-secondary);
  }

  .paste-error {
    font-size: var(--text-xs);
    color: oklch(from #f87171 l c h / 0.80);
    margin: 0;
  }

  .paste-skip-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    background: none;
    border: none;
    color: var(--color-text-ghost);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    padding: var(--sp-1) var(--sp-2);
    transition: color 0.2s;
  }

  .paste-skip-btn:hover {
    color: var(--color-text-secondary);
  }

  .paste-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
  }

  .paste-loading-text {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .paste-done {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
  }

  .paste-done-check {
    color: var(--color-accent);
    margin: 0;
  }

  .paste-done-text {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-accent);
    margin: 0;
  }

  /* ─── Follow-up phase ─── */
  .followup-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--sp-3) var(--sp-6);
    max-width: var(--content-width);
    margin: 0 auto;
    width: 100%;
  }

  .followup-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
  }

  .followup-loading-text {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .progress-rotate {
    transition: opacity 0.3s ease;
    min-height: 1.2em;
  }

  .discovered-dims {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1);
    justify-content: center;
    margin-top: var(--sp-2);
    max-width: 320px;
  }

  .discovered-dim {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-accent);
    background: var(--color-accent-bg);
    border: 1px solid var(--color-accent-border);
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--radius-sm);
    opacity: 0;
    animation: fade-up 0.4s var(--ease-out-expo) forwards;
    animation-delay: var(--delay, 0ms);
  }

  .followup-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
    text-align: center;
    width: 100%;
  }

  .followup-card.ai-styled {
    background: oklch(from #1ec9c9 l c h / 0.03);
    border: 1px solid oklch(from #1ec9c9 l c h / 0.10);
    border-left: 3px solid oklch(from #1ec9c9 l c h / 0.30);
    border-radius: var(--radius-lg);
    padding: var(--sp-4) var(--sp-3);
    box-shadow: 0 0 24px oklch(from #1ec9c9 l c h / 0.04);
  }

  .followup-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .followup-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: oklch(from #1ec9c9 l c h / 0.85);
    background: oklch(from #1ec9c9 l c h / 0.10);
    border: 1px solid oklch(from #1ec9c9 l c h / 0.18);
    padding: var(--sp-1) var(--sp-3);
    border-radius: var(--radius-sm);
  }

  .ai-option {
    border-color: oklch(from #1ec9c9 l c h / 0.15) !important;
  }

  .ai-option:hover {
    border-color: oklch(from #1ec9c9 l c h / 0.40) !important;
    background: oklch(from #1ec9c9 l c h / 0.08) !important;
  }

  .skip-followups {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    background: none;
    border: none;
    color: var(--color-text-ghost);
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    cursor: pointer;
    padding: var(--sp-1) var(--sp-2);
    transition: color 0.2s;
    margin-top: var(--sp-1);
  }

  .skip-followups:hover {
    color: var(--color-text-secondary);
  }

  .followup-question {
    font-size: var(--text-lg);
    font-weight: 500;
    color: oklch(from #ffffff l c h / 0.90);
    margin: 0;
    line-height: 1.45;
    letter-spacing: -0.01em;
  }

  .followup-why {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
    max-width: 320px;
  }

  .followup-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    justify-content: center;
    margin-top: var(--sp-2);
  }

  .followup-progress {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-ghost);
    margin-top: var(--sp-2);
  }

  /* ─── Summary rules preview ─── */
  .summary-rules {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    width: 100%;
    margin-top: var(--sp-2);
    padding-top: var(--sp-2);
    border-top: 1px solid var(--color-border);
  }

  .summary-rules-heading {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-accent);
    margin-bottom: var(--sp-1);
  }

  .summary-rule-item {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .summary-rule-arrow {
    color: oklch(from #29ef82 l c h / 0.5);
    flex-shrink: 0;
  }

  .summary-rule-text {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    line-height: 1.35;
    text-align: left;
  }

  .summary-rules-more {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-ghost);
    text-align: center;
    margin-top: var(--sp-1);
  }

  /* ─── Summary phase ─── */
  .summary-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--sp-3) var(--sp-6);
    max-width: var(--content-width);
    margin: 0 auto;
    width: 100%;
    overflow-y: auto;
  }

  .summary-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
    text-align: center;
    width: 100%;
  }

  .summary-archetype {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-accent);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .summary-narrative {
    font-size: var(--text-sm);
    line-height: 1.6;
    color: var(--color-text-secondary);
    margin: 0;
    text-align: left;
    width: 100%;
  }

  .summary-patterns {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    width: 100%;
    margin-top: var(--sp-1);
  }

  .summary-pattern-item {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    text-align: left;
  }

  .summary-pattern-title {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-accent);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .summary-pattern-obs {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    line-height: 1.4;
  }

  .summary-actions {
    display: flex;
    gap: var(--sp-2);
    width: 100%;
    margin-top: var(--sp-2);
  }

  .summary-confirm {
    flex: 1;
    padding: var(--sp-2) var(--sp-4);
    border-radius: var(--radius-sm);
    background: var(--color-accent);
    border: none;
    color: #080a09;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .summary-confirm:hover {
    transform: translateY(-1px);
  }

  .summary-correct {
    flex: 1;
    padding: var(--sp-2) var(--sp-4);
    border-radius: var(--radius-sm);
    background: none;
    border: 1px solid oklch(from #ffffff l c h / 0.12);
    color: var(--color-text-secondary);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: all 0.2s;
  }

  .summary-correct:hover {
    border-color: oklch(from #ffffff l c h / 0.20);
    color: var(--color-text);
  }

  .correction-input-area {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-top: var(--sp-1);
  }

  .correction-input {
    width: 100%;
    resize: none;
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--sp-2) var(--sp-3);
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    line-height: 1.4;
    outline: none;
    transition: border-color 0.2s;
  }

  .correction-input:focus {
    border-color: var(--color-accent-border);
  }

  .correction-buttons {
    display: flex;
    gap: var(--sp-2);
  }

  .correction-send {
    flex: 1;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-accent);
    border: none;
    color: #080a09;
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .correction-send:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .correction-cancel {
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: none;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: all 0.2s;
  }

  /* ─── AI badge ─── */
  .ai-badge {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--radius-sm);
    background: var(--color-accent-bg);
    border: 1px solid var(--color-accent-border);
    transition: all 0.3s;
  }

  .ai-badge.ai-active {
    border-color: oklch(from #29ef82 l c h / 0.25);
    background: oklch(from #29ef82 l c h / 0.08);
  }

  .ai-dot-badge {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-accent);
    animation: ai-pulse 1.5s ease-in-out infinite;
  }

  .ai-badge-text {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: oklch(from #29ef82 l c h / 0.7);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  @keyframes ai-pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }

  /* Synthesis overlay */
  .synthesis-overlay {
    position: fixed;
    inset: 0;
    background: oklch(from #080a09 l c h / 0.92);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fade-in 0.4s ease both;
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .synthesis-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-4);
    text-align: center;
  }

  .synthesis-logo {
    position: relative;
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .synthesis-ring {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 2px solid oklch(from #29ef82 l c h / 0.20);
    border-top-color: var(--color-accent);
    animation: synthesis-spin 1.2s linear infinite;
  }

  @keyframes synthesis-spin {
    to { transform: rotate(360deg); }
  }

  .synthesis-text {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .synthesis-sub {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  /* ─── Synthesis live feed ─── */
  .synthesis-feed {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
    margin-top: var(--sp-4);
    max-width: 360px;
    width: 100%;
  }

  .feed-stats {
    display: flex;
    gap: var(--sp-4);
    justify-content: center;
  }

  .feed-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-1);
  }

  .feed-stat-num {
    font-family: var(--font-mono);
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-accent);
    font-variant-numeric: tabular-nums;
  }

  .feed-stat-lbl {
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-ghost);
  }

  .feed-rules {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    width: 100%;
  }

  .feed-rule {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    opacity: 0;
    animation: fade-up 0.5s var(--ease-out-expo) forwards;
    animation-delay: var(--delay, 0ms);
  }

  .feed-rule-arrow {
    color: oklch(from #29ef82 l c h / 0.5);
    flex-shrink: 0;
  }

  .feed-rule-text {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    line-height: 1.4;
    text-align: left;
  }

  /* ─── Rapid Mode ─────────────────────────── */
  .rapid-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1.5rem 1.5rem 2rem;
    overflow-y: auto;
  }

  .rapid-import {
    width: 100%;
    max-width: 520px;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* Existing profile summary */
  .rapid-existing {
    padding: var(--sp-4);
    border-radius: var(--radius-lg);
    background: oklch(from #29ef82 l c h / 0.05);
    border: 1px solid oklch(from #29ef82 l c h / 0.12);
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .rapid-existing-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-accent);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .rapid-existing-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .rapid-existing-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px var(--sp-2);
    border-radius: var(--radius-sm);
    background: oklch(from #29ef82 l c h / 0.08);
    font-size: var(--text-xs);
  }

  .rapid-chip-label {
    color: var(--color-text-muted);
  }

  .rapid-chip-value {
    color: var(--color-text);
    font-weight: 500;
  }

  /* Sections */
  .rapid-section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5) 0;
    border-bottom: 1px solid oklch(from #ffffff l c h / 0.06);
  }

  .rapid-section:last-of-type {
    border-bottom: none;
    padding-bottom: var(--sp-2);
  }

  .rapid-section-optional {
    padding: var(--sp-4) 0;
  }

  .rapid-section-title {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    line-height: 1.3;
  }

  .rapid-section-sub {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 2px 0 0 0;
    line-height: 1.4;
  }

  .rapid-textarea {
    min-height: 100px;
  }

  .rapid-textarea-sm {
    min-height: 80px;
  }

  .rapid-auto-detected {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-accent);
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: calc(-1 * var(--sp-1));
  }

  /* Two action cards side by side */
  .rapid-two-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-3);
  }

  .rapid-action-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-5) var(--sp-3);
    border-radius: var(--radius-lg);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.2s;
    font-family: var(--font-sans);
    text-align: center;
  }

  .rapid-action-card:hover:not(:disabled) {
    border-color: oklch(from #29ef82 l c h / 0.3);
    background: oklch(from #29ef82 l c h / 0.05);
    color: var(--color-accent);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  }

  .rapid-action-card:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .rapid-action-card.dragging {
    border-color: var(--color-accent);
    background: oklch(from #29ef82 l c h / 0.08);
    color: var(--color-accent);
  }

  .rapid-action-card-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
    line-height: 1.3;
  }

  .rapid-action-card-sub {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    line-height: 1.4;
  }

  @media (max-width: 500px) {
    .rapid-two-buttons { grid-template-columns: 1fr; }
  }

  /* Optional AI data toggle */
  .rapid-optional-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0;
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: color 0.2s;
  }

  .rapid-optional-toggle:hover {
    color: var(--color-text-secondary);
  }

  .rapid-optional-label {
    font-weight: 500;
  }

  /* Platform pills + body */
  .rapid-platforms-grid {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin-top: var(--sp-3);
  }

  .rapid-platform-pills {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
  }

  .paste-platform-pill.has-data {
    border-color: oklch(from #29ef82 l c h / 0.3);
    color: var(--color-accent);
  }

  .rapid-platform-body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .rapid-platform-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
    opacity: 0.8;
    line-height: 1.4;
  }

  /* Files section */
  .rapid-file-buttons {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
  }

  .rapid-file-btn {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all 0.2s;
  }

  .rapid-file-btn:hover:not(:disabled) {
    border-color: var(--color-border-hover);
    background: var(--color-bg-hover);
    color: var(--color-text);
  }

  .rapid-file-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* legacy — kept for non-rapid contexts */
  .rapid-dropzone-slim {
    padding: var(--sp-2) var(--sp-3);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-sm);
    text-align: center;
    font-size: var(--text-xs);
    color: var(--color-text-ghost);
    transition: all 0.2s;
  }

  .rapid-dropzone-slim.dragging {
    border-color: var(--color-accent);
    background: oklch(from #29ef82 l c h / 0.05);
    color: var(--color-accent);
  }

  .rapid-files {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .rapid-file {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--color-surface-raised);
    border-radius: var(--radius-md);
    padding: 0.35rem 0.75rem;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .rapid-file-name {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rapid-file-remove {
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
    font-size: 1rem;
    line-height: 1;
    opacity: 0.6;
  }

  .rapid-file-remove:hover {
    opacity: 1;
    color: var(--color-error);
  }

  .rapid-bookmarks-hint {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: var(--sp-2) 0 0 0;
    opacity: 0.7;
  }

  /* Actions area */
  .rapid-actions-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
    padding-top: var(--sp-6);
  }

  .rapid-source-count {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-accent);
    margin: 0;
  }

  .rapid-analyze-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.85rem 2rem;
    background: var(--color-accent);
    color: #000;
    border: none;
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
  }

  .rapid-analyze-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 8px 24px oklch(from #29ef82 l c h / 0.20);
  }

  .rapid-analyze-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .rapid-skip-btn {
    background: transparent;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: var(--text-sm);
    padding: 0.5rem;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .rapid-skip-btn:hover {
    opacity: 1;
  }

  .rapid-skip-link {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    padding: var(--sp-1) var(--sp-2);
    text-decoration: underline;
    transition: color 0.2s;
  }

  .rapid-skip-link:hover {
    color: var(--color-text-secondary);
  }

  .rapid-skip-btn-visible {
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    cursor: pointer;
    padding: var(--sp-2) var(--sp-4);
    transition: all 0.2s;
    width: 100%;
  }

  .rapid-skip-btn-visible:hover {
    border-color: var(--color-border-hover);
    background: var(--color-bg-hover);
    color: var(--color-text);
  }

  .rapid-synth {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 3rem 2rem;
  }

  .rapid-synth-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
  }

  .rapid-synth-sub {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
  }

  .rapid-micro {
    width: 100%;
    max-width: 480px;
    padding: 1.5rem;
  }

  .rapid-micro-why {
    font-size: var(--text-xs);
    color: oklch(from var(--color-accent) l c h / 0.7);
    font-style: italic;
    margin: 0.5rem 0 1rem;
    line-height: 1.4;
  }

  .rapid-micro-text {
    width: 100%;
  }

  .comparison-container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
  }

  .comparison-option {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px solid oklch(from var(--color-text) l c h / 0.12);
    border-radius: 12px;
    background: oklch(from var(--color-bg) l c h / 0.6);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.2s, background 0.2s;
  }

  .comparison-option:hover {
    border-color: var(--color-accent);
    background: oklch(from var(--color-accent) l c h / 0.06);
  }

  .comparison-label {
    flex-shrink: 0;
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: oklch(from var(--color-accent) l c h / 0.15);
    color: var(--color-accent);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .comparison-text {
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--color-text);
    opacity: 0.85;
  }

  .comparison-depends {
    align-self: center;
    margin-top: 0.25rem;
  }

  .rapid-synth-elapsed {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-ghost);
    margin-top: var(--sp-1);
  }

  .rapid-synth-cancel {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    padding: var(--sp-1) var(--sp-2);
    margin-top: var(--sp-2);
    transition: color 0.2s;
    text-decoration: underline;
  }
  .rapid-synth-cancel:hover { color: var(--color-text); }

  .rapid-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: var(--sp-3);
    flex: 1;
    padding: var(--sp-6);
  }

  .rapid-error-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: oklch(from #f87171 l c h / 0.10);
    border: 1px solid oklch(from #f87171 l c h / 0.20);
    display: flex;
    align-items: center;
    justify-content: center;
    color: oklch(from #f87171 l c h / 0.70);
  }

  .rapid-error-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
  }

  .rapid-error-msg {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
    max-width: 320px;
  }

  .rapid-error-actions {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    align-items: center;
    margin-top: var(--sp-2);
  }

  /* Pack selector */
  .pack-selector-area {
    flex: 1;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    overflow-y: auto;
    padding: var(--sp-8) var(--sp-6);
  }

  .pack-selector {
    width: 100%;
    max-width: var(--content-width);
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
  }

  .pack-title {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .pack-subtitle {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.5;
  }

  .pack-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-2);
  }

  .pack-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-1);
    padding: var(--sp-4);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
  }

  .pack-card:hover {
    border-color: var(--color-accent-border);
    background: var(--color-bg-subtle);
  }

  .pack-card.selected {
    border-color: var(--color-accent);
    background: var(--color-accent-bg);
  }

  .pack-icon {
    font-size: 18px;
    line-height: 1;
  }

  .pack-name {
    font-size: var(--text-sm);
    color: var(--color-text);
    font-weight: 600;
  }

  .pack-desc {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    line-height: 1.4;
  }

  .pack-badge {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-ghost);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 2px 6px;
    margin-top: var(--sp-1);
  }

  .pack-start-btn {
    padding: 14px 24px;
    background: var(--color-accent);
    color: var(--color-bg);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 600;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: opacity 0.2s;
    align-self: flex-start;
  }

  .pack-start-btn:hover {
    opacity: 0.9;
  }
</style>
