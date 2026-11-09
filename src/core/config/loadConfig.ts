import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { ConfigError } from "../errors.js";
import { configSchema, DEFAULT_CONFIG, type Config } from "./schema.js";

export type JsonObject = { [key: string]: unknown };

const JSON_INDENT = 2;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const REPO_CONFIG_FILENAME = ".gitpilot.json";

export function globalConfigPath(home: string = homedir()): string {
  return join(home, ".gitpilot", "config.json");
}

export function repoConfigPath(repoRoot: string): string {
  return join(repoRoot, REPO_CONFIG_FILENAME);
}

export async function ensureGlobalConfig(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeConfig(DEFAULT_CONFIG), { flag: "wx" }).catch(ignoreAlreadyExists);
}

export async function loadConfig(paths: { globalPath: string; repoPath?: string | undefined }): Promise<Config> {
  const globalFile = await readJsonObject(paths.globalPath);
  const globalConfig = validateConfig(mergeDeep(toJsonObject(DEFAULT_CONFIG), globalFile ?? {}), paths.globalPath);
  if (!paths.repoPath) return globalConfig;

  const repoFile = await readJsonObject(paths.repoPath);
  if (!repoFile) return globalConfig;
  assertRepoOverrideAllowed(repoFile, paths.repoPath);
  return validateConfig(mergeDeep(toJsonObject(globalConfig), repoFile), paths.repoPath);
}

export async function readJsonObject(path: string): Promise<JsonObject | undefined> {
  const text = await readFile(path, "utf8").catch(undefinedIfMissing);
  if (text === undefined) return undefined;
  const parsed = parseJson(text, path);
  if (!isJsonObject(parsed)) throw new ConfigError(path, ["le fichier doit contenir un objet JSON"]);
  return parsed;
}

export function validateConfig(candidate: unknown, sourcePath: string): Config {
  const result = configSchema.safeParse(withoutRetiredOptions(candidate));
  if (result.success) return result.data;
  throw new ConfigError(
    sourcePath,
    result.error.issues.map((issue) => `${issue.path.join(".") || "(racine)"} : ${issue.message}`),
  );
}

/** `commit.language` n'existe plus, les messages sont toujours en anglais : un ancien fichier qui la contient reste valide. */
function withoutRetiredOptions(candidate: unknown): unknown {
  if (!isJsonObject(candidate) || !isJsonObject(candidate["commit"])) return candidate;
  const { language: _retired, ...commit } = candidate["commit"];
  return { ...candidate, commit };
}

/** Un dépôt cloné ne doit pas pouvoir rediriger les diffs ni choisir la variable d'environnement lue. */
export function assertRepoOverrideAllowed(repoFile: JsonObject, repoPath: string): void {
  const forbidden = forbiddenRepoKeys(repoFile);
  if (forbidden.length > 0) {
    throw new ConfigError(
      repoPath,
      forbidden.map((key) => `${key} : réglable uniquement dans la configuration globale`),
    );
  }
}

function forbiddenRepoKeys(repoFile: JsonObject): string[] {
  const ai = repoFile["ai"];
  if (!isJsonObject(ai)) return [];
  return Object.entries(ai).flatMap(([provider, settings]) =>
    isJsonObject(settings)
      ? Object.keys(settings)
          .filter((key) => key === "apiKeyEnv" || key === "baseUrl")
          .map((key) => `ai.${provider}.${key}`)
      : [],
  );
}

export function mergeDeep(base: JsonObject, override: JsonObject): JsonObject {
  const mergedEntries = Object.entries(override)
    .filter(([key]) => !UNSAFE_KEYS.has(key))
    .map(([key, value]): [string, unknown] => {
      const current = base[key];
      return [key, isJsonObject(current) && isJsonObject(value) ? mergeDeep(current, value) : value];
    });
  return { ...base, ...Object.fromEntries(mergedEntries) };
}

export function serializeConfig(content: object): string {
  return `${JSON.stringify(content, null, JSON_INDENT)}\n`;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toJsonObject(config: Config): JsonObject {
  return { ...config };
}

function parseJson(text: string, path: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error) {
    throw new ConfigError(path, [`JSON invalide : ${error instanceof Error ? error.message : String(error)}`]);
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function undefinedIfMissing(error: unknown): undefined {
  if (hasErrorCode(error, "ENOENT")) return undefined;
  throw error;
}

function ignoreAlreadyExists(error: unknown): void {
  if (!hasErrorCode(error, "EEXIST")) throw error;
}
