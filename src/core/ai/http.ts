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

export function readApiKey(provider: ProviderName, envName: string, env: NodeJS.ProcessEnv): string {
  const key = env[envName];
  if (!key) throw new ProviderError(provider, "missing-key", envName);
  return key;
}
