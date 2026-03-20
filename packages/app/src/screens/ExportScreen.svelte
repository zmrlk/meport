<script lang="ts">
  import { getRuleCompiler, type PlatformId } from "@meport/core/compiler";
  import type { RefinementSession } from "@meport/core/types";
  import { getProfile, goTo, hasApiKey, getApiKey, getApiProvider, setProfile } from "../lib/stores/app.svelte.js";
  import { getPackExportRules } from "../lib/stores/profiling.svelte.js";
  import { platforms } from "../lib/platforms.js";
  import { AIEnricher, type RuleValidationResult } from "@meport/core/enricher";
  import { createAIClient } from "@meport/core/client";
  import { getLocale } from "../lib/i18n.svelte.js";
  import Icon from "../components/Icon.svelte";
  import Button from "../components/Button.svelte";
  import SectionLabel from "../components/SectionLabel.svelte";
  import { t } from "../lib/i18n.svelte.js";

  let profile = $derived(getProfile());
  let apiConfigured = $derived(hasApiKey());
  let locale = $derived(getLocale());

  // Tabs
  let activeTab = $state<"profile" | "platforms">("profile");

  // Platform state
  let selectedPlatform = $state("claude-code");
  let compiledContent = $state("");
  let compiledFilename = $state("");

  // Store AI-refined content per platform so it persists when switching
  let aiRefinedCache = $state<Map<string, string>>(new Map());
  let suppressRecompile = $state(false);

  // Compile ONLY on explicit platform switch — NOT on profile changes during AI work
  let lastCompiledPlatform = $state("");

  $effect(() => {
    if (!profile) return;
    if (suppressRecompile) return;

    // Only recompile when platform actually changes, or on first load
    const platform = selectedPlatform;

    // Check AI cache first
    const cached = aiRefinedCache.get(platform);
    if (cached) {
      compiledContent = cached;
      try {
        const compiler = getRuleCompiler(platform as PlatformId);
        const packRules = getPackExportRules();
        if (packRules.size > 0 && compiler.setPackExportRules) {
          compiler.setPackExportRules(packRules as Map<string, string[]>);
        }
        compiledFilename = compiler.compile(profile).filename;
      } catch {}
      lastCompiledPlatform = platform;
      return;
    }

    try {
      const compiler = getRuleCompiler(platform as PlatformId);
      const packRules = getPackExportRules();
      if (packRules.size > 0 && compiler.setPackExportRules) {
        compiler.setPackExportRules(packRules as Map<string, string[]>);
      }
      const result = compiler.compile(profile);
      compiledContent = result.content;
      compiledFilename = result.filename;
    } catch {
      compiledContent = "";
      compiledFilename = "";
    }
    lastCompiledPlatform = platform;
  });

  // Deploy/copy state
  let copiedPlatform = $state<string | null>(null);
  let jsonCopied = $state(false);
  let deployError = $state<string | null>(null);

  // AI refine chat
  let aiCompiling = $state(false);
  let aiChatOpen = $state(false);
  let aiChatInput = $state("");
  let aiChatHistory = $state<{ role: "user" | "ai"; text: string; changedLines?: string }[]>([]);
  let editMode = $state(false);
  let contentBeforeAI = $state("");
  let aiConversation = $state<{ role: string; content: string }[]>([]);

  // Load past refinement sessions for current platform
  let pastSessions = $derived(profile?.refinements?.filter(s => s.platform === selectedPlatform) ?? []);

  function openAIChat() {
    aiChatOpen = true;
    aiChatInput = "";
    aiChatHistory = [];
    contentBeforeAI = compiledContent;
    aiConversation = [];
  }

  /** Persist current AI chat as a refinement session in the profile JSON */
  function saveRefinementSession(dimensionsAdded: string[]) {
    if (!profile || aiChatHistory.length === 0) return;
    const session: RefinementSession = {
      id: `ref_${Date.now()}`,
      platform: selectedPlatform,
      created_at: new Date().toISOString(),
      messages: aiChatHistory.map(m => ({
        role: m.role,
        text: m.text,
        timestamp: new Date().toISOString(),
      })),
      dimensions_added: dimensionsAdded,
      content_before: contentBeforeAI,
      content_after: compiledContent,
    };
    const updated = { ...profile };
    updated.refinements = [...(updated.refinements ?? []), session];
    // Keep max 20 sessions (FIFO)
    if (updated.refinements.length > 20) {
      updated.refinements = updated.refinements.slice(-20);
    }
    suppressRecompile = true;
    setProfile(updated, { skipHistory: true });
    aiRefinedCache = new Map(aiRefinedCache);
    aiRefinedCache.set(selectedPlatform, compiledContent);
    // Allow recompile again after this tick
    queueMicrotask(() => { suppressRecompile = false; });
  }

  /** Restore a past session's AI-refined text */
  function restoreSession(session: RefinementSession) {
    compiledContent = session.content_after;
    aiRefinedCache = new Map(aiRefinedCache);
    aiRefinedCache.set(selectedPlatform, session.content_after);
    aiChatHistory = session.messages.map(m => ({ role: m.role, text: m.text }));
    aiChatOpen = true;
  }

  async function sendAIRefine() {
    if (!profile || !apiConfigured || aiCompiling || !aiChatInput.trim()) return;
    const userMsg = aiChatInput.trim();
    aiChatInput = "";
    aiChatHistory = [...aiChatHistory, { role: "user", text: userMsg }];
    aiCompiling = true;
    try {
      const apiKey = getApiKey();
      const provider = getApiProvider();
      const clientProvider = provider === "anthropic" ? "claude" : provider;
      const client = createAIClient({ provider: clientProvider as "claude" | "openai" | "ollama", apiKey });
      if (client.chat) {
        const systemPrompt = `You are refining AI custom instructions for ${selectedPlatform}. User locale: ${getLocale()}.

CRITICAL RULES:
1. PRESERVE ALL existing content word-for-word. Never delete or replace sections unless the user EXPLICITLY asks to remove something.
2. Only ADD new lines or MODIFY specific lines the user mentions.
3. If the user provides ANY personal information (location, family, age, hobbies, job, etc.), you MUST add it to the export text. Add it to the "About Me" or context section at the TOP of the text, where identity info belongs. Personal facts are HIGH PRIORITY — they change how AI responds.
4. Output the FULL updated text — every original line PLUS your additions.
5. No explanations, no markdown fences — output ONLY the updated instructions text.
6. New personal info goes NEAR THE TOP (identity/context section), not at the bottom where it gets ignored.

AFTER the full updated text, you MUST add these sections:

---CHANGES---
1-3 line summary of what you changed (in user's locale).

---PROFILE---
Extract ALL personal facts from the user's message as a JSON object. Map to these dimensions:
- Name → "identity.preferred_name"
- Age/generation → "identity.age_range" (e.g. "25_30", "60_65")
- Location/city → "context.location"
- Country → "context.country"
- Job/role → "context.occupation"
- Industry → "context.industry"
- Family (kids, grandkids, partner, pets) → "life.family_context"
- Health conditions → "life.health_context"
- Hobbies/interests → "lifestyle.hobbies"
- Diet → "lifestyle.dietary"
- Language → "identity.language"
- Financial situation → "life.financial_context"
- Life stage → "life.stage"
- Any other personal fact → use the closest dimension name

Example: user says "mam troje wnucząt i psa" → {"life.family_context": "3 grandchildren, 1 dog"}
Example: user says "mieszkam w Krakowie" → {"context.location": "Kraków"}

If no personal info in the message, output: {}
ALWAYS output ---PROFILE--- section, even if empty {}.`;

        // Build conversation with full context
        aiConversation = [
          ...aiConversation,
          { role: "user", content: aiConversation.length === 0
            ? `Current export:\n\n${compiledContent}\n\nUser request: ${userMsg}`
            : userMsg
          },
        ];

        const messages = [
          { role: "system" as const, content: systemPrompt },
          ...aiConversation.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        ];

        const result = await client.chat(messages, {});

        // Parse response: text before ---CHANGES---, changes summary, profile updates
        const changesIdx = result.indexOf("---CHANGES---");
        const profileIdx = result.indexOf("---PROFILE---");

        let updatedText = result;
        let changesSummary = "";
        let profileUpdates: Record<string, string> = {};

        if (changesIdx > -1) {
          updatedText = result.slice(0, changesIdx).trim();
          const afterChanges = result.slice(changesIdx + 13);
          if (profileIdx > -1) {
            changesSummary = afterChanges.slice(0, afterChanges.indexOf("---PROFILE---")).trim();
            const profileJson = afterChanges.slice(afterChanges.indexOf("---PROFILE---") + 13).trim();
            try { profileUpdates = JSON.parse(profileJson); } catch {}
          } else {
            changesSummary = afterChanges.trim();
          }
        }

        // Clean code fences
        updatedText = updatedText.replace(/^```(?:\w+)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();

        if (updatedText) {
          compiledContent = updatedText;
          // Cache AI-refined text for this platform
          aiRefinedCache = new Map(aiRefinedCache);
          aiRefinedCache.set(selectedPlatform, updatedText);
          aiConversation = [...aiConversation, { role: "assistant", content: result }];

          const aiMsg = changesSummary || (locale === "pl" ? "Zaktualizowano." : "Updated.");
          aiChatHistory = [...aiChatHistory, { role: "ai", text: aiMsg }];

          // Auto-update profile with new dimensions
          const validUpdates = Object.entries(profileUpdates).filter(([_, val]) => typeof val === "string" && val.length > 0);
          if (validUpdates.length > 0 && profile) {
            const updated = {
              ...profile,
              explicit: { ...profile.explicit },
              inferred: { ...(profile.inferred ?? {}) },
            };
            const newDims: string[] = [];
            for (const [dim, val] of validUpdates) {
              const existing = updated.explicit[dim];
              if (existing) {
                // Merge: append if different
                const existingVal = String(existing.value);
                if (!existingVal.includes(val as string)) {
                  updated.explicit[dim] = { ...existing, value: `${existingVal}, ${val}` };
                  newDims.push(dim.split(".").pop()?.replace(/_/g, " ") ?? dim);
                }
              } else {
                updated.explicit[dim] = {
                  dimension: dim,
                  value: val as string,
                  confidence: 0.9,
                  source: "explicit" as const,
                  question_id: "ai_refine",
                };
                newDims.push(dim.split(".").pop()?.replace(/_/g, " ") ?? dim);
              }
            }
            if (newDims.length > 0) {
              suppressRecompile = true;
              setProfile(updated);
              aiRefinedCache = new Map(aiRefinedCache);
              aiRefinedCache.set(selectedPlatform, compiledContent);
              queueMicrotask(() => { suppressRecompile = false; });

              aiChatHistory = [...aiChatHistory, {
                role: "ai",
                text: locale === "pl"
                  ? `Profil: +${newDims.join(", ")}`
                  : `Profile: +${newDims.join(", ")}`,
              }];
            }
          }
        }
        // Save session to profile JSON after each AI interaction
        saveRefinementSession(validUpdates.map(([dim]) => dim));
      }
    } catch (e) {
      aiChatHistory = [...aiChatHistory, { role: "ai", text: e instanceof Error ? e.message : "Error" }];
    }
    finally { aiCompiling = false; }
  }

  function resetToCompiled() {
    if (!profile) return;
    try {
      const compiler = getRuleCompiler(selectedPlatform as PlatformId);
      const packRules = getPackExportRules();
      if (packRules.size > 0 && compiler.setPackExportRules) {
        compiler.setPackExportRules(packRules as Map<string, string[]>);
      }
      const result = compiler.compile(profile);
      compiledContent = result.content;
    } catch {}
    editMode = false;
    aiChatOpen = false;
    aiChatHistory = [];
    aiConversation = [];
    aiRefinedCache = new Map();
  }

  // Rule validation
  let ruleValidation = $state<RuleValidationResult | null>(null);
  let ruleValidating = $state(false);

  async function validateRules() {
    if (!profile || !apiConfigured || ruleValidating) return;
    const rules = profile.synthesis?.exportRules ?? [];
    if (rules.length === 0) return;
    ruleValidating = true;
    ruleValidation = null;
    try {
      const apiKey = getApiKey();
      const provider = getApiProvider();
      const clientProvider = provider === "anthropic" ? "claude" : provider;
      const client = createAIClient({ provider: clientProvider as "claude" | "openai" | "ollama", apiKey });
      const enricher = new AIEnricher(client, getLocale());
      ruleValidation = await enricher.validateExportRules(rules);
    } catch { ruleValidation = null; }
    finally { ruleValidating = false; }
  }

  // ─── Actions ──────────────────────────────────────
  async function copyJsonToClipboard() {
    if (!profile) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(profile, null, 2));
      jsonCopied = true;
      setTimeout(() => { jsonCopied = false; }, 2000);
    } catch {}
  }

  function downloadJson() {
    if (!profile) return;
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "meport-profile.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyPlatformContent() {
    if (!compiledContent) return;
    try {
      await navigator.clipboard.writeText(compiledContent);
      copiedPlatform = selectedPlatform;
      setTimeout(() => { copiedPlatform = null; }, 2000);
    } catch {}
  }

  function downloadPlatformFile() {
    if (!compiledContent) return;
    const blob = new Blob([compiledContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = compiledFilename || "meport-rules.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadAll() {
    if (!profile) return;
    const packRules = getPackExportRules();
    for (const p of platforms) {
      try {
        const compiler = getRuleCompiler(p.id as PlatformId);
        if (packRules.size > 0 && compiler.setPackExportRules) {
          compiler.setPackExportRules(packRules as Map<string, string[]>);
        }
        const result = compiler.compile(profile);
        const blob = new Blob([result.content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
        await new Promise(r => setTimeout(r, 200));
      } catch {}
    }
  }

  // Platform metadata
  const platformMeta: Record<string, { label: string; type: "file" | "clipboard"; hint: string; url?: string }> = {
    "claude-code": { label: "Claude Code", type: "file", hint: "CLAUDE.md" },
    "cursor": { label: "Cursor", type: "file", hint: ".cursor/rules/meport.mdc" },
    "copilot": { label: "GitHub Copilot", type: "file", hint: ".github/copilot-instructions.md" },
    "windsurf": { label: "Windsurf", type: "file", hint: ".windsurfrules" },
    "agents-md": { label: "AGENTS.md", type: "file", hint: "AGENTS.md" },
    "ollama": { label: "Ollama", type: "file", hint: "Modelfile" },
    "generic": { label: "Generic", type: "file", hint: "meport-rules.md" },
    "chatgpt": { label: "ChatGPT", type: "clipboard", hint: "Settings → Personalization", url: "https://chatgpt.com/?temporary-chat=true#settings/Personalization" },
    "claude": { label: "Claude", type: "clipboard", hint: "Settings → Profile → Instructions", url: "https://claude.ai/settings/profile" },
    "gemini": { label: "Gemini", type: "clipboard", hint: "Gems → Create → Instructions", url: "https://gemini.google.com/app/settings" },
    "grok": { label: "Grok", type: "clipboard", hint: "Settings → Custom Instructions", url: "https://x.com/i/grok" },
    "perplexity": { label: "Perplexity", type: "clipboard", hint: "Settings → AI Profile", url: "https://www.perplexity.ai/settings/account" },
  };

  let allPlatformIds = $derived(platforms.map(p => p.id));
  let currentMeta = $derived(platformMeta[selectedPlatform]);
</script>

<div class="page">
  {#if profile}
    <div class="page-content">
      <div class="page-header animate-fade-up" style="--delay: 0ms">
        <h1 class="page-title">{t("export.profile_ready")}</h1>

        <div class="tab-bar">
          <button class="tab-bar-item" class:active={activeTab === "profile"} onclick={() => activeTab = "profile"}>
            {locale === "pl" ? "Twój profil" : "Your profile"}
          </button>
          <button class="tab-bar-item" class:active={activeTab === "platforms"} onclick={() => activeTab = "platforms"}>
            {locale === "pl" ? "Platformy" : "Platforms"}
          </button>
        </div>
      </div>

      <!-- ═══════ TAB: YOUR PROFILE (JSON) ═══════ -->
      {#if activeTab === "profile"}
        <div class="tab-content animate-fade-up">
          <div class="json-section">
            <SectionLabel>{t("export.json_title")}</SectionLabel>
            <pre class="code-preview">{JSON.stringify(profile, null, 2)}</pre>
            <div class="action-row">
              <button class="action-btn" class:copied={jsonCopied} onclick={copyJsonToClipboard}>
                <Icon name={jsonCopied ? "check" : "copy"} size={14} />
                {jsonCopied ? t("export.copied") : t("export.json_copy")}
              </button>
              <button class="action-btn" onclick={downloadJson}>
                <Icon name="download" size={14} />
                {t("export.json_download")}
              </button>
            </div>
          </div>

          <!-- Rule Validation -->
          {#if apiConfigured && profile?.synthesis?.exportRules?.length}
            <div class="validation-section">
              {#if !ruleValidation && !ruleValidating}
                <button class="action-btn" onclick={validateRules}>
                  <Icon name="check" size={14} />
                  {t("export.validate_rules")}
                </button>
              {:else if ruleValidating}
                <div class="loading-row">
                  <span class="spinner"></span>
                  <span>{t("export.validating")}</span>
                </div>
              {:else if ruleValidation}
                <div class="validation-results">
                  <div class="pill-row">
                    <span class="pill high">{ruleValidation.qualityBreakdown.high} high</span>
                    <span class="pill medium">{ruleValidation.qualityBreakdown.medium} medium</span>
                    {#if ruleValidation.qualityBreakdown.low > 0}
                      <span class="pill low">{ruleValidation.qualityBreakdown.low} weak</span>
                    {/if}
                  </div>
                  {#if ruleValidation.weakRules.length > 0}
                    <SectionLabel>{t("export.rules_to_improve")}</SectionLabel>
                    {#each ruleValidation.weakRules as weak}
                      <div class="weak-rule">
                        <p class="weak-original">{weak.rule}</p>
                        <p class="weak-problem">{weak.problem}</p>
                        <p class="weak-fix">{weak.improvement}</p>
                      </div>
                    {/each}
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </div>

      <!-- ═══════ TAB: PLATFORMS ═══════ -->
      {:else if activeTab === "platforms"}
        <div class="tab-content animate-fade-up">
          <!-- Platform chips -->
          <div class="chip-grid">
            {#each allPlatformIds as pid}
              {@const meta = platformMeta[pid]}
              {#if meta}
                <button
                  class="chip"
                  class:active={selectedPlatform === pid}
                  onclick={() => { selectedPlatform = pid; }}
                >
                  {meta.label}
                </button>
              {/if}
            {/each}
          </div>

          <!-- Preview + actions -->
          {#if compiledContent}
            <div class="preview-section">
              <div class="preview-header">
                <span class="preview-filename">{compiledFilename}</span>
                <div class="preview-meta">
                  <span class="preview-size">{compiledContent.length} chars</span>
                  <button class="edit-toggle" onclick={() => { editMode = !editMode; }}>
                    <Icon name={editMode ? "check" : "edit"} size={12} />
                    {editMode ? (locale === "pl" ? "Gotowe" : "Done") : (locale === "pl" ? "Edytuj" : "Edit")}
                  </button>
                  {#if editMode || aiChatHistory.length > 0}
                    <button class="edit-toggle" onclick={resetToCompiled}>
                      <Icon name="rotate" size={12} />
                      Reset
                    </button>
                  {/if}
                </div>
              </div>

              {#if editMode}
                <textarea class="code-edit" bind:value={compiledContent} rows={16}></textarea>
              {:else}
                <pre class="code-preview">{compiledContent}</pre>
              {/if}

              <div class="action-row uniform">
                <button
                  class="action-btn"
                  class:copied={copiedPlatform === selectedPlatform}
                  onclick={copyPlatformContent}
                >
                  <Icon name={copiedPlatform === selectedPlatform ? "check" : "copy"} size={14} />
                  {copiedPlatform === selectedPlatform ? t("export.copied") : t("export.copy_action")}
                </button>

                {#if currentMeta?.type === "file"}
                  <button class="action-btn" onclick={downloadPlatformFile}>
                    <Icon name="download" size={14} />
                    {locale === "pl" ? "Pobierz" : "Download"}
                  </button>
                {:else if currentMeta?.url}
                  <a href={currentMeta.url} target="_blank" rel="noopener" class="action-btn">
                    <Icon name="external" size={14} />
                    {locale === "pl" ? "Otwórz" : "Open"} {currentMeta.label}
                  </a>
                {/if}

                {#if apiConfigured && !aiChatOpen && aiChatHistory.length === 0}
                  <button class="action-btn accent" onclick={openAIChat}>
                    <Icon name="sparkle" size={14} />
                    {locale === "pl" ? "Dopracuj z AI" : "Refine with AI"}
                  </button>
                {/if}
              </div>

              {#if deployError}
                <p class="error-text">{deployError}</p>
              {/if}

              <!-- AI refine chat — persists once opened, history always visible -->
              {#if aiChatOpen || aiChatHistory.length > 0}
                <div class="ai-chat">
                  <div class="chat-header">
                    <Icon name="sparkle" size={14} />
                    <span>{locale === "pl" ? "Dopracowanie z AI" : "AI Refinement"}</span>
                    {#if aiChatHistory.length > 0}
                      <span class="chat-count">{aiChatHistory.filter(m => m.role === "user").length} {locale === "pl" ? "zmian" : "changes"}</span>
                    {/if}
                  </div>
                  {#if aiChatHistory.length > 0}
                    <div class="chat-messages">
                      {#each aiChatHistory as msg}
                        <div class="chat-msg" class:user={msg.role === "user"} class:ai={msg.role === "ai"}>
                          {msg.text}
                        </div>
                      {/each}
                    </div>
                  {/if}
                  <div class="chat-input-row">
                    <input
                      type="text"
                      class="chat-input"
                      placeholder={locale === "pl" ? "Co chcesz zmienić?" : "What do you want to change?"}
                      bind:value={aiChatInput}
                      onkeydown={(e) => { if (e.key === "Enter" && !aiCompiling) sendAIRefine(); }}
                      disabled={aiCompiling}
                    />
                    <button class="chat-send" onclick={sendAIRefine} disabled={aiCompiling || !aiChatInput.trim()}>
                      {#if aiCompiling}
                        <span class="spinner"></span>
                      {:else}
                        <Icon name="send" size={14} />
                      {/if}
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Past refinement sessions -->
          {#if pastSessions.length > 0}
            <div class="past-sessions">
              <SectionLabel>{locale === "pl" ? "Poprzednie dopracowania" : "Past refinements"}</SectionLabel>
              {#each pastSessions.slice().reverse().slice(0, 5) as session}
                <button class="session-card" onclick={() => restoreSession(session)}>
                  <div class="session-info">
                    <span class="session-date">{new Date(session.created_at).toLocaleDateString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    <span class="session-msgs">{session.messages.filter(m => m.role === "user").length} {locale === "pl" ? "zmian" : "changes"}</span>
                    {#if session.dimensions_added.length > 0}
                      <span class="session-dims">+{session.dimensions_added.length} dim</span>
                    {/if}
                  </div>
                  <span class="session-preview">{session.messages.find(m => m.role === "user")?.text.slice(0, 50) ?? ""}...</span>
                </button>
              {/each}
            </div>
          {/if}

          <button class="download-all-btn" onclick={downloadAll}>
            <Icon name="download" size={14} />
            {t("export.download_all")}
          </button>
        </div>
      {/if}
    </div>

  {:else}
    <div class="empty-state">
      <div class="empty-icon animate-fade-up" style="--delay: 0ms">
        <Icon name="download" size={40} />
      </div>
      <h1 class="empty-title animate-fade-up" style="--delay: 150ms">{t("export.no_profile")}</h1>
      <p class="empty-desc animate-fade-up" style="--delay: 300ms">{t("export.no_profile_desc")}</p>
      <div class="animate-fade-up" style="--delay: 450ms">
        <Button variant="primary" size="lg" onclick={() => goTo("home")}>
          {t("export.create_profile")}
          <Icon name="arrow-right" size={16} />
        </Button>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Uses shared .page / .page-content / .page-header / .tab-bar from shared.css */

  .tab-content {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  /* ─── Code preview (shared) ─── */
  .code-preview {
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--sp-3);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    overflow: auto;
    max-height: 360px;
    margin: 0;
    white-space: pre;
    line-height: 1.6;
  }

  /* ─── JSON section ─── */
  .json-section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  /* ─── Action buttons ─── */
  .action-row {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
  }

  .action-row.uniform .action-btn {
    flex: 1;
    min-width: 0;
    justify-content: center;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    text-decoration: none;
  }

  .action-btn:hover {
    border-color: var(--color-accent-border);
    color: var(--color-text);
  }

  .action-btn.copied {
    background: oklch(from var(--color-accent) l c h / 0.12);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .action-btn.accent {
    background: var(--color-accent-bg);
    border-color: var(--color-accent-border);
    color: var(--color-accent);
  }

  .action-btn.accent:hover {
    background: oklch(from var(--color-accent) l c h / 0.15);
  }

  /* ─── Platform chips ─── */
  .chip-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    padding: 6px 14px;
    border-radius: var(--radius-full);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .chip:hover {
    border-color: var(--color-border-hover);
    color: var(--color-text);
  }

  .chip.active {
    background: var(--color-accent-bg);
    border-color: var(--color-accent-border);
    color: var(--color-accent);
  }

  /* ─── Preview section ─── */
  .preview-section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .preview-filename {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .preview-size {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-ghost);
  }

  .preview-meta {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .edit-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    background: none;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    font-size: 11px;
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all 0.15s;
  }

  .edit-toggle:hover {
    border-color: var(--color-accent-border);
    color: var(--color-accent);
  }

  .code-edit {
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-accent-border);
    border-radius: var(--radius-md);
    padding: var(--sp-3);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text);
    resize: vertical;
    min-height: 200px;
    max-height: 500px;
    line-height: 1.6;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .error-text {
    font-size: var(--text-xs);
    color: oklch(0.55 0.2 25);
    margin: 0;
  }

  /* ─── AI Chat ─── */
  .ai-chat {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3);
    border: 1px solid var(--color-accent-border);
    border-radius: var(--radius-md);
    background: oklch(from var(--color-accent) l c h / 0.04);
  }

  .chat-header {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-accent);
  }

  .chat-count {
    font-weight: 400;
    color: var(--color-text-muted);
    margin-left: auto;
  }

  .chat-messages {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    max-height: 250px;
    overflow-y: auto;
  }

  .chat-msg {
    font-size: var(--text-xs);
    padding: 4px 8px;
    border-radius: var(--radius-xs);
    max-width: 90%;
  }

  .chat-msg.user {
    background: var(--color-bg-subtle);
    color: var(--color-text);
    align-self: flex-end;
  }

  .chat-msg.ai {
    background: oklch(from var(--color-accent) l c h / 0.1);
    color: var(--color-accent);
    align-self: flex-start;
  }

  .chat-input-row {
    display: flex;
    gap: var(--sp-1);
  }

  .chat-input {
    flex: 1;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-bg-card);
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    outline: none;
  }

  .chat-input:focus {
    border-color: var(--color-accent-border);
  }

  .chat-input::placeholder {
    color: var(--color-text-ghost);
  }

  .chat-send {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    background: var(--color-accent-bg);
    border: 1px solid var(--color-accent-border);
    color: var(--color-accent);
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .chat-send:hover:not(:disabled) {
    background: oklch(from var(--color-accent) l c h / 0.15);
  }

  .chat-send:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ─── Past sessions ─── */
  .past-sessions {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .session-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    cursor: pointer;
    transition: border-color 0.15s;
    text-align: left;
    font-family: var(--font-sans);
  }

  .session-card:hover {
    border-color: var(--color-accent-border);
  }

  .session-info {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .session-date {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .session-msgs, .session-dims {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-full);
    background: oklch(from var(--color-text) l c h / 0.06);
    color: var(--color-text-muted);
  }

  .session-dims {
    background: oklch(from var(--color-accent) l c h / 0.1);
    color: var(--color-accent);
  }

  .session-preview {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ─── Download all ─── */
  .download-all-btn {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-4);
    border-radius: var(--radius-md);
    background: var(--color-accent-bg);
    border: 1px solid var(--color-accent-border);
    color: var(--color-accent);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    align-self: flex-start;
  }

  .download-all-btn:hover {
    background: oklch(from var(--color-accent) l c h / 0.12);
  }

  /* ─── Validation ─── */
  .validation-section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .loading-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 1.5px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .validation-results {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .pill-row { display: flex; gap: var(--sp-1); }
  .pill {
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 500;
  }
  .pill.high { background: oklch(0.45 0.15 145 / 0.15); color: oklch(0.45 0.15 145); }
  .pill.medium { background: oklch(0.65 0.15 85 / 0.15); color: oklch(0.65 0.15 85); }
  .pill.low { background: oklch(0.55 0.2 25 / 0.15); color: oklch(0.55 0.2 25); }

  .weak-rule {
    padding: var(--sp-2);
    border: 1px solid oklch(from var(--color-text) l c h / 0.06);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
  }
  .weak-original { margin: 0 0 4px; color: var(--color-text-muted); text-decoration: line-through; opacity: 0.6; }
  .weak-problem { margin: 0 0 4px; color: oklch(0.55 0.2 25); }
  .weak-fix { margin: 0; color: oklch(0.45 0.15 145); font-weight: 500; }

  /* ─── Empty state ─── */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--sp-8);
  }
  .empty-icon { margin-bottom: var(--sp-4); color: var(--color-text-ghost); }
  .empty-title { font-size: var(--text-lg); font-weight: 600; color: var(--color-text); margin: 0; }
  .empty-desc { font-size: var(--text-sm); color: var(--color-text-secondary); margin: var(--sp-2) 0 0 0; max-width: 300px; line-height: 1.5; }
</style>
