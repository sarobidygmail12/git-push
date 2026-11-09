import type { Config } from "./schema.js";

const VISIBLE_KEY_PREFIX_LENGTH = 4;

/** Une clé API mêle majuscules et minuscules, contrairement à un nom de variable d'environnement. */
export function looksLikeApiKey(value: string): boolean {
  return value !== value.toUpperCase() && value !== value.toLowerCase();
}

function maskIfApiKey(value: string): string {
  return looksLikeApiKey(value) ? `${value.slice(0, VISIBLE_KEY_PREFIX_LENGTH)}… (masquée)` : value;
}

/** À appliquer avant tout affichage : une clé écrite dans `apiKeyEnv` ne doit apparaître ni au terminal ni dans le navigateur. */
export function redactApiKeys(config: Config): Config {
  const { groq, gemini } = config.ai;
  return {
    ...config,
    ai: {
      ...config.ai,
      groq: { ...groq, apiKeyEnv: maskIfApiKey(groq.apiKeyEnv) },
      gemini: { ...gemini, apiKeyEnv: maskIfApiKey(gemini.apiKeyEnv) },
    },
  };
}
