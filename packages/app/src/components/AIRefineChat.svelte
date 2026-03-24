<script lang="ts">
  import { createAIClient } from "@meport/core/client";
  import type { PersonaProfile, ProfileChangeEntry } from "@meport/core/types";
  import { getApiKey, getApiProvider, getOllamaUrl, getAiModel, hasApiKey, setProfile, diffProfiles, getProfile } from "../lib/stores/app.svelte.js";
  import { getLocale } from "../lib/i18n.svelte.js";
  import Icon from "./Icon.svelte";

  // Props
  let { onProfileUpdated }: { onProfileUpdated?: () => void } = $props();

  // Read profile from store directly (not as prop — avoids component recreation on profile change)
  let profile = $derived(getProfile());

  // Chat state
  let chatHistory = $state<{ role: "user" | "ai"; text: string }[]>([]);
  let chatInput = $state("");
  let loading = $state(false);
  let error = $state("");

  // Load existing chat history from profile.changeHistory
  let pastChanges = $derived(
    (profile?.changeHistory ?? [])
      .filter(e => e.source === "ai_refine" && e.ai_messages?.length)
      .slice(-5)
  );

  const locale = $derived(getLocale());

  /** Extract dimensions from plain text — catches location, family, hobbies, etc. */
  function extractDimensionsFromText(text: string): Record<string, string> {
    const dims: Record<string, string> = {};
    const lower = text.toLowerCase();

    // Location patterns (PL + EN)
    const locMatch = text.match(/(?:mieszkam w|live in|based in|jestem z|from)\s+([A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż\s,]+?)(?:\.|,|$)/i);
    if (locMatch) dims["context.location"] = locMatch[1].trim();

    // Family/pets (PL + EN)
    const familyParts: string[] = [];
    if (/(?:mam|have)\s+(?:syna|son)/i.test(lower)) familyParts.push("syn");
    if (/(?:mam|have)\s+(?:córk[ęa]|daughter)/i.test(lower)) familyParts.push("córka");
    if (/(?:mam|have)\s+(?:\d+\s+)?(?:ps[aóy]|dog)/i.test(lower)) {
      const n = text.match(/(\d+)\s*(?:ps[aóy]|dog)/i);
      familyParts.push(n ? `${n[1]} psy` : "pies");
    }
    if (/(?:mam|have)\s+(?:\d+\s+)?(?:kot[aóy]|cat)/i.test(lower)) {
      const n = text.match(/(\d+)\s*(?:kot[aóy]|cat)/i);
      familyParts.push(n ? `${n[1]} koty` : "kot");
    }
    if (/(?:mam|have)\s+(?:żon[ęa]|wife|partner|partnerk)/i.test(lower)) familyParts.push("partnerka");
    if (/(?:mam|have)\s+(?:męż|husband)/i.test(lower)) familyParts.push("mąż");
    if (familyParts.length > 0) dims["life.family_context"] = familyParts.join(", ");

    // Hobbies
    const hobbyMatch = text.match(/(?:hobby|hobi|lubię|interes|pasja|zainteresowania)[:\s]+([^.]+)/i);
    if (hobbyMatch) dims["lifestyle.hobbies"] = hobbyMatch[1].trim();

    // Age
    const ageMatch = text.match(/(?:mam|have|jestem|i'm|i am)\s+(\d{1,3})\s*(?:lat|years|roku)/i);
    if (ageMatch) dims["identity.age_range"] = ageMatch[1];

    return dims;
  }

  // Dimension extraction map — same as ExportScreen had
  const DIMENSION_MAP = `- Name → "identity.preferred_name"
- Age/generation → "identity.age_range"
- Location/city → "context.location"
- Country → "context.country"
- Job/role → "context.occupation" AND "identity.role"
- Industry → "expertise.industries"
- Family (kids, partner, pets) → "life.family_context"
- Health conditions → "life.health_context"
- Hobbies/interests → "lifestyle.hobbies"
- Diet → "lifestyle.dietary"
- Language → "identity.language"
- Financial mindset → "life.financial_mindset"
- Life stage → "life.life_stage"
- Communication preference → "communication.directness"
- AI preference → "ai.relationship_model"
- Goals → "life.goals"
- Anti-goals → "life.anti_goals"
- Tech stack → "expertise.tech_stack"
- Any other personal fact → use the closest dimension name`;

  async function sendMessage() {
    if (!chatInput.trim() || loading) return;
    const userMsg = chatInput.trim();
    chatInput = "";
    chatHistory = [...chatHistory, { role: "user", text: userMsg }];
    loading = true;
    error = "";

    try {
      const provider = getApiProvider();
      const client = createAIClient({
        provider: provider as "claude" | "openai" | "ollama",
        apiKey: provider !== "ollama" ? getApiKey() : undefined,
        model: getAiModel() || undefined,
        baseUrl: provider === "ollama" ? getOllamaUrl() : undefined,
      });

      if (!client.chat) throw new Error("AI client does not support chat");

      const systemPrompt = `You are a profile enrichment assistant for meport. The user will share personal information about themselves. Your job is to extract factual dimensions from their message.

Current profile dimensions:
${Object.entries((profile as any)?.explicit ?? {}).map(([k, v]) => `${k}: ${(v as any).value}`).join("\n")}

DIMENSION MAP — extract to these keys:
${DIMENSION_MAP}

RULES:
1. Extract ALL personal facts from the user's message
2. Map each fact to the closest dimension key
3. If a dimension already exists, only update if the new info adds to it
4. NEVER invent data — only extract what the user actually said
5. Respond in the user's language (${locale === "pl" ? "Polish" : "English"})

OUTPUT FORMAT (strict):
---DIMENSIONS---
{"dimension.key": "value", "another.key": "value"}

---SUMMARY---
Brief summary of what was added/changed (1-3 lines, in user's language).

If no extractable personal info, output:
---DIMENSIONS---
{}

---SUMMARY---
${locale === "pl" ? "Nie znalazłem nowych informacji do dodania. Powiedz mi coś o sobie!" : "No new info found. Tell me something about yourself!"}`;

      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...chatHistory.map(m => ({
          role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
          content: m.text,
        })),
      ];

      const response = await client.chat(messages, {});

      // Parse response — try structured format first, fallback to JSON extraction
      let dimensions: Record<string, string> = {};
      let summary = "";

      const dimIdx = response.indexOf("---DIMENSIONS---");
      const sumIdx = response.indexOf("---SUMMARY---");

      if (dimIdx > -1) {
        // Structured format
        const afterDim = response.slice(dimIdx + 16);
        const jsonEnd = sumIdx > dimIdx ? sumIdx - dimIdx - 16 : afterDim.length;
        const dimJson = afterDim.slice(0, jsonEnd).trim();
        try { dimensions = JSON.parse(dimJson); } catch {}
        summary = sumIdx > -1 ? response.slice(sumIdx + 13).trim() : "";
      }

      // Fallback: extract JSON from anywhere in response (AI may embed it without markers)
      if (Object.keys(dimensions).length === 0) {
        const jsonMatch = response.match(/\{[^{}]*"[^"]+"\s*:\s*"[^"]*"[^{}]*\}/);
        if (jsonMatch) {
          try { dimensions = JSON.parse(jsonMatch[0]); } catch {}
        }
      }

      // Last resort: extract from USER message directly (programmatic, no AI needed)
      if (Object.keys(dimensions).length === 0) {
        dimensions = extractDimensionsFromText(userMsg);
      }

      if (!summary) {
        summary = response.replace(/---\w+---[\s\S]*/g, "").trim() || response.trim();
      }

      console.log("[meport] AI refine response:", { dimensions, summary, rawResponse: response?.slice(0, 200) });
      chatHistory = [...chatHistory, { role: "ai", text: summary || (locale === "pl" ? "Zaktualizowano." : "Updated.") }];

      // Apply dimensions to profile
      const validDims = Object.entries(dimensions).filter(([_, v]) => typeof v === "string" && v.length > 0);
      console.log("[meport] Valid dims to apply:", validDims);

      if (validDims.length > 0) {
        const beforeProfile = getProfile();
        const updated = {
          ...profile,
          explicit: { ...(profile as any)?.explicit ?? {} },
        };

        for (const [dim, val] of validDims) {
          const existing = updated.explicit[dim];
          if (existing) {
            const existingVal = String(existing.value);
            if (!existingVal.includes(val)) {
              updated.explicit[dim] = { ...existing, value: `${existingVal}, ${val}` };
            }
          } else {
            updated.explicit[dim] = {
              dimension: dim,
              value: val,
              confidence: 0.9,
              source: "explicit" as const,
              question_id: "ai_refine",
            };
          }
        }

        const changes = diffProfiles(beforeProfile, updated);
        const changeEntry: ProfileChangeEntry = {
          id: `ref_${Date.now()}`,
          date: new Date().toISOString(),
          source: "ai_refine",
          changes,
          ai_messages: [
            { role: "user", text: userMsg },
            { role: "ai", text: summary },
          ],
        };

        setProfile(updated, { changeEntry });

        if (changes.length > 0) {
          const dimNames = changes.map(c => c.dimension.split(".").pop()?.replace(/_/g, " ") ?? c.dimension);
          chatHistory = [...chatHistory, {
            role: "ai",
            text: locale === "pl"
              ? `✓ Profil: +${dimNames.join(", ")}`
              : `✓ Profile: +${dimNames.join(", ")}`,
          }];
          onProfileUpdated?.();
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      error = msg;
      chatHistory = [...chatHistory, { role: "ai", text: `⚠ ${msg}` }];
    } finally {
      loading = false;
    }
  }
</script>

<div class="refine-chat">
  {#if !hasApiKey()}
    <div class="no-ai">
      <Icon name="alert-circle" size={16} />
      <span>{locale === "pl" ? "Skonfiguruj AI w ustawieniach żeby dopracować profil." : "Configure AI in settings to refine your profile."}</span>
    </div>
  {:else}
    <div class="chat-intro">
      <p>{locale === "pl"
        ? "Powiedz coś o sobie — AI doda to do Twojego profilu."
        : "Tell me about yourself — AI will add it to your profile."}</p>
    </div>

    {#if chatHistory.length > 0}
      <div class="chat-messages">
        {#each chatHistory as msg}
          <div class="chat-msg" class:user={msg.role === "user"} class:ai={msg.role === "ai"}>
            {msg.text}
          </div>
        {/each}
        {#if loading}
          <div class="chat-msg ai loading">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
          </div>
        {/if}
      </div>
    {/if}

    <div class="chat-input-row">
      <input
        type="text"
        class="chat-input"
        placeholder={locale === "pl" ? "np. mieszkam w Krakowie, mam psa i kota" : "e.g. I live in NYC, I have 2 dogs"}
        bind:value={chatInput}
        onkeydown={(e) => { if (e.key === "Enter" && !loading) sendMessage(); }}
        disabled={loading}
      />
      <button class="send-btn" onclick={sendMessage} disabled={!chatInput.trim() || loading}>
        <Icon name="send" size={14} />
      </button>
    </div>
  {/if}
</div>

<style>
  .refine-chat {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .no-ai {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px;
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.2);
    border-radius: 10px;
    color: var(--color-warning, #f59e0b);
    font-size: 13px;
  }

  .chat-intro p {
    font-size: 13px;
    color: var(--color-text-muted);
    margin: 0;
  }

  .chat-messages {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 300px;
    overflow-y: auto;
    padding: 4px 0;
  }

  .chat-msg {
    font-size: 13px;
    line-height: 1.5;
    padding: 8px 12px;
    border-radius: 10px;
    max-width: 85%;
    word-wrap: break-word;
  }

  .chat-msg.user {
    align-self: flex-end;
    background: var(--color-bg-hover);
    color: var(--color-text);
  }

  .chat-msg.ai {
    align-self: flex-start;
    background: rgba(41, 239, 130, 0.06);
    color: var(--color-text);
    border: 1px solid rgba(41, 239, 130, 0.1);
  }

  .chat-msg.loading {
    display: flex;
    gap: 4px;
    padding: 12px 16px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-accent);
    animation: dot-pulse 1.2s ease-in-out infinite;
  }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes dot-pulse {
    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1); }
  }

  .chat-input-row {
    display: flex;
    gap: 8px;
  }

  .chat-input {
    flex: 1;
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--color-text);
    outline: none;
  }

  .chat-input:focus {
    border-color: var(--color-accent);
  }

  .send-btn {
    background: var(--color-accent);
    color: var(--color-bg);
    border: none;
    border-radius: 8px;
    padding: 10px 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
  }

  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
