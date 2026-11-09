import { looksLikeApiKey } from "../config/apiKeys.js";
import { ProviderError } from "../errors.js";
import type { ProviderName } from "../config/schema.js";

const HTTP_TOO_MANY_REQUESTS = 429;

export type JsonRequest = {
  url: string;
  headers?: Record<string, string>;
  body: object;
  signal: AbortSignal;
};

export async function postJson(provider: ProviderName, request: JsonRequest): Promise<unknown> {
  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...request.headers },
      body: JSON.stringify(request.body),
      signal: request.signal,
    });
    if (response.status === HTTP_TOO_MANY_REQUESTS) throw new ProviderError(provider, "quota");
    if (!response.ok) throw new ProviderError(provider, "unavailable", `HTTP ${response.status}`);
    const payload: unknown = await response.json();
    return payload;
  } catch (error) {
    throw toProviderError(provider, error);
  }
}

function toProviderError(provider: ProviderName, error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Error && error.name === "TimeoutError") return new ProviderError(provider, "timeout");
  return new ProviderError(provider, "unavailable", error instanceof Error ? error.message : String(error));
}

/** `apiKeyEnv` contient le nom d'une variable d'environnement, ou directement la clé. */
export function readApiKey(provider: ProviderName, keySource: string, env: NodeJS.ProcessEnv): string {
  if (looksLikeApiKey(keySource)) return keySource;
  const key = env[keySource];
  if (!key) throw new ProviderError(provider, "missing-key", keySource);
  return key;
}
