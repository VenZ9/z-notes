import {
  type GenerationSettings,
  type ProviderName,
  type ProviderStatus,
} from "./types";
import { sleep } from "./utils";

export type ProviderErrorCode =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "network"
  | "server"
  | "model_unavailable"
  | "not_found"
  | "bad_request"
  | "format"
  | "unknown";

export class ProviderError extends Error {
  code: ProviderErrorCode;
  provider: ProviderName;
  status?: number;
  retryable: boolean;

  constructor(
    code: ProviderErrorCode,
    message: string,
    provider: ProviderName,
    status?: number,
    retryable = false
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
  }
}

export class AllProvidersError extends Error {
  attempts: { provider: ProviderName; code: string; message: string }[];
  warnings: string[];

  constructor(
    attempts: { provider: ProviderName; code: string; message: string }[],
    warnings: string[]
  ) {
    super("All configured providers failed.");
    this.name = "AllProvidersError";
    this.attempts = attempts;
    this.warnings = warnings;
  }
}

interface ProviderConfig {
  name: ProviderName;
  label: string;
  enabled: boolean;
  reason?: string;
  apiKey?: string;
  baseUrl: string;
  chatUrl: string;
  model: string;
  maxRetries: number;
  timeoutMs: number;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ProviderResult {
  text: string;
  provider: ProviderName;
  model: string;
  attempts: { provider: ProviderName; code: string; message: string }[];
  warnings: string[];
}

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function getProviderConfigs(): ProviderConfig[] {
  const timeoutMs = Number(process.env.GENERATION_TIMEOUT_MS || 60000);
  const maxRetries = Number(process.env.PROVIDER_MAX_RETRIES ?? 1);

  const groqKey = process.env.GROQ_API_KEY?.trim();
  const groqBase =
    process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1";
  const groqModel =
    process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const geminiBase =
    process.env.GEMINI_BASE_URL?.trim() ||
    "https://generativelanguage.googleapis.com/v1beta/openai/";

  const geminiModel = "gemini-3.8-flash";

  const kiloKey = process.env.KILO_API_KEY?.trim();
  const kiloModel = process.env.KILO_MODEL?.trim();
  let kiloBase = process.env.KILO_BASE_URL?.trim();
  let kiloChat = process.env.KILO_CHAT_COMPLETIONS_URL?.trim();

  if (!kiloBase && kiloChat) {
    try {
      const url = new URL(kiloChat);
      kiloBase = `${url.origin}${url.pathname.replace(
        /\/chat\/completions\/?$/,
        ""
      )}`;
    } catch {
      kiloBase = "https://api.kilo.ai/api/gateway";
    }
  }

  if (!kiloBase) {
    kiloBase = "https://api.kilo.ai/api/gateway";
  }

  if (!kiloChat) {
    kiloChat = joinUrl(kiloBase, "chat/completions");
  }

  return [
    {
      name: "groq",
      label: "Groq",
      enabled: Boolean(groqKey),
      reason: groqKey ? undefined : "GROQ_API_KEY is not set.",
      apiKey: groqKey,
      baseUrl: groqBase,
      chatUrl: joinUrl(groqBase, "chat/completions"),
      model: groqModel,
      maxRetries,
      timeoutMs,
    },
    {
      name: "gemini",
      label: "Google Gemini",
      enabled: Boolean(geminiKey),
      reason: geminiKey ? undefined : "GEMINI_API_KEY is not set.",
      apiKey: geminiKey,
      baseUrl: geminiBase,
      chatUrl: joinUrl(geminiBase, "chat/completions"),
      model: geminiModel,
      maxRetries,
      timeoutMs,
    },
    {
      name: "kilo",
      label: "Kilo AI Gateway",
      enabled: Boolean(kiloKey && kiloModel),
      reason: !kiloKey
        ? "KILO_API_KEY is not set."
        : !kiloModel
          ? "KILO_MODEL is not set. Kilo models must be configured and verified."
          : undefined,
      apiKey: kiloKey,
      baseUrl: kiloBase,
      chatUrl: kiloChat,
      model: kiloModel || "",
      maxRetries,
      timeoutMs,
    },
  ];
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  provider: ProviderName
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError(
        "timeout",
        `Request timed out after ${timeoutMs}ms.`,
        provider,
        undefined,
        true
      );
    }

    throw new ProviderError(
      "network",
      error instanceof Error ? error.message : "Network error.",
      provider,
      undefined,
      true
    );
  } finally {
    clearTimeout(timer);
  }
}

function classifyHttpError(
  status: number,
  text: string,
  provider: ProviderName
) {
  const lower = text.toLowerCase();

  if (status === 401 || status === 403) {
    return new ProviderError(
      "auth",
      text || "Invalid or unauthorized API key.",
      provider,
      status,
      false
    );
  }

  if (status === 429) {
    return new ProviderError(
      "rate_limit",
      text || "Rate limited.",
      provider,
      status,
      true
    );
  }

  if (status >= 500) {
    return new ProviderError(
      "server",
      text || `Provider server error (${status}).`,
      provider,
      status,
      true
    );
  }

  if (
    status === 404 ||
    /model.*(not found|unavailable|unsupported)|unknown model|invalid model/.test(
      lower
    )
  ) {
    if (/model/.test(lower)) {
      return new ProviderError(
        "model_unavailable",
        text || `Model is unavailable for ${provider}.`,
        provider,
        status,
        false
      );
    }

    return new ProviderError(
      "not_found",
      text || `Endpoint or resource not found (${status}).`,
      provider,
      status,
      false
    );
  }

  if (status === 400) {
    if (/model/.test(lower)) {
      return new ProviderError(
        "model_unavailable",
        text || `Model is unavailable for ${provider}.`,
        provider,
        status,
        false
      );
    }

    return new ProviderError(
      "bad_request",
      text || "Bad request. The provider API format may be incompatible.",
      provider,
      status,
      false
    );
  }

  return new ProviderError(
    "unknown",
    text || `Unexpected provider error (${status}).`,
    provider,
    status,
    false
  );
}

export async function callProvider(
  config: ProviderConfig,
  messages: ChatMessage[],
  settings: GenerationSettings
): Promise<{ text: string; model: string }> {
  if (!config.apiKey) {
    throw new ProviderError("auth", "API key is missing.", config.name);
  }

  const payload = {
    model: config.model,
    messages,
    temperature: settings.temperature ?? 0.2,
    max_tokens: settings.maxTokens ?? 1800,
    top_p: settings.topP ?? 0.9,
    stream: false,
  };

  const response = await fetchWithTimeout(
    config.chatUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
    },
    config.timeoutMs,
    config.name
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw classifyHttpError(response.status, text, config.name);
  }

  const data = await response.json().catch(() => null);

  const text =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    data?.content;

  if (typeof text !== "string" || text.trim().length === 0) {
    throw new ProviderError(
      "format",
      "Provider returned an unexpected response format.",
      config.name
    );
  }

  return {
    text,
    model: data?.model || config.model,
  };
}

export async function generateWithFailover(
  messages: ChatMessage[],
  settings: GenerationSettings,
  priority?: ProviderName[]
): Promise<ProviderResult> {
  const configs = getProviderConfigs().filter((config) => config.enabled);

  if (configs.length === 0) {
    throw new AllProvidersError(
      [],
      ["No AI provider is configured. Set at least one provider API key."]
    );
  }

  const order: ProviderName[] = priority?.length
    ? priority
    : ["groq", "gemini", "kilo"];

  const ordered: ProviderConfig[] = [];

  for (const name of order) {
    const config = configs.find((c) => c.name === name);
    if (config) ordered.push(config);
  }

  for (const config of configs) {
    if (!ordered.includes(config)) ordered.push(config);
  }

  const attempts: { provider: ProviderName; code: string; message: string }[] =
    [];
  const warnings: string[] = [];

  for (const config of ordered) {
    for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
      try {
        const result = await callProvider(config, messages, settings);

        return {
          text: result.text,
          provider: config.name,
          model: result.model,
          attempts,
          warnings,
        };
      } catch (error) {
        const providerError =
          error instanceof ProviderError
            ? error
            : new ProviderError(
                "unknown",
                error instanceof Error ? error.message : String(error),
                config.name
              );

        attempts.push({
          provider: config.name,
          code: providerError.code,
          message: providerError.message,
        });

        const transient = [
          "rate_limit",
          "server",
          "timeout",
          "network",
        ].includes(providerError.code);

        if (!transient) {
          if (providerError.code === "auth") {
            warnings.push(`${config.label}: invalid or missing API key.`);
          }

          if (providerError.code === "model_unavailable") {
            warnings.push(
              `${config.label}: model ${config.model} is unavailable. No substitution was made.`
            );
          }

          if (providerError.code === "not_found") {
            warnings.push(
              `${config.label}: endpoint or model not found. Verify provider base URL and docs.`
            );
          }

          if (
            providerError.code === "bad_request" ||
            providerError.code === "format"
          ) {
            warnings.push(
              `${config.label}: request/response format incompatible. Verify provider API compatibility.`
            );
          }

          break;
        }

        if (attempt < config.maxRetries) {
          await sleep(500 * (attempt + 1));
          continue;
        }

        warnings.push(`${config.label}: ${providerError.message}`);
        break;
      }
    }
  }

  throw new AllProvidersError(attempts, warnings);
}

async function listModelIds(config: ProviderConfig) {
  const url = joinUrl(config.baseUrl, "models");

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: "application/json",
        },
      },
      Math.min(config.timeoutMs, 10000),
      config.name
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const error = classifyHttpError(response.status, text, config.name);
      return { ids: null as string[] | null, error };
    }

    const data = await response.json().catch(() => null);

    const ids: string[] = Array.isArray(data?.data)
      ? data.data
          .map((item: any) => (typeof item === "string" ? item : item?.id))
          .filter(Boolean)
      : Array.isArray(data?.models)
        ? data.models
            .map((item: any) => (typeof item === "string" ? item : item?.id))
            .filter(Boolean)
        : [];

    return { ids, error: null as ProviderError | null };
  } catch (error) {
    return {
      ids: null as string[] | null,
      error:
        error instanceof ProviderError
          ? error
          : new ProviderError(
              "unknown",
              error instanceof Error ? error.message : String(error),
              config.name
            ),
    };
  }
}

function toStatus(
  config: ProviderConfig,
  modelAvailable: ProviderStatus["modelAvailable"],
  message?: string
): ProviderStatus {
  return {
    name: config.name,
    label: config.label,
    enabled: config.enabled,
    hasKey: Boolean(config.apiKey),
    baseUrl: config.baseUrl,
    chatUrl: config.chatUrl,
    model: config.model,
    modelAvailable,
    message,
    lastCheck: new Date().toISOString(),
  };
}

async function checkProvider(config: ProviderConfig): Promise<ProviderStatus> {
  if (!config.enabled) {
    return toStatus(config, "not_checked", config.reason);
  }

  const list = await listModelIds(config);

  if (list.error?.code === "auth") {
    return toStatus(config, "error", "Invalid or unauthorized API key.");
  }

  if (list.ids && list.ids.length > 0) {
    if (list.ids.includes(config.model)) {
      return toStatus(config, "available");
    }

    return toStatus(
      config,
      "unavailable",
      `Model ${config.model} is not listed by the provider. No substitution was made.`
    );
  }

  try {
    await callProvider(
      config,
      [{ role: "user", content: "Reply with exactly: OK" }],
      { temperature: 0, maxTokens: 1, topP: 1 }
    );

    return toStatus(config, "available");
  } catch (error) {
    const providerError =
      error instanceof ProviderError
        ? error
        : new ProviderError(
            "unknown",
            error instanceof Error ? error.message : String(error),
            config.name
          );

    if (providerError.code === "model_unavailable") {
      return toStatus(
        config,
        "unavailable",
        `Model ${config.model} is unavailable. No substitution was made.`
      );
    }

    if (providerError.code === "auth") {
      return toStatus(config, "error", "Invalid or unauthorized API key.");
    }

    if (providerError.code === "rate_limit") {
      return toStatus(config, "error", "Rate limited during status probe.");
    }

    if (providerError.code === "not_found") {
      return toStatus(
        config,
        "unknown",
        "Chat endpoint or model returned 404. Verify provider base URL and official docs."
      );
    }

    if (
      providerError.code === "bad_request" ||
      providerError.code === "format"
    ) {
      return toStatus(
        config,
        "unknown",
        `Provider probe failed: ${providerError.message}. Verify official API compatibility.`
      );
    }

    return toStatus(config, "error", providerError.message);
  }
}

type StatusCache = {
  at: number;
  statuses: ProviderStatus[];
};

export async function getProviderStatuses(force = false) {
  const globalCache = (globalThis as any).__znotesProviderStatus as
    | StatusCache
    | undefined;

  if (!force && globalCache && Date.now() - globalCache.at < 60_000) {
    return globalCache.statuses;
  }

  const configs = getProviderConfigs();
  const statuses = await Promise.all(configs.map(checkProvider));

  (globalThis as any).__znotesProviderStatus = {
    at: Date.now(),
    statuses,
  };

  return statuses;
}
