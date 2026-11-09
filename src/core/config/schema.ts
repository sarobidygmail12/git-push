import { z } from "zod";
import { isMessageKey, LANGUAGES, t } from "../../lang/index.js";

const MAX_TCP_PORT = 65535;
const DEFAULT_WEB_PORT = 4517;

// Chaque motif devient une ligne de .git/info/exclude : un saut de ligne en créerait d'autres.
const isSingleLine = (pattern: string): boolean => !pattern.includes("\n") && !pattern.includes("\r");

export const providerNameSchema = z.enum(["groq", "gemini", "ollama", "fallback"]);

const cloudProviderSchema = z.strictObject({
  apiKeyEnv: z.string().min(1),
  model: z.string().min(1),
});

export const configSchema = z.strictObject({
  branches: z.strictObject({
    develop: z.string().min(1),
    preprod: z.string().min(1),
    main: z.string().min(1),
    protected: z.array(z.string().min(1)),
  }),
  prefixes: z.strictObject({
    hotfix: z.string(),
    fix: z.string(),
  }),
  commit: z.strictObject({
    convention: z.enum(["conventional", "free"]),
    autoPush: z.boolean(),
    addAll: z.boolean(),
  }),
  ignore: z
    .array(z.string().min(1).refine(isSingleLine, { error: () => t("config.issueSingleLine") })),
  ai: z.strictObject({
    provider: providerNameSchema,
    fallbackOrder: z.array(providerNameSchema),
    groq: cloudProviderSchema,
    gemini: cloudProviderSchema,
    ollama: z.strictObject({
      baseUrl: z.url(),
      model: z.string().min(1),
    }),
  }),
  language: z.enum(LANGUAGES),
  web: z.strictObject({
    port: z.number().int().min(1).max(MAX_TCP_PORT),
  }),
});

export type Config = z.infer<typeof configSchema>;
export type ProviderName = z.infer<typeof providerNameSchema>;

export const DEFAULT_CONFIG: Config = {
  branches: { develop: "develop", preprod: "preprod", main: "main", protected: ["main", "preprod"] },
  prefixes: { hotfix: "hotfix/", fix: "fix/" },
  commit: { convention: "conventional", autoPush: true, addAll: true },
  ignore: [],
  language: "en",
  ai: {
    provider: "groq",
    fallbackOrder: ["groq", "gemini", "ollama", "fallback"],
    groq: { apiKeyEnv: "GROQ_API_KEY", model: "openai/gpt-oss-20b" },
    gemini: { apiKeyEnv: "GEMINI_API_KEY", model: "gemini-3.8-flash" },
    ollama: { baseUrl: "http://localhost:11434", model: "qwen2.5-coder" },
  },
  web: { port: DEFAULT_WEB_PORT },
};

export type ConfigOptionDoc = { path: string; type: string; description: string };

/** Génère la documentation des options depuis le schéma, pour ne rien dupliquer à la main. */
export function describeConfigOptions(): ConfigOptionDoc[] {
  return collectOptions(z.toJSONSchema(configSchema), "");
}

type SchemaNode = z.core.JSONSchema.BaseSchema;

function collectOptions(node: SchemaNode, path: string): ConfigOptionDoc[] {
  if (node.properties) {
    return Object.entries(node.properties).flatMap(([key, child]) =>
      typeof child === "boolean" ? [] : collectOptions(child, path ? `${path}.${key}` : key),
    );
  }
  return [{ path, type: describeType(node), description: describeOption(path) }];
}

function describeOption(path: string): string {
  const key = [`option.${path}`, `option.${path.split(".").at(-1) ?? ""}`].find(isMessageKey);
  return key ? t(key) : "";
}

function describeType(node: SchemaNode): string {
  if (node.enum) return node.enum.join(" | ");
  if (node.type === "array") return t("option.typeList");
  return typeof node.type === "string" ? node.type : t("option.typeValue");
}
