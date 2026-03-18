/**
 * AI Client — connects to Claude, OpenAI, or Ollama.
 * Supports both simple generate() and structured chat() with message arrays.
 * Zero external dependencies — uses native fetch.
 */

export interface AIConfig {
  provider: "claude" | "openai" | "gemini" | "grok" | "openrouter" | "ollama";
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIClientFull {
  /** Simple single-prompt generation */
  generate(prompt: string): Promise<string>;
  /** Structured chat with message array (proper turn-taking) */
  chat(messages: ChatMessage[], options?: { jsonMode?: boolean }): Promise<string>;
  /** Streaming chat — calls onChunk with each text fragment, returns full text */
  chatStream?(messages: ChatMessage[], onChunk: (text: string) => void): Promise<string>;
  /** Provider name for display */
  provider: string;
}

// Re-export simple interface for backward compat
export type { AIClientFull as AIClient };

const DEFAULT_MODELS: Record<string, string> = {
  claude: "claude-sonnet-4-6-20250929",
  openai: "gpt-5.4",
  gemini: "gemini-3.1-pro",
  grok: "grok-4-fast",
  openrouter: "anthropic/claude-sonnet-4-6-20250929",
  ollama: "llama3.1",
};

const PROVIDER_BASE_URLS: Record<string, string> = {
  gemini: "https://generativelanguage.googleapis.com",
  grok: "https://api.x.ai",
  openrouter: "https://openrouter.ai/api",
};

const TIMEOUT_MS = 120_000; // 120 seconds (larger models need more time)

/** Detect browser environment and use proxy paths to avoid CORS */
const IS_BROWSER = typeof window !== "undefined" && typeof window.document !== "undefined";
const IS_TAURI = IS_BROWSER && "__TAURI__" in window;
const ANTHROPIC_BASE = !IS_BROWSER || IS_TAURI ? "https://api.anthropic.com" : "/api/anthropic";
const OPENAI_BASE = !IS_BROWSER || IS_TAURI ? "https://api.openai.com" : "/api/openai";

/** Scrub potential API keys from error messages to prevent leakage */
function scrubApiKey(text: string): string {
  // Match common API key patterns (sk-..., anthropic-..., key-..., Bearer tokens)
  return text
    .replace(/\b(sk-[a-zA-Z0-9_-]{10,})\b/g, "sk-***")
    .replace(/\b(anthropic-[a-zA-Z0-9_-]{10,})\b/g, "anthropic-***")
    .replace(/\b(key-[a-zA-Z0-9_-]{10,})\b/g, "key-***")
    .replace(/(Bearer\s+)[a-zA-Z0-9_-]{10,}/g, "$1***")
    .replace(/\b(AIza[a-zA-Z0-9_-]{10,})\b/g, "AIza***")
    .replace(/\b(xai-[a-zA-Z0-9_-]{10,})\b/g, "xai-***")
    .replace(/[?&]key=[a-zA-Z0-9_-]{10,}/g, "key=***");
}

export function createAIClient(config: AIConfig): AIClientFull {
  const model = config.model ?? DEFAULT_MODELS[config.provider] ?? "gpt-5";

  // API key guard
  if (config.provider !== "ollama" && !config.apiKey) {
    throw new Error(`API key required for ${config.provider}. Run: meport config`);
  }

  switch (config.provider) {
    case "claude":
      return {
        provider: "claude",
        generate: (prompt) => callClaude([{ role: "user", content: prompt }], config.apiKey!, model),
        chat: (msgs, opts) => callClaude(msgs, config.apiKey!, model, opts?.jsonMode),
        chatStream: (msgs, onChunk) => callClaudeStream(msgs, config.apiKey!, model, onChunk),
      };
    case "openai":
      return {
        provider: "openai",
        generate: (prompt) => callOpenAI([{ role: "user", content: prompt }], config.apiKey!, model, false, config.baseUrl),
        chat: (msgs, opts) => callOpenAI(msgs, config.apiKey!, model, opts?.jsonMode, config.baseUrl),
      };
    case "gemini":
      return {
        provider: "gemini",
        generate: (prompt) => callGemini([{ role: "user", content: prompt }], config.apiKey!, model),
        chat: (msgs) => callGemini(msgs, config.apiKey!, model),
      };
    case "grok":
    case "openrouter": {
      const base = config.baseUrl ?? PROVIDER_BASE_URLS[config.provider];
      return {
        provider: config.provider,
        generate: (prompt) => callOpenAI([{ role: "user", content: prompt }], config.apiKey!, model, false, base),
        chat: (msgs, opts) => callOpenAI(msgs, config.apiKey!, model, opts?.jsonMode, base),
      };
    }
    case "ollama":
      return {
        provider: "ollama",
        generate: (prompt) => callOllama(prompt, config.baseUrl ?? "http://localhost:11434", model),
        chat: (msgs) => callOllamaChat(msgs, config.baseUrl ?? "http://localhost:11434", model),
      };
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

// ─── Claude ─────────────────────────────────────────────

async function callClaude(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  _jsonMode?: boolean
): Promise<string> {
  // Claude uses system param separately
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMsgs = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // Ensure alternating roles (Claude requirement)
  const sanitized: typeof chatMsgs = [];
  for (const msg of chatMsgs) {
    if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === msg.role) {
      // Merge consecutive same-role messages
      sanitized[sanitized.length - 1].content += "\n\n" + msg.content;
    } else {
      sanitized.push({ ...msg });
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        ...(systemMsg ? { system: systemMsg.content } : {}),
        messages: sanitized,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 429) throw new Error("Rate limited — wait a moment and try again");
      throw new Error(`Claude API error (${res.status}): ${scrubApiKey(err.slice(0, 200))}`);
    }

    const data = (await res.json()) as any;
    return data.content?.[0]?.text ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Claude Streaming ────────────────────────────────────

async function callClaudeStream(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMsgs = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const sanitized: typeof chatMsgs = [];
  for (const msg of chatMsgs) {
    if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === msg.role) {
      sanitized[sanitized.length - 1].content += "\n\n" + msg.content;
    } else {
      sanitized.push({ ...msg });
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        stream: true,
        ...(systemMsg ? { system: systemMsg.content } : {}),
        messages: sanitized,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 429) throw new Error("Rate limited — wait a moment and try again");
      throw new Error(`Claude API error (${res.status}): ${scrubApiKey(err.slice(0, 200))}`);
    }

    // Parse SSE stream
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const event = JSON.parse(data);
          if (event.type === "content_block_delta" && event.delta?.text) {
            full += event.delta.text;
            onChunk(event.delta.text);
          }
        } catch { /* skip malformed SSE lines */ }
      }
    }

    return full;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── OpenAI ─────────────────────────────────────────────

async function callOpenAI(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  jsonMode?: boolean,
  baseUrlOverride?: string
): Promise<string> {
  const base = baseUrlOverride ?? OPENAI_BASE;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // GPT-5+ uses max_completion_tokens, older models use max_tokens
    // Detect reasoning/new models: gpt-5+, o1/o3/o4-* series
    // Careful: "o" prefix alone would match "open-hermes" etc.
    const isNewModel = model.startsWith("gpt-5") ||
      /^o[134](-|$)/.test(model);
    const body: any = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      ...(isNewModel ? { max_completion_tokens: 16384 } : { max_tokens: 4096 }),
    };

    // JSON mode for reliable structured output
    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 429) throw new Error("Rate limited — wait a moment and try again");
      throw new Error(`OpenAI API error (${res.status}): ${scrubApiKey(err.slice(0, 200))}`);
    }

    const data = (await res.json()) as any;
    const content = data.choices?.[0]?.message?.content ?? "";

    // GPT-5 reasoning models can consume all tokens for reasoning, returning empty content.
    // Retry once with higher budget and reasoning effort hint.
    if (!content && isNewModel && data.usage?.completion_tokens > 0) {
      // Fresh controller for retry — original may have timed out
      const retryController = new AbortController();
      const retryTimeout = setTimeout(() => retryController.abort(), TIMEOUT_MS);
      try {
      const retryRes = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          max_completion_tokens: 32768,
          reasoning: { effort: "medium" },
        }),
        signal: retryController.signal,
      });

      if (retryRes.ok) {
        const retryData = (await retryRes.json()) as any;
        return retryData.choices?.[0]?.message?.content ?? "";
      }
      } finally {
        clearTimeout(retryTimeout);
      }
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Gemini ─────────────────────────────────────────────

async function callGemini(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
): Promise<string> {
  const base = PROVIDER_BASE_URLS.gemini;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // Convert ChatMessage[] to Gemini format
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMsgs = messages.filter((m) => m.role !== "system");

  const contents = chatMsgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  try {
    const res = await fetch(
      `${base}/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents,
          ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
          generationConfig: { maxOutputTokens: 8192 },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 429) throw new Error("Rate limited — wait a moment and try again");
      throw new Error(`Gemini API error (${res.status}): ${scrubApiKey(err.slice(0, 200))}`);
    }

    const data = (await res.json()) as any;
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Ollama ─────────────────────────────────────────────

async function callOllama(prompt: string, baseUrl: string, model: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama error (${res.status}): ${err.slice(0, 200)}`);
    }

    const data = (await res.json()) as any;
    return data.response ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

async function callOllamaChat(messages: ChatMessage[], baseUrl: string, model: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama error (${res.status}): ${err.slice(0, 200)}`);
    }

    const data = (await res.json()) as any;
    return data.message?.content ?? "";
  } finally {
    clearTimeout(timeout);
  }
}
