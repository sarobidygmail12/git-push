import { z } from "zod";
import { ProviderError } from "../errors.js";
import { postJson, readApiKey } from "./http.js";
import { buildPrompt } from "./prompt.js";
import type { CommitMessageProvider } from "./provider.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const responseSchema = z.object({
  candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string() })).min(1) }) })).min(1),
});

export type GeminiSettings = { apiKeyEnv: string; model: string };

export function createGeminiProvider(settings: GeminiSettings, env: NodeJS.ProcessEnv): CommitMessageProvider {
  return {
    name: "gemini",
    async generate(input, signal) {
      const prompt = buildPrompt(input);
      const payload = await postJson("gemini", {
        url: `${GEMINI_BASE_URL}/${encodeURIComponent(settings.model)}:generateContent`,
        // En en-tête plutôt que dans l'URL : la clé ne doit pas finir dans un message d'erreur.
        headers: { "x-goog-api-key": readApiKey("gemini", settings.apiKeyEnv, env) },
        body: {
          systemInstruction: { parts: [{ text: prompt.system }] },
          contents: [{ role: "user", parts: [{ text: prompt.user }] }],
        },
        signal,
      });
      const parsed = responseSchema.safeParse(payload);
      if (!parsed.success) throw new ProviderError("gemini", "invalid-response");
      return parsed.data.candidates[0]?.content.parts.map((part) => part.text).join("") ?? "";
    },
  };
}
