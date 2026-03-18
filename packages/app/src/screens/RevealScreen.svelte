<script lang="ts">
  import BreathingLogo from "../components/BreathingLogo.svelte";
  import Icon from "../components/Icon.svelte";
  import Button from "../components/Button.svelte";
  import SectionLabel from "../components/SectionLabel.svelte";
  import { getProfile, goTo, setProfile } from "../lib/stores/app.svelte.js";
  import { getAnswered, getSynthesisResult, getSynthesizing } from "../lib/stores/profiling.svelte.js";
  import { t, getLocale } from "../lib/i18n.svelte.js";
  import { detectArchetype, getCategoryCompleteness, getSuggestions, categories } from "../lib/profile-display.js";

  let profile = $derived(getProfile());
  let answered = $derived(getAnswered());
  let locale = $derived(getLocale());
  let isSynthesizing = $derived(getSynthesizing());
  let liveSynthesis = $derived(getSynthesisResult());
  let synthesis = $derived(liveSynthesis ?? (profile?.synthesis ? {
    narrative: profile.synthesis.narrative,
    exportRules: profile.synthesis.exportRules,
    emergent: [],
    additionalInferred: {},
    archetype: profile.synthesis.archetype,
    archetypeDescription: profile.synthesis.archetypeDescription,
    cognitiveProfile: profile.synthesis.cognitiveProfile,
    communicationDNA: profile.synthesis.communicationDNA,
    contradictions: profile.synthesis.contradictions?.map(c => ({ ...c, confidence: 0.7 })),
    predictions: profile.synthesis.predictions,
    strengths: profile.synthesis.strengths,
    blindSpots: profile.synthesis.blindSpots,
  } : null));

  let dimensionCount = $derived(profile ? Object.keys(profile.explicit).length : 0);
  let inferredCount = $derived(profile ? Object.keys(profile.inferred).length : 0);
  let compoundCount = $derived(profile ? Object.keys(profile.compound).length : 0);
  let completeness = $derived(profile?.completeness ?? 0);
  let totalDims = $derived(dimensionCount + inferredCount + compoundCount);

  let archetype = $derived(profile ? detectArchetype(profile, locale) : { name: "", description: "" });

  let inferenceNarrative = $derived.by(() => {
    if (!profile || inferredCount === 0) return [];
    const groups: Map<string, { reason: string; dims: string[] }> = new Map();

    const signalLabels: Record<string, string> = {
      role_founder_infer: locale === "pl" ? "jeste\u015B founderem" : "you're a founder",
      role_developer_infer: locale === "pl" ? "jeste\u015B developerem" : "you're a developer",
      role_manager_infer: locale === "pl" ? "jeste\u015B managerem" : "you're a manager",
      role_student_infer: locale === "pl" ? "jeste\u015B studentem" : "you're a student",
      role_creative_infer: locale === "pl" ? "pracujesz kreatywnie" : "you work creatively",
      tech_expert_infer: locale === "pl" ? "jeste\u015B tech expertem" : "you're a tech expert",
      tech_beginner_infer: locale === "pl" ? "nie jeste\u015B techniczny" : "you're non-technical",
      frustration_verbosity_infer: locale === "pl" ? "cenisz zwi\u0119z\u0142o\u015B\u0107" : "you want brevity",
      frustration_generic_infer: locale === "pl" ? "nienawidzisz generyczno\u015Bci" : "you hate generic output",
      frustration_context_loss_infer: locale === "pl" ? "nienawidzisz tracenia kontekstu" : "you hate context loss",
      blunt_directness_infer: locale === "pl" ? "preferujesz bezpo\u015Brednio\u015B\u0107" : "you prefer bluntness",
      verbosity_minimal_infer: locale === "pl" ? "cenisz ultra-zwi\u0119z\u0142o\u015B\u0107" : "you want ultra-brevity",
      verbosity_concise_infer: locale === "pl" ? "cenisz zwi\u0119z\u0142o\u015B\u0107" : "you want conciseness",
      learning_experiential_infer: locale === "pl" ? "uczysz si\u0119 przez dzia\u0142anie" : "you learn by doing",
      use_case_dev_tools_infer: locale === "pl" ? "u\u017Cywasz AI do kodowania" : "you use AI for coding",
      use_case_coding_infer: locale === "pl" ? "u\u017Cywasz AI do kodowania" : "you use AI for coding",
    };

    const dimLabels: Record<string, string> = {
      "work.decision_style": locale === "pl" ? "styl decyzyjny" : "decision style",
      "work.context_switching": "context switching",
      "communication.code_preference": locale === "pl" ? "preferencja kodu" : "code preference",
      "communication.jargon_level": locale === "pl" ? "\u017Cargon" : "jargon level",
      "communication.explanation_depth": locale === "pl" ? "g\u0142\u0119boko\u015B\u0107 wyja\u015Bnie\u0144" : "explanation depth",
      "communication.preamble": locale === "pl" ? "bez wst\u0119p\u00F3w" : "no preamble",
      "communication.answer_first": locale === "pl" ? "odpowied\u017A na start" : "answer first",
      "communication.response_length": locale === "pl" ? "kr\u00F3tkie odpowiedzi" : "short responses",
      "communication.personalization": locale === "pl" ? "personalizacja" : "personalization",
      "communication.hedge_words": locale === "pl" ? "bez waha\u0144" : "no hedging",
      "communication.pleasantries": locale === "pl" ? "bez uprzejmo\u015Bci" : "skip pleasantries",
      "work.automation_preference": locale === "pl" ? "automatyzacja" : "automation",
      "communication.summary_preference": locale === "pl" ? "streszczenia" : "executive summary",
      "communication.continuity": locale === "pl" ? "ci\u0105g\u0142o\u015B\u0107 rozmowy" : "conversation continuity",
      "work.learning_style": locale === "pl" ? "styl nauki" : "learning style",
      "communication.list_format": locale === "pl" ? "format listy" : "list format",
      "communication.filler_tolerance": locale === "pl" ? "bez zb\u0119dnych fraz" : "no filler phrases",
    };

    for (const [dim, val] of Object.entries(profile.inferred)) {
      const signalId = val.signal_id ?? "unknown";
      const label = signalLabels[signalId];
      if (!label) continue;
      if (!groups.has(signalId)) groups.set(signalId, { reason: label, dims: [] });
      groups.get(signalId)!.dims.push(dimLabels[dim] ?? dim.split(".").pop()?.replace(/_/g, " ") ?? dim);
    }

    return [...groups.entries()]
      .filter(([, g]) => g.dims.length > 0)
      .slice(0, 4)
      .map(([, g]) => g);
  });

  let catStats = $derived(profile ? getCategoryCompleteness(profile) : []);
  let filledCats = $derived(catStats.filter(c => c.filled > 0));
  let suggestions = $derived(profile ? getSuggestions(profile) : []);

  // Highlights with icon names instead of emoji
  const HIGHLIGHT_MAP: { key: string; icon: string; labelPl: string; labelEn: string }[] = [
    { key: "identity.preferred_name", icon: "user", labelPl: "Imi\u0119", labelEn: "Name" },
    { key: "work.energy_archetype", icon: "zap", labelPl: "Energia", labelEn: "Energy" },
    { key: "communication.directness", icon: "message", labelPl: "Komunikacja", labelEn: "Communication" },
    { key: "cognitive.learning_style", icon: "brain", labelPl: "Nauka", labelEn: "Learning" },
    { key: "personality.core_motivation", icon: "target", labelPl: "Motywacja", labelEn: "Motivation" },
    { key: "work.peak_hours", icon: "clock", labelPl: "Szczyt produktywno\u015Bci", labelEn: "Peak hours" },
    { key: "personality.stress_response", icon: "activity", labelPl: "Reakcja na stres", labelEn: "Stress response" },
    { key: "identity.professional_role", icon: "layers", labelPl: "Rola", labelEn: "Role" },
  ];

  let highlights = $derived.by(() => {
    if (!profile) return [];
    const e = profile.explicit;
    const result: { icon: string; label: string; value: string }[] = [];
    for (const h of HIGHLIGHT_MAP) {
      if (e[h.key]) {
        const val = String(e[h.key].value).replace(/_/g, " ");
        result.push({
          icon: h.icon,
          label: locale === "pl" ? h.labelPl : h.labelEn,
          value: val.charAt(0).toUpperCase() + val.slice(1),
        });
      }
    }
    return result.slice(0, 6);
  });

  let stage = $state(0);

  // Returning user fast track
  const isReturning = typeof window !== 'undefined' && localStorage.getItem("meport:revealed") === "1";
  let skipHintVisible = $state(false);

  $effect(() => {
    const delays = isReturning
      ? [100, 200, 300, 400, 500, 600]
      : [300, 900, 1500, 2200, 3000, 3600];
    const timers = [
      setTimeout(() => { stage = 1; }, delays[0]),
      setTimeout(() => { stage = 2; }, delays[1]),
      setTimeout(() => { stage = 3; }, delays[2]),
      setTimeout(() => { stage = 4; }, delays[3]),
      setTimeout(() => { stage = 5; }, delays[4]),
      setTimeout(() => { stage = 6; }, delays[5]),
    ];
    return () => timers.forEach(clearTimeout);
  });

  // Show "tap to show all" hint after 1.5s if still animating
  $effect(() => {
    if (stage < 6 && !isReturning) {
      const hintTimer = setTimeout(() => { skipHintVisible = true; }, 1500);
      return () => clearTimeout(hintTimer);
    }
  });

  // Mark as revealed once all stages shown
  $effect(() => {
    if (stage === 6) {
      skipHintVisible = false;
      localStorage.setItem("meport:revealed", "1");
    }
  });

  function skipToEnd() {
    stage = 6;
  }

  // ─── Inline correction ──────────────────────────────────────
  let correcting = $state(false);
  let correctionText = $state("");
  let correctionApplied = $state(false);

  function applyCorrection() {
    if (!profile || !correctionText.trim()) return;
    const updated = {
      ...profile,
      explicit: {
        ...profile.explicit,
        "meta.custom_correction": {
          value: correctionText.trim(),
          confidence: 1,
          source: "explicit" as const,
        },
      },
    };
    setProfile(updated);
    correctionApplied = true;
    correcting = false;
    correctionText = "";
  }

  let displayedDims = $state(0);
  $effect(() => {
    if (stage >= 3 && totalDims > 0) {
      let current = 0;
      const step = Math.max(1, Math.floor(totalDims / 30));
      const interval = setInterval(() => {
        current += step;
        if (current >= totalDims) {
          current = totalDims;
          clearInterval(interval);
        }
        displayedDims = current;
      }, 40);
      return () => clearInterval(interval);
    }
  });
</script>

<div class="screen" onclick={skipToEnd} onkeydown={skipToEnd} role="presentation">
  <div class="ambient-1" class:active={stage >= 1}></div>
  <div class="ambient-2" class:active={stage >= 1}></div>
  <div class="ambient-3" class:active={stage >= 3}></div>

  <div class="content">
    <!-- Logo -->
    <div class="logo-area" class:visible={stage >= 1}>
      <div class="logo-wrap">
        <BreathingLogo />
      </div>
    </div>

    <!-- Archetype -->
    <div class="archetype" class:visible={stage >= 2}>
      <span class="arch-prefix">{t("reveal.archetype_prefix")}</span>
      <h1 class="arch-name">{archetype.name}</h1>
      {#if synthesis?.archetype}
        <span class="synthesis-badge">{synthesis.archetype}</span>
      {/if}
    </div>

    {#if synthesis?.archetypeDescription}
      <div class="archetype-desc" class:visible={stage >= 2}>
        <p class="archetype-desc-text">{synthesis.archetypeDescription}</p>
      </div>
    {/if}

    {#if synthesis?.narrative}
      <div class="narrative-block" class:visible={stage >= 2}>
        <p class="narrative-text">{synthesis.narrative}</p>
      </div>
    {/if}

    <!-- Synthesis loading state -->
    {#if isSynthesizing && !synthesis}
      <div class="synthesis-loading" class:visible={stage >= 2}>
        <div class="synthesis-loading-dot"></div>
        <div class="synthesis-loading-text">
          <span class="synthesis-loading-primary">{t("reveal.synthesis_loading")}</span>
          <span class="synthesis-loading-sub">{t("reveal.synthesis_loading_sub")}</span>
        </div>
      </div>
    {/if}

    <!-- Export Rules -->
    {#if synthesis?.exportRules && synthesis.exportRules.length > 0}
      <div class="rules-section" class:visible={stage >= 2}>
        <SectionLabel color="accent">{t("reveal.export_rules")}</SectionLabel>
        <p class="rules-intro">{t("reveal.export_rules_desc")}</p>
        <div class="rules-list">
          {#each synthesis.exportRules as rule, i}
            <div class="rule-card" style="--delay: {i * 50}ms" class:show={stage >= 2}>
              <span class="rule-num">{i + 1}</span>
              <span class="rule-text-content">{rule}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Stats -->
    <div class="meta" class:visible={stage >= 3}>
      <p class="arch-desc">{archetype.description}</p>
      <div class="stats-row">
        <div class="stat-big">
          <span class="stat-big-num">{displayedDims}</span>
          <span class="stat-big-lbl">{t("home.dimensions")}</span>
        </div>
        <div class="stat-sep"></div>
        <div class="stat-big">
          <span class="stat-big-num">{completeness}%</span>
          <span class="stat-big-lbl">{t("home.complete")}</span>
        </div>
        <div class="stat-sep"></div>
        <div class="stat-big">
          <span class="stat-big-num">14</span>
          <span class="stat-big-lbl">{t("reveal.platforms")}</span>
        </div>
      </div>
    </div>

    <!-- Highlights -->
    <div class="highlights" class:visible={stage >= 4}>
      {#each highlights as item, i}
        <div class="hl-item" style="--delay: {i * 100}ms" class:show={stage >= 4}>
          <span class="hl-icon"><Icon name={item.icon} size={16} /></span>
          <div class="hl-text">
            <span class="hl-label">{item.label}</span>
            <span class="hl-value">{item.value}</span>
          </div>
        </div>
      {/each}
    </div>

    <!-- Category bars -->
    <div class="cat-breakdown" class:visible={stage >= 5}>
      {#each filledCats as cat, i}
        <div class="cat-row" style="--delay: {i * 60}ms" class:show={stage >= 5}>
          <Icon name="layers" size={12} />
          <span class="cat-name">{t(cat.label)}</span>
          <div class="cat-bar">
            <div
              class="cat-fill"
              style="width: {cat.percent}%; background: {categories.find(c => c.id === cat.id)?.color || '#29ef82'}"
            ></div>
          </div>
          <span class="cat-count">{cat.filled}</span>
        </div>
      {/each}
    </div>

    <!-- Inference narrative -->
    {#if inferredCount > 0 && stage >= 5}
      <div class="inference-narrative" class:show={stage >= 5}>
        <p class="inference-header">
          {locale === "pl"
            ? `Poda\u0142e\u015B ${dimensionCount} rzeczy. Wydedukow. ${inferredCount + compoundCount} wi\u0119cej.`
            : `You told us ${dimensionCount} things. We figured out ${inferredCount + compoundCount} more.`}
        </p>
        {#each inferenceNarrative as group, i}
          <div class="inference-group" style="--delay: {i * 80}ms" class:show={stage >= 5}>
            <Icon name="arrow-right" size={12} />
            <span class="inference-reason">{locale === "pl" ? "Bo" : "Because"} {group.reason}</span>
            <span class="inference-dims">{group.dims.join(", ")}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Cognitive Profile -->
    {#if synthesis?.cognitiveProfile}
      <div class="rich-section" class:visible={stage >= 5}>
        <SectionLabel>{t("reveal.cognitive")}</SectionLabel>
        <div class="profile-grid">
          {#if synthesis.cognitiveProfile.thinkingStyle}
            <div class="profile-cell">
              <span class="cell-label">{t("reveal.thinking")}</span>
              <span class="cell-value">{synthesis.cognitiveProfile.thinkingStyle}</span>
            </div>
          {/if}
          {#if synthesis.cognitiveProfile.learningMode}
            <div class="profile-cell">
              <span class="cell-label">{t("reveal.learning")}</span>
              <span class="cell-value">{synthesis.cognitiveProfile.learningMode}</span>
            </div>
          {/if}
          {#if synthesis.cognitiveProfile.decisionPattern}
            <div class="profile-cell">
              <span class="cell-label">{t("reveal.decisions")}</span>
              <span class="cell-value">{synthesis.cognitiveProfile.decisionPattern}</span>
            </div>
          {/if}
          {#if synthesis.cognitiveProfile.attentionType}
            <div class="profile-cell">
              <span class="cell-label">{t("reveal.attention")}</span>
              <span class="cell-value">{synthesis.cognitiveProfile.attentionType}</span>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Communication DNA -->
    {#if synthesis?.communicationDNA}
      <div class="rich-section" class:visible={stage >= 5}>
        <SectionLabel>{t("reveal.communication")}</SectionLabel>
        <div class="dna-traits">
          {#if synthesis.communicationDNA.tone}
            <div class="profile-cell">
              <span class="cell-label">{t("reveal.tone")}</span>
              <span class="cell-value">{synthesis.communicationDNA.tone}</span>
            </div>
          {/if}
          {#if synthesis.communicationDNA.directness}
            <div class="profile-cell">
              <span class="cell-label">{t("reveal.directness")}</span>
              <span class="cell-value">{synthesis.communicationDNA.directness}</span>
            </div>
          {/if}
        </div>
        {#if synthesis.communicationDNA.adaptations.length > 0}
          <div class="adaptations">
            {#each synthesis.communicationDNA.adaptations.slice(0, 5) as rule, i}
              <div class="adaptation-rule" style="--delay: {i * 60}ms" class:show={stage >= 5}>
                <Icon name="arrow-right" size={12} />
                <span class="rule-text">{rule}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Contradictions -->
    {#if synthesis?.contradictions && synthesis.contradictions.length > 0}
      <div class="rich-section" class:visible={stage >= 5}>
        <SectionLabel color="warning">{t("reveal.contradictions")}</SectionLabel>
        {#each synthesis.contradictions as c, i}
          <div class="contradiction-card" style="--delay: {i * 80}ms" class:show={stage >= 5}>
            <span class="contradiction-area">{c.area}</span>
            <p class="contradiction-obs">{c.observation}</p>
            <p class="contradiction-res">{c.resolution}</p>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Predictions -->
    {#if synthesis?.predictions && synthesis.predictions.length > 0}
      <div class="rich-section" class:visible={stage >= 5}>
        <SectionLabel color="purple">{t("reveal.predictions")}</SectionLabel>
        {#each synthesis.predictions as p, i}
          <div class="prediction-card" style="--delay: {i * 60}ms" class:show={stage >= 5}>
            <span class="prediction-context">{p.context}</span>
            <span class="prediction-text">{p.prediction}</span>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Strengths & Blind Spots -->
    {#if synthesis?.strengths && synthesis.strengths.length > 0}
      <div class="rich-section" class:visible={stage >= 5}>
        <div class="dual-cols">
          <div class="col">
            <SectionLabel color="accent">{t("reveal.strengths")}</SectionLabel>
            {#each synthesis.strengths as s}
              <div class="trait-item green"><Icon name="star" size={12} /> {s}</div>
            {/each}
          </div>
          {#if synthesis.blindSpots && synthesis.blindSpots.length > 0}
            <div class="col">
              <SectionLabel color="warning">{t("reveal.blind_spots")}</SectionLabel>
              {#each synthesis.blindSpots as b}
                <div class="trait-item amber"><Icon name="diamond" size={12} /> {b}</div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Emergent -->
    {#if (profile?.emergent?.length ?? 0) > 0}
      <div class="emergent-section" class:visible={stage >= 5}>
        <SectionLabel>{t("reveal.patterns")}</SectionLabel>
        {#each profile!.emergent as obs, i}
          <div class="emergent-card" style="--delay: {i * 80}ms" class:show={stage >= 5}>
            <span class="emergent-title">{obs.title}</span>
            <p class="emergent-text">{obs.observation}</p>
          </div>
        {/each}
      </div>
    {/if}

    <!-- CTA -->
    <div class="cta-area" class:visible={stage >= 6}>
      <Button variant="primary" size="lg" onclick={() => goTo("export")}>
        <Icon name="download" size={18} />
        {t("reveal.export_btn")}
      </Button>
      <p class="cta-sub">{t("reveal.export_sub")}</p>

      <Button variant="secondary" size="md" onclick={() => goTo("profile")}>
        <Icon name="user" size={16} />
        {t("reveal.view_profile")}
      </Button>

      {#if suggestions.length > 0}
        <p class="suggestions-hint">
          {locale === "pl" ? `Mo\u017Cesz jeszcze doda\u0107 ${suggestions.reduce((a, s) => a + s.missingCount, 0)} wymiar\u00F3w` : `You can still add ${suggestions.reduce((a, s) => a + s.missingCount, 0)} dimensions`}
        </p>
      {/if}

      <!-- Inline correction -->
      <div class="correction-area">
        {#if correctionApplied}
          <p class="correction-saved">{t("reveal.correction_saved")}</p>
        {:else if !correcting}
          <button class="correction-btn" onclick={() => { correcting = true; }}>
            {t("reveal.something_wrong")}
          </button>
        {:else}
          <div class="correction-form" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="presentation">
            <textarea
              class="correction-textarea"
              bind:value={correctionText}
              placeholder={t("summary.correction_placeholder")}
              rows={3}
            ></textarea>
            <div class="correction-actions">
              <button class="correction-cancel" onclick={() => { correcting = false; correctionText = ""; }}>
                {t("rapid.cancel")}
              </button>
              <button class="correction-apply" onclick={applyCorrection} disabled={!correctionText.trim()}>
                {t("summary.send_correction")}
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>

    {#if skipHintVisible && stage < 6}
      <p class="skip-hint">{t("reveal.tap_to_show")}</p>
    {/if}
  </div>
</div>

<style>
  .screen {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }

  .ambient-1 {
    position: absolute;
    top: -20%;
    left: 50%;
    transform: translateX(-50%);
    width: 140%;
    height: 60%;
    background: radial-gradient(ellipse at center, oklch(from #29ef82 l c h / 0.06) 0%, oklch(from #1ec9c9 l c h / 0.03) 40%, transparent 70%);
    pointer-events: none;
    opacity: 0;
    transition: opacity 1.5s ease;
  }
  .ambient-1.active { opacity: 1; animation: breathing 6s ease-in-out infinite; }

  .ambient-2 {
    position: absolute;
    bottom: -30%;
    right: 20%;
    width: 60%;
    height: 50%;
    background: radial-gradient(ellipse at center, oklch(from #a78bfa l c h / 0.04) 0%, transparent 60%);
    pointer-events: none;
    opacity: 0;
    transition: opacity 2s ease 0.5s;
  }
  .ambient-2.active { opacity: 1; animation: breathing 8s ease-in-out infinite reverse; }

  .ambient-3 {
    position: absolute;
    top: 40%;
    left: -10%;
    width: 40%;
    height: 40%;
    background: radial-gradient(ellipse at center, oklch(from #f59e0b l c h / 0.03) 0%, transparent 60%);
    pointer-events: none;
    opacity: 0;
    transition: opacity 1.5s ease;
  }
  .ambient-3.active { opacity: 1; animation: breathing 10s ease-in-out infinite; }

  .content {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    padding: var(--sp-6) var(--sp-8);
    max-width: var(--content-width);
    width: 100%;
    overflow-y: auto;
    max-height: 100%;
  }

  /* ─── Logo ─── */
  .logo-area {
    opacity: 0;
    transform: scale(0.5);
    transition: all 1s var(--ease-out-expo);
    margin-bottom: var(--sp-3);
  }
  .logo-area.visible { opacity: 1; transform: scale(1); }

  .logo-wrap {
    transform: scale(0.5);
    transform-origin: center;
    width: 50px;
    height: 50px;
  }

  /* ─── Archetype ─── */
  .archetype {
    text-align: center;
    opacity: 0;
    transform: translateY(20px);
    transition: all 0.8s var(--ease-out-expo);
    margin-bottom: var(--sp-2);
  }
  .archetype.visible { opacity: 1; transform: translateY(0); }

  .arch-prefix {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    display: block;
    margin-bottom: var(--sp-1);
  }

  .arch-name {
    font-size: var(--text-2xl);
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.04em;
    background: linear-gradient(135deg, #29ef82 0%, #1ec9c9 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .synthesis-badge {
    display: inline-block;
    margin-top: var(--sp-2);
    padding: 4px 12px;
    border-radius: var(--radius-lg);
    background: var(--color-accent-bg);
    border: 1px solid oklch(from #29ef82 l c h / 0.20);
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-accent);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .archetype-desc {
    max-width: 360px;
    text-align: center;
    margin-bottom: var(--sp-2);
    opacity: 0;
    transform: translateY(8px);
    transition: all 0.6s var(--ease-out-expo);
  }
  .archetype-desc.visible { opacity: 1; transform: translateY(0); }

  .archetype-desc-text {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    line-height: 1.55;
    margin: 0;
  }

  /* ─── Narrative ─── */
  .narrative-block {
    width: 100%;
    max-width: 400px;
    margin-bottom: var(--sp-4);
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--radius-md);
    background: oklch(from #29ef82 l c h / 0.04);
    border: 1px solid oklch(from #29ef82 l c h / 0.10);
    opacity: 0;
    transform: translateY(10px);
    transition: all 0.6s var(--ease-out-expo);
  }
  .narrative-block.visible { opacity: 1; transform: translateY(0); }

  .narrative-text {
    font-size: var(--text-sm);
    line-height: 1.6;
    color: var(--color-text-secondary);
    margin: 0;
    font-style: italic;
  }

  /* ─── Rules ─── */
  .rules-section {
    width: 100%;
    margin-bottom: var(--sp-4);
    opacity: 0;
    transition: opacity 0.4s ease;
  }
  .rules-section.visible { opacity: 1; }

  .rules-intro {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: var(--sp-1) 0 var(--sp-2) 0;
    line-height: 1.4;
  }

  .rules-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .rule-card {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: oklch(from #29ef82 l c h / 0.03);
    border: 1px solid oklch(from #29ef82 l c h / 0.08);
    opacity: 0;
    transform: translateY(4px);
    transition: all 0.4s var(--ease-out-expo);
    transition-delay: var(--delay, 0ms);
  }
  .rule-card.show { opacity: 1; transform: translateY(0); }

  .rule-num {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-accent);
    font-weight: 600;
    flex-shrink: 0;
    min-width: 14px;
    text-align: right;
  }

  .rule-text-content {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.4;
  }

  /* ─── Meta / Stats ─── */
  .meta {
    text-align: center;
    opacity: 0;
    transform: translateY(12px);
    transition: all 0.6s var(--ease-out-expo);
    margin-bottom: var(--sp-4);
  }
  .meta.visible { opacity: 1; transform: translateY(0); }

  .arch-desc {
    font-size: var(--text-base);
    color: var(--color-text-secondary);
    margin: 0 0 var(--sp-4) 0;
    line-height: 1.5;
    max-width: 360px;
  }

  .stats-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-6);
  }

  .stat-big { display: flex; flex-direction: column; align-items: center; gap: 2px; }

  .stat-big-num {
    font-family: var(--font-mono);
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--color-accent);
    font-variant-numeric: tabular-nums;
  }

  .stat-big-lbl {
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
  }

  .stat-sep {
    width: 1px;
    height: 28px;
    background: var(--color-border);
  }

  /* ─── Highlights ─── */
  .highlights {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-bottom: var(--sp-4);
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  .highlights.visible { opacity: 1; }

  .hl-item {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    opacity: 0;
    transform: translateY(8px);
    transition: all 0.5s var(--ease-out-expo);
    transition-delay: var(--delay, 0ms);
  }
  .hl-item.show { opacity: 1; transform: translateY(0); }

  .hl-icon {
    color: var(--color-accent);
    flex-shrink: 0;
  }

  .hl-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .hl-label {
    font-size: var(--text-micro);
    color: var(--color-text-ghost);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .hl-value {
    font-size: var(--text-sm);
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ─── Category breakdown ─── */
  .cat-breakdown {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: var(--sp-3);
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  .cat-breakdown.visible { opacity: 1; }

  .cat-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--color-text-muted);
    opacity: 0;
    transform: translateX(-8px);
    transition: all 0.4s var(--ease-out-expo);
    transition-delay: var(--delay, 0ms);
  }
  .cat-row.show { opacity: 1; transform: translateX(0); }

  .cat-name {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    width: 80px;
    text-align: right;
    flex-shrink: 0;
  }

  .cat-bar {
    flex: 1;
    height: 3px;
    background: var(--color-border);
    border-radius: 2px;
    overflow: hidden;
  }

  .cat-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.8s var(--ease-out-expo);
  }

  .cat-count {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-ghost);
    width: 16px;
    text-align: right;
  }

  /* ─── Inference ─── */
  .inference-narrative {
    width: 100%;
    margin-bottom: var(--sp-3);
    opacity: 0;
    transition: opacity 0.5s ease;
  }
  .inference-narrative.show { opacity: 1; }

  .inference-header {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: oklch(from #29ef82 l c h / 0.55);
    margin: 0 0 var(--sp-2) 0;
    text-align: center;
  }

  .inference-group {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 2px 0;
    color: var(--color-accent);
    opacity: 0;
    transform: translateX(-6px);
    transition: all 0.4s var(--ease-out-expo);
    transition-delay: var(--delay, 0ms);
  }
  .inference-group.show { opacity: 1; transform: translateX(0); }

  .inference-reason {
    font-size: var(--text-micro);
    color: var(--color-text-secondary);
    font-weight: 500;
    white-space: nowrap;
  }

  .inference-dims {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ─── Rich sections ─── */
  .rich-section {
    width: 100%;
    margin-bottom: var(--sp-4);
    opacity: 0;
    transition: opacity 0.4s ease;
  }
  .rich-section.visible { opacity: 1; }

  .profile-grid, .dna-traits {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-top: var(--sp-2);
  }

  .profile-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
  }

  .cell-label {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-ghost);
  }

  .cell-value {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.4;
  }

  .adaptations {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: var(--sp-2);
  }

  .adaptation-rule {
    display: flex;
    align-items: baseline;
    gap: 6px;
    color: var(--color-accent);
    opacity: 0;
    transform: translateX(-4px);
    transition: all 0.4s var(--ease-out-expo);
    transition-delay: var(--delay, 0ms);
  }
  .adaptation-rule.show { opacity: 1; transform: translateX(0); }

  .rule-text {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    line-height: 1.4;
  }

  /* ─── Contradictions ─── */
  .contradiction-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-warning-bg);
    border: 1px solid var(--color-warning-border);
    margin-top: var(--sp-2);
    opacity: 0;
    transform: translateY(6px);
    transition: all 0.4s var(--ease-out-expo);
    transition-delay: var(--delay, 0ms);
  }
  .contradiction-card.show { opacity: 1; transform: translateY(0); }

  .contradiction-area {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: oklch(from #f59e0b l c h / 0.7);
  }

  .contradiction-obs {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.4;
  }

  .contradiction-res {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.35;
    font-style: italic;
  }

  /* ─── Predictions ─── */
  .prediction-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-purple-bg);
    border: 1px solid var(--color-purple-border);
    margin-top: var(--sp-2);
    opacity: 0;
    transform: translateY(4px);
    transition: all 0.4s var(--ease-out-expo);
    transition-delay: var(--delay, 0ms);
  }
  .prediction-card.show { opacity: 1; transform: translateY(0); }

  .prediction-context {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: oklch(from #a78bfa l c h / 0.6);
  }

  .prediction-text {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.4;
  }

  /* ─── Strengths / Blind spots ─── */
  .dual-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-3);
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .trait-item {
    font-size: var(--text-xs);
    line-height: 1.4;
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .trait-item.green { color: oklch(from #29ef82 l c h / 0.75); }
  .trait-item.amber { color: oklch(from #f59e0b l c h / 0.65); }

  /* ─── Emergent ─── */
  .emergent-section {
    width: 100%;
    margin-bottom: var(--sp-3);
    opacity: 0;
    transition: opacity 0.4s ease;
  }
  .emergent-section.visible { opacity: 1; }

  .emergent-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    margin-top: var(--sp-2);
    opacity: 0;
    transform: translateY(6px);
    transition: all 0.4s var(--ease-out-expo);
    transition-delay: var(--delay, 0ms);
  }
  .emergent-card.show { opacity: 1; transform: translateY(0); }

  .emergent-title {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text);
  }

  .emergent-text {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.45;
  }

  /* ─── Synthesis loading ─── */
  .synthesis-loading {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    width: 100%;
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--radius-md);
    background: oklch(from #29ef82 l c h / 0.04);
    border: 1px solid oklch(from #29ef82 l c h / 0.10);
    margin-bottom: var(--sp-4);
    opacity: 0;
    transition: opacity 0.4s ease;
  }
  .synthesis-loading.visible { opacity: 1; }

  .synthesis-loading-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-accent);
    flex-shrink: 0;
    animation: pulse-dot 1.4s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 0.4; transform: scale(0.85); }
    50% { opacity: 1; transform: scale(1.15); }
  }

  .synthesis-loading-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .synthesis-loading-primary {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .synthesis-loading-sub {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-muted);
  }

  /* ─── CTA ─── */
  .cta-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    margin-top: var(--sp-4);
    opacity: 0;
    transform: translateY(12px);
    transition: all 0.6s var(--ease-out-expo);
  }
  .cta-area.visible { opacity: 1; transform: translateY(0); }

  .cta-sub {
    font-size: var(--text-xs);
    color: var(--color-text-ghost);
    margin: 0;
  }

  .suggestions-hint {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-muted);
    margin: var(--sp-1) 0 0 0;
  }

  /* ─── Correction ─── */
  .correction-area {
    margin-top: var(--sp-3);
    width: 100%;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .correction-btn {
    background: none;
    border: none;
    font-size: var(--text-xs);
    color: var(--color-text-ghost);
    cursor: pointer;
    padding: var(--sp-1) var(--sp-2);
    font-family: var(--font-sans);
    transition: color 0.2s;
  }

  .correction-btn:hover {
    color: var(--color-text-muted);
  }

  .correction-form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .correction-textarea {
    width: 100%;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg-card);
    color: var(--color-text);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    line-height: 1.5;
    resize: none;
    box-sizing: border-box;
  }

  .correction-textarea:focus {
    outline: none;
    border-color: var(--color-accent);
  }

  .correction-actions {
    display: flex;
    gap: var(--sp-2);
    justify-content: flex-end;
  }

  .correction-cancel {
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--sp-1) var(--sp-3);
    color: var(--color-text-muted);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all 0.2s;
  }

  .correction-cancel:hover {
    border-color: var(--color-border-hover);
    color: var(--color-text-secondary);
  }

  .correction-apply {
    background: var(--color-accent-bg);
    border: 1px solid var(--color-accent-border);
    border-radius: var(--radius-sm);
    padding: var(--sp-1) var(--sp-3);
    color: var(--color-accent);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .correction-apply:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .correction-apply:not(:disabled):hover {
    background: oklch(from var(--color-accent) l c h / 0.15);
  }

  .correction-saved {
    font-size: var(--text-xs);
    color: var(--color-accent);
    font-family: var(--font-mono);
    margin: 0;
  }

  .skip-hint {
    font-family: var(--font-mono);
    font-size: var(--text-micro);
    color: var(--color-text-ghost);
    text-align: center;
    margin-top: var(--sp-3);
    animation: fade-in 0.5s ease both;
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
