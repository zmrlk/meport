<script lang="ts">
  import { goTo, setApiKey, setApiProvider, setOllamaUrl, setAiModel, hasApiKey, type AIProvider } from "../lib/stores/app.svelte.js";
  import { listOllamaModels, pullOllamaModel, RECOMMENDED_OLLAMA_MODELS, createAIClient, type OllamaModel } from "@meport/core/client";
  import { t, getLocale } from "../lib/i18n.svelte.js";
  import Icon from "../components/Icon.svelte";
  import logoDark from "../assets/logo-dark.png";

  let locale = $derived(getLocale());

  // ─── Steps ───
  type Step = "welcome" | "choose" | "ollama" | "cloud" | "ready";
  let step = $state<Step>("welcome");
  let aiChoice = $state<"local" | "cloud" | "skip">("local");

  // ─── Ollama state ───
  let ollamaStatus = $state<"checking" | "found" | "not-found">("checking");
  let ollamaModels = $state<OllamaModel[]>([]);
  let selectedModel = $state("llama3.1:8b");
  let pulling = $state(false);
  let pullProgress = $state(0);
  let pullStatus = $state("");
  let pullDone = $state(false);
  let showInstallGuide = $state(false);
  let ollamaUrl = $state("http://localhost:11434");

  // ─── Cloud state ───
  let cloudProvider = $state<AIProvider>("claude");
  let cloudKey = $state("");
  let cloudModel = $state("");
  let cloudTesting = $state(false);
  let cloudConnected = $state(false);
  let cloudError = $state("");

  const cloudProviders: { id: AIProvider; label: string; placeholder: string; defaultModel: string }[] = [
    { id: "claude", label: "Claude (Anthropic)", placeholder: "sk-ant-api03-...", defaultModel: "claude-sonnet-4-6-20250929" },
    { id: "openai", label: "OpenAI", placeholder: "sk-...", defaultModel: "gpt-5.4" },
    { id: "gemini", label: "Gemini (Google)", placeholder: "AIza...", defaultModel: "gemini-3.1-pro" },
    { id: "openrouter", label: "OpenRouter", placeholder: "sk-or-...", defaultModel: "anthropic/claude-sonnet-4-6-20250929" },
  ];

  // ─── Actions ───
  function goStep(s: Step) {
    step = s;
  }

  function chooseAI(choice: "local" | "cloud" | "skip") {
    aiChoice = choice;
    if (choice === "local") {
      step = "ollama";
      detectOllama();
    } else if (choice === "cloud") {
      step = "cloud";
    } else {
      finishOnboarding();
    }
  }

  async function detectOllama() {
    ollamaStatus = "checking";
    try {
      const models = await listOllamaModels(ollamaUrl);
      if (models.length > 0) {
        ollamaModels = models;
        ollamaStatus = "found";
        // Auto-select best installed model
        const installed = models.map(m => m.name);
        const rec = RECOMMENDED_OLLAMA_MODELS.find(r => installed.some(i => i.startsWith(r.name.split(":")[0])));
        if (rec) {
          const match = installed.find(i => i.startsWith(rec.name.split(":")[0]));
          if (match) selectedModel = match;
        } else {
          selectedModel = models[0].name;
        }
      } else {
        ollamaStatus = "found"; // Ollama running but no models
        ollamaModels = [];
      }
    } catch {
      ollamaStatus = "not-found";
    }
  }

  async function pullModel() {
    pulling = true;
    pullProgress = 0;
    pullStatus = t("onboard.downloading");
    pullDone = false;

    const success = await pullOllamaModel(ollamaUrl, selectedModel, (pct, status) => {
      if (pct >= 0) pullProgress = pct;
      pullStatus = status === "success" ? t("onboard.model_ready") : status;
    });

    pulling = false;
    pullDone = success;
    if (success) {
      // Refresh model list
      ollamaModels = await listOllamaModels(ollamaUrl);
    }
  }

  function confirmOllama() {
    setApiProvider("ollama");
    setOllamaUrl(ollamaUrl);
    setAiModel(selectedModel);
    setApiKey(""); // Ollama doesn't need key
    step = "ready";
  }

  async function testCloud() {
    if (!cloudKey.trim()) return;
    cloudTesting = true;
    cloudConnected = false;
    cloudError = "";
    try {
      const client = createAIClient({
        provider: cloudProvider,
        apiKey: cloudKey,
        model: cloudModel || undefined,
      });
      await client.generate("Say 'ok' in one word.");
      cloudConnected = true;
    } catch (e) {
      cloudError = e instanceof Error ? e.message : "Connection failed";
    }
    cloudTesting = false;
  }

  function confirmCloud() {
    setApiProvider(cloudProvider);
    setApiKey(cloudKey);
    if (cloudModel) setAiModel(cloudModel);
    step = "ready";
  }

  function finishOnboarding() {
    localStorage.setItem("meport:onboarded", "true");
    goTo("home");
  }

  // Check if model is already installed
  function isModelInstalled(name: string): boolean {
    return ollamaModels.some(m => m.name === name || m.name.startsWith(name.split(":")[0]));
  }

  // Platform detection
  let platform = $state<"mac" | "win" | "linux">("mac");
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("win")) platform = "win";
    else if (ua.includes("linux")) platform = "linux";
  }
</script>

<div class="onboard">
  <!-- ═══════ STEP 1: WELCOME ═══════ -->
  {#if step === "welcome"}
    <div class="step animate-fade-up">
      <div class="logo-area">
        <img src={logoDark} alt="Meport" class="logo-big" />
      </div>
      <h1 class="step-title">{t("onboard.welcome_title")}</h1>
      <p class="step-sub">{t("onboard.welcome_sub")}</p>
      <button class="btn-primary btn-lg" onclick={() => goStep("choose")}>
        {t("onboard.start")}
        <Icon name="arrow-right" size={16} />
      </button>
      <p class="trust">{t("home.trust")}</p>
    </div>

  <!-- ═══════ STEP 2: CHOOSE AI ═══════ -->
  {:else if step === "choose"}
    <div class="step animate-fade-up">
      <h1 class="step-title">{t("onboard.choose_ai")}</h1>
      <p class="step-sub">{t("onboard.choose_ai_sub")}</p>

      <div class="choice-cards">
        <button class="choice-card recommended" onclick={() => chooseAI("local")}>
          <div class="choice-icon">
            <Icon name="cpu" size={24} />
          </div>
          <span class="choice-label">{t("onboard.local")}</span>
          <span class="choice-desc">{t("onboard.local_desc")}</span>
          <span class="choice-badge">{locale === "pl" ? "Rekomendowane" : "Recommended"}</span>
        </button>

        <button class="choice-card" onclick={() => chooseAI("cloud")}>
          <div class="choice-icon">
            <Icon name="cloud" size={24} />
          </div>
          <span class="choice-label">{t("onboard.cloud")}</span>
          <span class="choice-desc">{t("onboard.cloud_desc")}</span>
        </button>
      </div>

      <button class="btn-ghost" onclick={() => chooseAI("skip")}>
        {t("onboard.skip_ai")}
      </button>
    </div>

  <!-- ═══════ STEP 3A: OLLAMA SETUP ═══════ -->
  {:else if step === "ollama"}
    <div class="step animate-fade-up">
      <button class="back-link" onclick={() => goStep("choose")}>
        <Icon name="arrow-left" size={14} />
        {t("onboard.back")}
      </button>

      <h1 class="step-title">{t("onboard.local")}</h1>

      <!-- Detection status -->
      {#if ollamaStatus === "checking"}
        <div class="status-card">
          <span class="spinner-sm"></span>
          <span>{t("onboard.ollama_checking")}</span>
        </div>
      {:else if ollamaStatus === "not-found"}
        <div class="status-card error">
          <Icon name="x" size={16} />
          <span>{t("onboard.ollama_not_found")}</span>
        </div>

        <div class="install-section">
          <button class="btn-secondary" onclick={() => { showInstallGuide = !showInstallGuide; }}>
            <Icon name="info" size={14} />
            {t("onboard.ollama_install")}
          </button>

          {#if showInstallGuide}
            <div class="install-guide card animate-fade-up">
              {#if platform === "mac"}
                <p class="install-label">{t("onboard.install_mac")}:</p>
                <code class="install-cmd">brew install ollama && ollama serve</code>
                <p class="install-alt">{locale === "pl" ? "lub pobierz z" : "or download from"} <a href="https://ollama.com/download" target="_blank" rel="noopener">ollama.com/download</a></p>
              {:else if platform === "win"}
                <p class="install-label">{t("onboard.install_win")}:</p>
                <a href="https://ollama.com/download/windows" target="_blank" rel="noopener" class="install-link">
                  <Icon name="download" size={14} />
                  ollama.com/download/windows
                </a>
              {:else}
                <p class="install-label">{t("onboard.install_linux")}:</p>
                <code class="install-cmd">curl -fsSL https://ollama.com/install.sh | sh</code>
              {/if}
            </div>
          {/if}

          <button class="btn-primary" onclick={detectOllama}>
            <Icon name="rotate" size={14} />
            {t("onboard.ollama_retry")}
          </button>
        </div>
      {:else}
        <!-- Ollama found -->
        <div class="status-card success">
          <Icon name="check" size={16} />
          <span>{t("onboard.ollama_detected")}</span>
          <span class="status-detail">{ollamaModels.length} {locale === "pl" ? "modeli" : "models"}</span>
        </div>

        <!-- Model selection -->
        <div class="model-section">
          <p class="section-label">{t("onboard.select_model")}</p>
          <p class="step-sub">{t("onboard.select_model_sub")}</p>

          <div class="model-list">
            {#each RECOMMENDED_OLLAMA_MODELS as rec}
              {@const installed = isModelInstalled(rec.name)}
              <button
                class="model-card"
                class:active={selectedModel === rec.name || (installed && selectedModel.startsWith(rec.name.split(":")[0]))}
                class:installed
                onclick={() => { selectedModel = rec.name; }}
              >
                <div class="model-info">
                  <span class="model-name">{rec.name}</span>
                  <span class="model-size">{rec.size} · RAM {rec.ram}</span>
                  <span class="model-desc">{locale === "pl" ? rec.desc_pl : rec.desc_en}</span>
                </div>
                <div class="model-status">
                  {#if installed}
                    <span class="model-badge installed"><Icon name="check" size={10} /> {t("onboard.model_installed")}</span>
                  {:else}
                    <span class="model-badge available">{t("onboard.model_available")}</span>
                  {/if}
                  {#if rec.recommended}
                    <span class="model-badge rec">★</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>

          <!-- Pull progress -->
          {#if pulling}
            <div class="pull-progress">
              <div class="progress-track">
                <div class="progress-fill" style="width: {pullProgress}%"></div>
              </div>
              <span class="pull-label">{pullStatus} {pullProgress > 0 ? `${pullProgress}%` : ""}</span>
            </div>
          {/if}

          {#if pullDone}
            <div class="status-card success animate-fade-up">
              <Icon name="check" size={16} />
              <span>{t("onboard.model_ready")}</span>
            </div>
          {/if}

          <div class="step-actions">
            {#if !isModelInstalled(selectedModel) && !pullDone}
              <button class="btn-primary" onclick={pullModel} disabled={pulling}>
                {#if pulling}
                  <span class="spinner-sm"></span>
                {:else}
                  <Icon name="download" size={14} />
                {/if}
                {t("onboard.download_model")}
              </button>
            {:else}
              <button class="btn-primary" onclick={confirmOllama}>
                {t("onboard.next")}
                <Icon name="arrow-right" size={14} />
              </button>
            {/if}
          </div>
        </div>
      {/if}
    </div>

  <!-- ═══════ STEP 3B: CLOUD SETUP ═══════ -->
  {:else if step === "cloud"}
    <div class="step animate-fade-up">
      <button class="back-link" onclick={() => goStep("choose")}>
        <Icon name="arrow-left" size={14} />
        {t("onboard.back")}
      </button>

      <h1 class="step-title">{t("onboard.cloud")}</h1>

      <div class="provider-list">
        {#each cloudProviders as p}
          <button
            class="provider-row"
            class:active={cloudProvider === p.id}
            onclick={() => { cloudProvider = p.id; cloudConnected = false; cloudError = ""; }}
          >
            <span class="provider-radio" class:checked={cloudProvider === p.id}></span>
            <span class="provider-label">{p.label}</span>
          </button>
        {/each}
      </div>

      <div class="key-row">
        <input
          type="password"
          class="key-input"
          placeholder={cloudProviders.find(p => p.id === cloudProvider)?.placeholder ?? ""}
          bind:value={cloudKey}
          onkeydown={(e) => { if (e.key === "Enter") testCloud(); }}
        />
      </div>

      {#if cloudConnected}
        <div class="status-card success animate-fade-up">
          <Icon name="check" size={16} />
          <span>{t("onboard.cloud_connected")}</span>
        </div>
      {:else if cloudError}
        <div class="status-card error">
          <Icon name="x" size={16} />
          <span>{cloudError}</span>
        </div>
      {/if}

      <div class="step-actions">
        {#if !cloudConnected}
          <button class="btn-primary" onclick={testCloud} disabled={cloudTesting || !cloudKey.trim()}>
            {#if cloudTesting}
              <span class="spinner-sm"></span>
            {:else}
              <Icon name="check" size={14} />
            {/if}
            {t("onboard.cloud_test")}
          </button>
        {:else}
          <button class="btn-primary" onclick={confirmCloud}>
            {t("onboard.next")}
            <Icon name="arrow-right" size={14} />
          </button>
        {/if}
      </div>
    </div>

  <!-- ═══════ STEP 4: READY ═══════ -->
  {:else if step === "ready"}
    <div class="step animate-fade-up">
      <div class="ready-icon">
        <Icon name="check" size={40} />
      </div>
      <h1 class="step-title">{t("onboard.ready")}</h1>
      <p class="step-sub">{t("onboard.ready_sub")}</p>
      <button class="btn-primary btn-lg" onclick={finishOnboarding}>
        {t("onboard.go_profile")}
        <Icon name="arrow-right" size={16} />
      </button>
    </div>
  {/if}
</div>

<style>
  .onboard {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow-y: auto;
    padding: var(--sp-8);
  }

  .step {
    max-width: 480px;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-4);
    text-align: center;
  }

  /* ─── Logo ─── */
  .logo-area {
    margin-bottom: var(--sp-4);
  }

  .logo-big {
    height: 56px;
    width: auto;
    filter: drop-shadow(0 0 20px oklch(from var(--color-accent) l c h / 0.2));
  }

  /* ─── Typography ─── */
  .step-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--color-text);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .step-sub {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
    max-width: 360px;
    line-height: 1.5;
  }

  .trust {
    font-size: var(--text-xs);
    color: var(--color-text-ghost);
    margin: 0;
  }

  /* ─── Buttons ─── */
  .btn-lg {
    padding: 14px 32px;
    font-size: var(--text-base);
    border-radius: var(--radius-md);
  }

  .back-link {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    align-self: flex-start;
    transition: color 0.15s;
  }

  .back-link:hover {
    color: var(--color-text);
  }

  /* ─── Choice cards ─── */
  .choice-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-3);
    width: 100%;
  }

  .choice-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-5) var(--sp-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-bg-card);
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    font-family: var(--font-sans);
    text-align: center;
  }

  .choice-card:hover {
    border-color: var(--color-border-hover);
    background: var(--color-bg-hover);
    transform: translateY(-2px);
  }

  .choice-card.recommended {
    border-color: var(--color-accent-border);
  }

  .choice-card.recommended:hover {
    border-color: var(--color-accent);
    box-shadow: 0 0 30px oklch(from var(--color-accent) l c h / 0.08);
  }

  .choice-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    background: var(--color-bg-subtle);
    color: var(--color-text-muted);
  }

  .choice-card.recommended .choice-icon {
    background: var(--color-accent-bg);
    color: var(--color-accent);
  }

  .choice-label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
  }

  .choice-desc {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    line-height: 1.4;
  }

  .choice-badge {
    position: absolute;
    top: -8px;
    right: -4px;
    font-size: 10px;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    background: var(--color-accent);
    color: #080a09;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  /* ─── Status card ─── */
  .status-card {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg-card);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    width: 100%;
    justify-content: center;
  }

  .status-card.success {
    border-color: var(--color-accent-border);
    background: var(--color-accent-bg);
    color: var(--color-accent);
  }

  .status-card.error {
    border-color: var(--color-error-border);
    background: var(--color-error-bg);
    color: var(--color-error);
  }

  .status-detail {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    opacity: 0.7;
  }

  .spinner-sm {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 1.5px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ─── Install guide ─── */
  .install-section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    width: 100%;
    align-items: center;
  }

  .install-guide {
    text-align: left;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .install-label {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .install-cmd {
    display: block;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-xs);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-accent);
    user-select: all;
  }

  .install-alt {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
  }

  .install-alt a, .install-link {
    color: var(--color-accent);
    text-decoration: none;
  }

  .install-link {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    font-size: var(--text-sm);
  }

  /* ─── Model list ─── */
  .model-section {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    text-align: left;
  }

  .model-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .model-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-3);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-bg-card);
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    font-family: var(--font-sans);
  }

  .model-card:hover {
    border-color: var(--color-border-hover);
  }

  .model-card.active {
    border-color: var(--color-accent-border);
    background: var(--color-accent-bg);
  }

  .model-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .model-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text);
  }

  .model-size {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .model-desc {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .model-status {
    display: flex;
    gap: var(--sp-1);
    flex-shrink: 0;
  }

  .model-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: var(--radius-full);
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .model-badge.installed {
    background: var(--color-accent-bg);
    color: var(--color-accent);
  }

  .model-badge.available {
    background: var(--color-bg-subtle);
    color: var(--color-text-muted);
  }

  .model-badge.rec {
    background: oklch(from #fbbf24 l c h / 0.12);
    color: #fbbf24;
  }

  /* ─── Pull progress ─── */
  .pull-progress {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    width: 100%;
  }

  .pull-label {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    text-align: center;
  }

  /* ─── Provider list (cloud) ─── */
  .provider-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    width: 100%;
  }

  .provider-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: 12px 16px;
    background: none;
    border: none;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-muted);
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    text-align: left;
    transition: background 0.15s;
  }

  .provider-row:last-child { border-bottom: none; }
  .provider-row.active { background: var(--color-accent-bg); color: var(--color-text); }
  .provider-row:hover:not(.active) { background: var(--color-bg-subtle); }

  .provider-radio {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid var(--color-border);
    flex-shrink: 0;
  }

  .provider-radio.checked {
    border-color: var(--color-accent);
    background: var(--color-accent);
    box-shadow: inset 0 0 0 3px var(--color-bg-card);
  }

  .provider-label { flex: 1; }

  .key-row {
    width: 100%;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    transition: border-color 0.2s;
  }

  .key-row:focus-within { border-color: var(--color-accent-border); }

  .key-input {
    width: 100%;
    padding: 12px 16px;
    background: var(--color-bg-card);
    border: none;
    color: var(--color-text);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    outline: none;
    box-sizing: border-box;
  }

  .key-input::placeholder { color: var(--color-text-ghost); }

  /* ─── Step actions ─── */
  .step-actions {
    display: flex;
    gap: var(--sp-2);
    width: 100%;
    justify-content: center;
  }

  /* ─── Ready ─── */
  .ready-icon {
    width: 72px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--color-accent-bg);
    border: 2px solid var(--color-accent-border);
    color: var(--color-accent);
    margin-bottom: var(--sp-2);
  }

  /* Shared classes from shared.css */
  .section-label {
    font-size: 11px;
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
    margin: 0;
  }

  @media (max-width: 520px) {
    .choice-cards {
      grid-template-columns: 1fr;
    }
  }
</style>
