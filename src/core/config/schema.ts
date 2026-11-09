import { z } from "zod";

const MAX_TCP_PORT = 65535;
const DEFAULT_WEB_PORT = 4517;

// Chaque motif devient une ligne de .git/info/exclude : un saut de ligne en créerait d'autres.
const isSingleLine = (pattern: string): boolean => !pattern.includes("\n") && !pattern.includes("\r");

export const providerNameSchema = z.enum(["groq", "gemini", "ollama", "fallback"]);

const cloudProviderSchema = z.strictObject({
  apiKeyEnv: z.string().min(1).describe("Clé API, ou nom de la variable d'environnement qui la contient"),
  model: z.string().min(1).describe("Modèle utilisé"),
});

export const configSchema = z.strictObject({
  branches: z.strictObject({
    develop: z.string().min(1).describe("Branche de base de /hotfix"),
    preprod: z.string().min(1).describe("Branche de base de /fix"),
    main: z.string().min(1).describe("Branche de production"),
    protected: z.array(z.string().min(1)).describe("Branches qui demandent une confirmation avant un commit"),
  }),
  prefixes: z.strictObject({
    hotfix: z.string().describe("Préfixe des branches créées par /hotfix"),
    fix: z.string().describe("Préfixe des branches créées par /fix"),
  }),
  commit: z.strictObject({
    convention: z.enum(["conventional", "free"]).describe("Format des messages générés"),
    autoPush: z.boolean().describe("Pousser automatiquement après un commit"),
    addAll: z.boolean().describe("Indexer toutes les modifications avant un commit"),
  }),
  ignore: z
    .array(z.string().min(1).refine(isSingleLine, "un motif doit tenir sur une ligne"))
    .describe('Fichiers que Git doit ignorer, sans .gitignore. Exemple : ["dist/","*.log"]'),
  ai: z.strictObject({
    provider: providerNameSchema.describe("Provider essayé en premier"),
    fallbackOrder: z.array(providerNameSchema).describe("Providers essayés ensuite, dans l'ordre"),
    groq: cloudProviderSchema,
    gemini: cloudProviderSchema,
    ollama: z.strictObject({
      baseUrl: z.url().describe("URL du serveur Ollama"),
      model: z.string().min(1).describe("Modèle utilisé"),
    }),
  }),
  web: z.strictObject({
    port: z.number().int().min(1).max(MAX_TCP_PORT).describe("Port du serveur local (/log et /help)"),
  }),
});

export type Config = z.infer<typeof configSchema>;
export type ProviderName = z.infer<typeof providerNameSchema>;

export const DEFAULT_CONFIG: Config = {
  branches: { develop: "develop", preprod: "preprod", main: "main", protected: ["main", "preprod"] },
  prefixes: { hotfix: "hotfix/", fix: "fix/" },
  commit: { convention: "conventional", autoPush: true, addAll: true },
  ignore: [],
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
  return [{ path, type: describeType(node), description: node.description ?? "" }];
}

function describeType(node: SchemaNode): string {
  if (node.enum) return node.enum.join(" | ");
  if (node.type === "array") return "liste";
  return typeof node.type === "string" ? node.type : "valeur";
}
