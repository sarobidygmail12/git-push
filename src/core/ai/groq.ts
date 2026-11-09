import { z } from "zod";
import { ProviderError } from "../errors.js";
import { postJson, readApiKey } from "./http.js";
import { buildPrompt } from "./prompt.js";
import type { CommitMessageProvider } from "./provider.js";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

export type GroqSettings = { apiKeyEnv: string; model: string };

export function createGroqProvider(settings: GroqSettings, env: NodeJS.ProcessEnv): CommitMessageProvider {
  return {
    name: "groq",
    async generate(input, signal) {
      const prompt = buildPrompt(input);
      const payload = await postJson("groq", {
        url: GROQ_CHAT_URL,
        headers: { authorization: `Bearer ${readApiKey("groq", settings.apiKeyEnv, env)}` },
        body: {
          model: settings.model,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
        },
        signal,
      });
      const parsed = responseSchema.safeParse(payload);
      if (!parsed.success) throw new ProviderError("groq", "invalid-response");
      return parsed.data.choices[0]?.message.content ?? "";
    },
  };
}
