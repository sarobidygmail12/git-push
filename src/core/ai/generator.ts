import type { Config } from "../config/schema.js";
import { ProviderError } from "../errors.js";
import { fallbackProvider } from "./fallback.js";
import { createGeminiProvider } from "./gemini.js";
import { createGroqProvider } from "./groq.js";
import { createOllamaProvider } from "./ollama.js";
import { sanitizeMessage } from "./prompt.js";
import type {
  CommitMessageGenerator,
  CommitMessageInput,
  CommitMessageProvider,
  GeneratedMessage,
  ProviderName,
} from "./provider.js";

export const PROVIDER_TIMEOUT_MS = 15_000;

/** `provider` d'abord, puis `fallbackOrder` ; `fallback` ferme toujours la chaîne pour ne jamais bloquer un commit. */
export function resolveProviderOrder(ai: Config["ai"]): ProviderName[] {
  return [...new Set<ProviderName>([ai.provider, ...ai.fallbackOrder, "fallback"])];
}

export function createProviders(ai: Config["ai"], env: NodeJS.ProcessEnv): Record<ProviderName, CommitMessageProvider> {
  return {
    groq: createGroqProvider(ai.groq, env),
    gemini: createGeminiProvider(ai.gemini, env),
    ollama: createOllamaProvider(ai.ollama),
    fallback: fallbackProvider,
  };
}

export function createCommitMessageGenerator(
  providers: readonly CommitMessageProvider[],
  timeoutMs: number = PROVIDER_TIMEOUT_MS,
): CommitMessageGenerator {
  return { generate: (input) => tryProviders(providers, input, timeoutMs, []) };
}

export function createGeneratorFromConfig(ai: Config["ai"], env: NodeJS.ProcessEnv): CommitMessageGenerator {
  const providers = createProviders(ai, env);
  return createCommitMessageGenerator(resolveProviderOrder(ai).map((name) => providers[name]));
}

async function tryProviders(
  providers: readonly CommitMessageProvider[],
  input: CommitMessageInput,
  timeoutMs: number,
  failures: readonly ProviderError[],
): Promise<GeneratedMessage> {
  const [provider, ...remaining] = providers;
  if (!provider) throw failures.at(-1) ?? new ProviderError("fallback", "unavailable", "aucun provider configuré");
  try {
    const message = await generateCleanMessage(provider, input, timeoutMs);
    return { message, provider: provider.name, failures };
  } catch (error) {
    return tryProviders(remaining, input, timeoutMs, [...failures, toProviderError(provider, error)]);
  }
}

async function generateCleanMessage(
  provider: CommitMessageProvider,
  input: CommitMessageInput,
  timeoutMs: number,
): Promise<string> {
  const message = sanitizeMessage(await provider.generate(input, AbortSignal.timeout(timeoutMs)));
  if (message === "") throw new ProviderError(provider.name, "invalid-response", "message vide");
  return message;
}

function toProviderError(provider: CommitMessageProvider, error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  return new ProviderError(provider.name, "unavailable", error instanceof Error ? error.message : String(error));
}
