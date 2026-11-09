import { z } from "zod";
import { ProviderError } from "../errors.js";
import { postJson } from "./http.js";
import { buildPrompt } from "./prompt.js";
import type { CommitMessageProvider } from "./provider.js";

const responseSchema = z.object({ message: z.object({ content: z.string() }) });

export type OllamaSettings = { baseUrl: string; model: string };

export function createOllamaProvider(settings: OllamaSettings): CommitMessageProvider {
  return {
    name: "ollama",
    async generate(input, signal) {
      const prompt = buildPrompt(input);
      const payload = await postJson("ollama", {
        url: new URL("/api/chat", settings.baseUrl).href,
        body: {
          model: settings.model,
          stream: false,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
        },
        signal,
      });
      const parsed = responseSchema.safeParse(payload);
      if (!parsed.success) throw new ProviderError("ollama", "invalid-response");
      return parsed.data.message.content;
    },
  };
}
