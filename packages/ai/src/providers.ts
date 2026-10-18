/**
 * Model providers over plain fetch: no SDKs, so the CLI stays small and the
 * key never leaves the user's machine except to the provider they chose.
 * Every call asks for JSON that matches a schema; callers validate it again.
 */

export type ProviderId = "anthropic" | "openai" | "openrouter" | "mock";

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  defaultModel: string;
  models: { id: string; label: string }[];
  keyHint: string;
  keyUrl: string;
  envVar: string;
  recommended?: boolean;
}

export const PROVIDERS: Record<Exclude<ProviderId, "mock">, ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    name: "Claude",
    defaultModel: "claude-sonnet-5-5",
    models: [
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (fast, recommended)" },
      { id: "claude-opus-5-5", label: "Claude Opus 5.5 (slower, most careful)" },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fastest)" },
    ],
    keyHint: "sk-ant-…",
    keyUrl: "https://platform.claude.com/settings/keys",
    envVar: "ANTHROPIC_API_KEY",
    recommended: true,
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    defaultModel: "gpt-6.1-sol",
    models: [
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
      { id: "gpt-6-luna", label: "GPT-6 Luna (cheaper)" },
    ],
    keyHint: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
    envVar: "OPENAI_API_KEY",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    defaultModel: "anthropic/claude-sonnet-5.5",
    models: [
      { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5 via OpenRouter" },
      { id: "openai/gpt-6.1-sol", label: "GPT-6.1 Sol via OpenRouter" },
    ],
    keyHint: "sk-or-…",
    keyUrl: "https://openrouter.ai/settings/keys",
    envVar: "OPENROUTER_API_KEY",
  },
};

export interface ModelConfig {
  provider: ProviderId;
  apiKey: string;
  model?: string;
}

export type Part = { type: "text"; text: string } | { type: "image"; mediaType: string; data: string };

export interface JsonRequest {
  system: string;
  /** A single user turn; earlier turns go in `history`. */
  content: Part[];
  history?: { role: "user" | "assistant"; text: string }[];
  /** JSON Schema for the answer. Every object has additionalProperties: false. */
  schema: Record<string, unknown>;
  /** Short identifier for the schema, used by providers that require a name. */
  name: string;
  signal?: AbortSignal;
}

export class ModelError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "ModelError";
  }
}

/** A deterministic stand-in, for tests and for trying the flow without a key. */
export type MockHandler = (req: JsonRequest) => unknown;
let mockHandler: MockHandler | null = null;
export function setMockHandler(fn: MockHandler | null) {
  mockHandler = fn;
}

const TIMEOUT_MS = 90_000;

async function post(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  signal?.addEventListener("abort", () => ctrl.abort());
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (err) {
    throw new ModelError(ctrl.signal.aborted ? "The model took too long to answer." : `Couldn't reach the model provider: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error?.message ?? data?.error ?? data?.raw ?? res.statusText;
    throw new ModelError(typeof msg === "string" ? msg : JSON.stringify(msg), res.status);
  }
  return data;
}

/** Pull the first JSON object out of a model's text, tolerating code fences. */
export function parseJsonText(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new ModelError("The model's answer wasn't valid JSON.");
  }
}

async function anthropic(cfg: ModelConfig, req: JsonRequest): Promise<unknown> {
  const content = req.content.map((p) =>
    p.type === "text" ? { type: "text", text: p.text } : { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data } },
  );
  const messages = [
    ...(req.history ?? []).map((m) => ({ role: m.role, content: m.text })),
    { role: "user", content },
  ];
  const body: Record<string, unknown> = {
    model: cfg.model || PROVIDERS.anthropic.defaultModel,
    max_tokens: 8000,
    system: req.system,
    messages,
    output_config: { format: { type: "json_schema", schema: req.schema }, effort: "medium" },
  };
  const headers = { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" };
  let data: any;
  try {
    data = await post("https://api.anthropic.com/v1/messages", headers, body, req.signal);
  } catch (err) {
    // Older models don't take an effort level; ask again without one.
    if (err instanceof ModelError && err.status === 400 && /effort/i.test(err.message)) {
      body.output_config = { format: { type: "json_schema", schema: req.schema } };
      data = await post("https://api.anthropic.com/v1/messages", headers, body, req.signal);
    } else throw err;
  }
  if (data.stop_reason === "refusal") throw new ModelError("The model declined to answer.");
  if (data.stop_reason === "max_tokens") throw new ModelError("The model's answer was cut off.");
  const text = (data.content ?? []).find((b: { type: string }) => b.type === "text")?.text;
  if (!text) throw new ModelError("The model returned no answer.");
  return parseJsonText(text);
}

async function openaiLike(cfg: ModelConfig, req: JsonRequest, url: string, extraHeaders: Record<string, string>, fallbackModel: string) {
  const content = req.content.map((p) =>
    p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${p.data}` } },
  );
  const messages = [
    { role: "system", content: req.system },
    ...(req.history ?? []).map((m) => ({ role: m.role, content: m.text })),
    { role: "user", content },
  ];
  const body: Record<string, unknown> = {
    model: cfg.model || fallbackModel,
    messages,
    response_format: { type: "json_schema", json_schema: { name: req.name, strict: true, schema: req.schema } },
  };
  const headers = { authorization: `Bearer ${cfg.apiKey}`, ...extraHeaders };
  let data: any;
  try {
    data = await post(url, headers, body, req.signal);
  } catch (err) {
    // Some routed models don't support JSON schema; ask for JSON in the prompt instead.
    if (err instanceof ModelError && err.status === 400 && /response_format|json_schema|structured/i.test(err.message)) {
      delete body.response_format;
      (messages[0] as { content: string }).content =
        `${req.system}\n\nAnswer with one JSON object only, no prose, matching this JSON Schema:\n${JSON.stringify(req.schema)}`;
      data = await post(url, headers, body, req.signal);
    } else throw err;
  }
  const choice = data.choices?.[0];
  if (choice?.message?.refusal) throw new ModelError("The model declined to answer.");
  const text = choice?.message?.content;
  if (!text) throw new ModelError("The model returned no answer.");
  return parseJsonText(typeof text === "string" ? text : JSON.stringify(text));
}

/** Ask the model for one JSON answer matching `req.schema`. */
export async function callJson(cfg: ModelConfig, req: JsonRequest): Promise<unknown> {
  switch (cfg.provider) {
    case "anthropic":
      return anthropic(cfg, req);
    case "openai":
      return openaiLike(cfg, req, "https://api.openai.com/v1/chat/completions", {}, PROVIDERS.openai.defaultModel);
    case "openrouter":
      return openaiLike(
        cfg,
        req,
        "https://openrouter.ai/api/v1/chat/completions",
        { "http-referer": "https://github.com/fakepixels/auto-design", "x-title": "auto-design" },
        PROVIDERS.openrouter.defaultModel,
      );
    case "mock":
      if (!mockHandler) throw new ModelError("No mock model is set up.");
      return mockHandler(req);
  }
}

/** Check a key with a request that costs nothing. Returns a short label for the account. */
export async function verifyKey(cfg: ModelConfig): Promise<{ ok: true; label: string } | { ok: false; error: string }> {
  if (cfg.provider === "mock") return { ok: true, label: "Mock model" };
  if (!cfg.apiKey.trim()) return { ok: false, error: "Paste a key first." };
  const endpoints: Record<string, { url: string; headers: Record<string, string> }> = {
    anthropic: { url: "https://api.anthropic.com/v1/models?limit=1", headers: { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" } },
    openai: { url: "https://api.openai.com/v1/models", headers: { authorization: `Bearer ${cfg.apiKey}` } },
    openrouter: { url: "https://openrouter.ai/api/v1/key", headers: { authorization: `Bearer ${cfg.apiKey}` } },
  };
  const e = endpoints[cfg.provider]!;
  try {
    const res = await fetch(e.url, { headers: e.headers, signal: AbortSignal.timeout(15_000) });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "That key was rejected. Check that it's active and copied in full." };
    if (!res.ok) return { ok: false, error: `The provider answered ${res.status}. Try again in a moment.` };
    const info = PROVIDERS[cfg.provider as Exclude<ProviderId, "mock">];
    const model = info.models.find((m) => m.id === (cfg.model || info.defaultModel));
    return { ok: true, label: model?.label.replace(/ \(.*\)$/, "") ?? cfg.model ?? info.name };
  } catch (err) {
    return { ok: false, error: `Couldn't reach ${PROVIDERS[cfg.provider as Exclude<ProviderId, "mock">].name}: ${(err as Error).message}` };
  }
}

/** Keys already in the environment, so people who export them skip pasting. */
export function keysFromEnv(env: NodeJS.ProcessEnv = process.env): { provider: ProviderId; apiKey: string }[] {
  const found: { provider: ProviderId; apiKey: string }[] = [];
  for (const info of Object.values(PROVIDERS)) {
    const v = env[info.envVar];
    if (v && v.trim()) found.push({ provider: info.id, apiKey: v.trim() });
  }
  return found;
}
