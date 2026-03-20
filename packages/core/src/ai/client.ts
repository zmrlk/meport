/**
 * AI Client — connects to Claude, OpenAI, Gemini, Grok, OpenRouter, or Ollama.
 * Supports generate(), chat(), and chatStream() across ALL providers.
 * Zero external dependencies — uses native fetch.
 */

export interface AIConfig {
  provider: "claude" | "openai" | "gemini" | "grok" | "openrouter" | "ollama";
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** Reasoning effort for GPT-5+/o-series: "low" | "medium" | "high" (default: provider decides) */
  reasoningEffort?: "low" | "medium" | "high";
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  jsonMode?: boolean;
  /** Override model for this specific call (e.g., use fast model for simple tasks) */
  model?: string;
  /** Override reasoning effort for this call */
  reasoningEffort?: "low" | "medium" | "high";
}

export interface AIClientFull {
  /** Simple single-prompt generation */
  generate(prompt: string, options?: ChatOptions): Promise<string>;
  /** Structured chat with message array (proper turn-taking) */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  /** Streaming chat — calls onChunk with each text fragment, returns full text */
  chatStream(messages: ChatMessage[], onChunk: (text: string) => void, options?: ChatOptions): Promise<string>;
  /** Structured JSON output (Ollama: grammar-constrained, others: json mode) */
  chatJSON<T = any>(messages: ChatMessage[], schema?: Record<string, any>): Promise<T>;
  /** Provider name for display */
  provider: string;
  /** Default model name */
  model: string;
  /** Fast model for non-reasoning tasks (same provider, lighter model) */
  fastModel: string;
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

/** Fast (non-reasoning) models per provider — for simple tasks like question generation */
const FAST_MODELS: Record<string, string> = {
  claude: "claude-sonnet-4-6-20250929",
  openai: "gpt-4o",
  gemini: "gemini-2.0-flash",
  grok: "grok-4-fast",
  openrouter: "anthropic/claude-sonnet-4-6-20250929",
  ollama: "llama3.1",
};

const PROVIDER_BASE_URLS: Record<string, string> = {
  gemini: "https://generativelanguage.googleapis.com",
  grok: "https://api.x.ai",
  openrouter: "https://openrouter.ai/api",
};

const TIMEOUT_MS = 240_000; // 240 seconds — reasoning models need 2-3 min
const OLLAMA_TIMEOUT_MS = 600_000; // 10 minutes — local models can be very slow
const STREAM_IDLE_TIMEOUT_MS = 120_000; // 2 minutes without any chunk = dead

/** Detect browser environment and use proxy paths to avoid CORS */
const IS_BROWSER = typeof window !== "undefined" && typeof window.document !== "undefined";
const IS_TAURI = IS_BROWSER && "__TAURI__" in window;
const ANTHROPIC_BASE = !IS_BROWSER || IS_TAURI ? "https://api.anthropic.com" : "/api/anthropic";
const OPENAI_BASE = !IS_BROWSER || IS_TAURI ? "https://api.openai.com" : "/api/openai";

/** Detect reasoning model (GPT-5+, o1/o3/o4 series) */
function isReasoningModel(model: string): boolean {
  return model.startsWith("gpt-5") || /^o[134](-|$)/.test(model);
}

/** Scrub potential API keys from error messages to prevent leakage */
function scrubApiKey(text: string): string {
  return text
    .replace(/\b(sk-[a-zA-Z0-9_-]{10,})\b/g, "sk-***")
    .replace(/\b(anthropic-[a-zA-Z0-9_-]{10,})\b/g, "anthropic-***")
    .replace(/\b(key-[a-zA-Z0-9_-]{10,})\b/g, "key-***")
    .replace(/(Bearer\s+)[a-zA-Z0-9_-]{10,}/g, "$1***")
    .replace(/\b(AIza[a-zA-Z0-9_-]{10,})\b/g, "AIza***")
    .replace(/\b(xai-[a-zA-Z0-9_-]{10,})\b/g, "xai-***")
    .replace(/[?&]key=[a-zA-Z0-9_-]{10,}/g, "key=***");
}

/** Parse SSE stream — shared between OpenAI and Claude */
async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  extractText: (event: any) => string | null,
  onChunk: (text: string) => void,
): Promise<string> {
  const reader = body.getReader();
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
        const text = extractText(event);
        if (text) {
          full += text;
          onChunk(text);
        }
      } catch { /* skip malformed SSE lines */ }
    }
  }

  return full;
}

export function createAIClient(config: AIConfig): AIClientFull {
  const model = config.model ?? DEFAULT_MODELS[config.provider] ?? "gpt-5";
  const fastModel = FAST_MODELS[config.provider] ?? model;
  const defaultEffort = config.reasoningEffort;

  // API key guard
  if (config.provider !== "ollama" && !config.apiKey) {
    throw new Error(`API key required for ${config.provider}. Run: meport config`);
  }

  /** Resolve model — use override if provided, otherwise default */
  const resolveModel = (opts?: ChatOptions) => opts?.model ?? model;
  const resolveEffort = (opts?: ChatOptions) => opts?.reasoningEffort ?? defaultEffort;

  switch (config.provider) {
    case "claude":
      return {
        provider: "claude",
        model,
        fastModel,
        generate: (prompt, opts) => callClaude([{ role: "user", content: prompt }], config.apiKey!, resolveModel(opts)),
        chat: (msgs, opts) => callClaude(msgs, config.apiKey!, resolveModel(opts), opts?.jsonMode),
        chatStream: (msgs, onChunk, opts) => callClaudeStream(msgs, config.apiKey!, resolveModel(opts), onChunk),
        chatJSON: async <T = any>(msgs: ChatMessage[]) => {
          const raw = await callClaude(msgs, config.apiKey!, model, true);
          return JSON.parse(raw) as T;
        },
      };
    case "openai":
      return {
        provider: "openai",
        model,
        fastModel,
        generate: (prompt, opts) => callOpenAI([{ role: "user", content: prompt }], config.apiKey!, resolveModel(opts), false, config.baseUrl, resolveEffort(opts)),
        chat: (msgs, opts) => callOpenAI(msgs, config.apiKey!, resolveModel(opts), opts?.jsonMode, config.baseUrl, resolveEffort(opts)),
        chatStream: (msgs, onChunk, opts) => callOpenAIStream(msgs, config.apiKey!, resolveModel(opts), onChunk, config.baseUrl, resolveEffort(opts)),
        chatJSON: async <T = any>(msgs: ChatMessage[]) => {
          const raw = await callOpenAI(msgs, config.apiKey!, model, true, config.baseUrl, resolveEffort());
          return JSON.parse(raw) as T;
        },
      };
    case "gemini":
      return {
        provider: "gemini",
        model,
        fastModel,
        generate: (prompt, opts) => callGemini([{ role: "user", content: prompt }], config.apiKey!, resolveModel(opts)),
        chat: (msgs, opts) => callGemini(msgs, config.apiKey!, resolveModel(opts)),
        chatStream: (msgs, onChunk, opts) => callGeminiStream(msgs, config.apiKey!, resolveModel(opts), onChunk),
        chatJSON: async <T = any>(msgs: ChatMessage[]) => {
          const raw = await callGemini(msgs, config.apiKey!, model);
          return JSON.parse(raw) as T;
        },
      };
    case "grok":
    case "openrouter": {
      const base = config.baseUrl ?? PROVIDER_BASE_URLS[config.provider];
      return {
        provider: config.provider,
        model,
        fastModel,
        generate: (prompt, opts) => callOpenAI([{ role: "user", content: prompt }], config.apiKey!, resolveModel(opts), false, base, resolveEffort(opts)),
        chat: (msgs, opts) => callOpenAI(msgs, config.apiKey!, resolveModel(opts), opts?.jsonMode, base, resolveEffort(opts)),
        chatStream: (msgs, onChunk, opts) => callOpenAIStream(msgs, config.apiKey!, resolveModel(opts), onChunk, base, resolveEffort(opts)),
        chatJSON: async <T = any>(msgs: ChatMessage[]) => {
          const raw = await callOpenAI(msgs, config.apiKey!, model, true, base, resolveEffort());
          return JSON.parse(raw) as T;
        },
      };
    }
    case "ollama": {
      const ollamaBase = config.baseUrl ?? "http://localhost:11434";
      return {
        provider: "ollama",
        model,
        fastModel: model,
        generate: (prompt) => callOllama(prompt, ollamaBase, model),
        chat: (msgs) => callOllamaChat(msgs, ollamaBase, model),
        chatStream: (msgs, onChunk) => callOllamaStream(msgs, ollamaBase, model, onChunk),
        chatJSON: <T = any>(msgs: ChatMessage[], schema?: Record<string, any>) => callOllamaJSON<T>(msgs, ollamaBase, model, schema),
      };
    }
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

// ─── Claude ─────────────────────────────────────────────

function sanitizeClaudeMessages(messages: ChatMessage[]) {
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMsgs = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // Ensure alternating roles (Claude requirement)
  const sanitized: typeof chatMsgs = [];
  for (const msg of chatMsgs) {
    if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === msg.role) {
      sanitized[sanitized.length - 1].content += "\n\n" + msg.content;
    } else {
      sanitized.push({ ...msg });
    }
  }

  return { systemMsg, sanitized };
}

async function callClaude(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  _jsonMode?: boolean
): Promise<string> {
  const { systemMsg, sanitized } = sanitizeClaudeMessages(messages);
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

async function callClaudeStream(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const { systemMsg, sanitized } = sanitizeClaudeMessages(messages);
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

    return parseSSEStream(
      res.body!,
      (event) => event.type === "content_block_delta" ? event.delta?.text ?? null : null,
      onChunk,
    );
  } finally {
    clearTimeout(timeout);
  }
}

// ─── OpenAI ─────────────────────────────────────────────

function buildOpenAIBody(
  messages: ChatMessage[],
  model: string,
  jsonMode?: boolean,
  reasoningEffort?: "low" | "medium" | "high",
  stream?: boolean,
): any {
  const isNew = isReasoningModel(model);
  const body: any = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    ...(isNew ? { max_completion_tokens: 16384 } : { max_tokens: 4096 }),
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  // Reasoning effort — only for reasoning models (OpenAI top-level param)
  if (reasoningEffort && isNew) {
    body.reasoning_effort = reasoningEffort;
  }

  if (stream) {
    body.stream = true;
  }

  return body;
}

async function callOpenAI(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  jsonMode?: boolean,
  baseUrlOverride?: string,
  reasoningEffort?: "low" | "medium" | "high",
): Promise<string> {
  const base = baseUrlOverride ?? OPENAI_BASE;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body = buildOpenAIBody(messages, model, jsonMode, reasoningEffort);
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
    if (!content && isReasoningModel(model) && data.usage?.completion_tokens > 0) {
      const retryController = new AbortController();
      const retryTimeout = setTimeout(() => retryController.abort(), TIMEOUT_MS);
      try {
        const retryBody = buildOpenAIBody(messages, model, jsonMode, "medium");
        retryBody.max_completion_tokens = 32768;
        const retryRes = await fetch(`${base}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(retryBody),
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

async function callOpenAIStream(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  onChunk: (text: string) => void,
  baseUrlOverride?: string,
  reasoningEffort?: "low" | "medium" | "high",
): Promise<string> {
  const base = baseUrlOverride ?? OPENAI_BASE;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body = buildOpenAIBody(messages, model, false, reasoningEffort, true);
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

    return parseSSEStream(
      res.body!,
      (event) => event.choices?.[0]?.delta?.content ?? null,
      onChunk,
    );
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Gemini ─────────────────────────────────────────────

function buildGeminiPayload(messages: ChatMessage[]) {
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMsgs = messages.filter((m) => m.role !== "system");

  const contents = chatMsgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  return { systemMsg, contents };
}

async function callGemini(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
): Promise<string> {
  const base = PROVIDER_BASE_URLS.gemini;
  const { systemMsg, contents } = buildGeminiPayload(messages);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

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

async function callGeminiStream(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const base = PROVIDER_BASE_URLS.gemini;
  const { systemMsg, contents } = buildGeminiPayload(messages);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `${base}/v1beta/models/${model}:streamGenerateContent?alt=sse`,
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

    return parseSSEStream(
      res.body!,
      (event) => event.candidates?.[0]?.content?.parts?.[0]?.text ?? null,
      onChunk,
    );
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Ollama ─────────────────────────────────────────────

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

/**
 * List locally installed Ollama models.
 * Returns model names sorted by modification date (newest first).
 * If Ollama is unreachable, returns empty array.
 */
export async function listOllamaModels(baseUrl = "http://localhost:11434"): Promise<OllamaModel[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const models: OllamaModel[] = (data.models ?? []).map((m: any) => ({
      name: m.name ?? m.model ?? "",
      size: m.size ?? 0,
      modified_at: m.modified_at ?? "",
    }));
    return models.sort((a, b) => b.modified_at.localeCompare(a.modified_at));
  } catch {
    return [];
  }
}

/**
 * Pick the best available Ollama model from installed models.
 * Priority: user's explicit choice > largest model > first available.
 */
export function pickOllamaModel(models: OllamaModel[], preferred?: string): string {
  if (!models.length) return "llama3.1"; // fallback
  // If user set a preferred model and it's installed, use it
  if (preferred) {
    const match = models.find(m => m.name === preferred || m.name.startsWith(preferred + ":"));
    if (match) return match.name;
  }
  // Pick the largest model (usually the most capable)
  const sorted = [...models].sort((a, b) => b.size - a.size);
  return sorted[0].name;
}

/**
 * Pull (download) an Ollama model with streaming progress.
 * Returns true on success, false on failure.
 */
export async function pullOllamaModel(
  baseUrl: string,
  model: string,
  onProgress: (percent: number, status: string) => void,
): Promise<boolean> {
  try {
    const resp = await fetch(`${baseUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model }),
    });
    if (!resp.ok || !resp.body) return false;

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Parse NDJSON lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.total && data.completed) {
            const pct = Math.round((data.completed / data.total) * 100);
            onProgress(pct, data.status ?? "downloading");
          } else if (data.status) {
            onProgress(-1, data.status);
          }
          if (data.status === "success") {
            onProgress(100, "success");
            return true;
          }
        } catch {}
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Recommended models for onboarding */
export const RECOMMENDED_OLLAMA_MODELS = [
  { name: "llama3.1:8b", size: "4.7 GB", ram: "8 GB", desc_pl: "Szybki, dobry do profilowania", desc_en: "Fast, good for profiling", recommended: true },
  { name: "gemma2:9b", size: "5.4 GB", ram: "10 GB", desc_pl: "Dobra alternatywa od Google", desc_en: "Good alternative from Google", recommended: false },
  { name: "mistral:7b", size: "4.1 GB", ram: "8 GB", desc_pl: "Lekki i szybki", desc_en: "Lightweight and fast", recommended: false },
  { name: "llama3.1:70b", size: "40 GB", ram: "48 GB", desc_pl: "Najlepszy, wymaga dużo RAM", desc_en: "Best quality, needs lots of RAM", recommended: false },
];

/**
 * Ollama JSON-constrained generation — uses grammar-based decoding.
 * 100% structural compliance regardless of model size.
 * Uses low temperature + tight sampling for factual extraction.
 */
async function callOllamaJSON<T = any>(
  messages: ChatMessage[],
  baseUrl: string,
  model: string,
  schema?: Record<string, any>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const body: Record<string, any> = {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      // Grammar-constrained: pass full JSON schema or just "json"
      format: schema ?? "json",
      options: {
        num_ctx: 32768,
        temperature: 0.1,    // Low = factual, deterministic
        top_k: 15,           // Tight candidate pool
        top_p: 0.7,          // Tight nucleus sampling
        repeat_penalty: 1.15, // Prevent repetition loops
        num_predict: 512,    // Cap output length
      },
    };

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama error (${res.status}): ${err.slice(0, 200)}`);
    }

    const data = (await res.json()) as any;
    const content = data.message?.content ?? "{}";
    return JSON.parse(content) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function callOllama(prompt: string, baseUrl: string, model: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false, options: { num_ctx: 32768 } }),
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
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
        options: { num_ctx: 32768 },
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

async function callOllamaStream(
  messages: ChatMessage[],
  baseUrl: string,
  model: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const controller = new AbortController();
  // Use long timeout for initial connection (model loading can take minutes)
  const connectionTimeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        options: { num_ctx: 32768, temperature: 0.3, top_k: 30, top_p: 0.85, repeat_penalty: 1.15, num_predict: 1024 },
      }),
      signal: controller.signal,
    });

    // Connection established — switch to idle timeout (reset on each chunk)
    clearTimeout(connectionTimeout);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama error (${res.status}): ${err.slice(0, 200)}`);
    }

    // Ollama streams NDJSON (one JSON object per line), not SSE
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";
    let idleTimeout = setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS);
    // Loop detection: if last 200 chars repeat, model is stuck
    let lastChunk200 = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Reset idle timeout on each chunk
      clearTimeout(idleTimeout);
      idleTimeout = setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS);

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          const text = data.message?.content ?? "";
          if (text) {
            full += text;
            onChunk(text);

            // Loop detection: check if output is repeating
            if (full.length > 400) {
              const tail = full.slice(-200);
              if (lastChunk200 && tail === lastChunk200) {
                // Model is stuck in a loop — abort and return what we have
                console.warn("[meport] Ollama loop detected, aborting stream");
                controller.abort();
                clearTimeout(idleTimeout);
                // Trim the repeated tail
                return full.slice(0, full.length - 200);
              }
              lastChunk200 = tail;
            }
          }
        } catch { /* skip malformed lines */ }
      }
    }

    clearTimeout(idleTimeout);
    return full;
  } finally {
    clearTimeout(connectionTimeout);
  }
}
