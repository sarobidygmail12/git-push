import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ConfigError } from "../errors.js";
import {
  assertRepoOverrideAllowed,
  isJsonObject,
  mergeDeep,
  readJsonObject,
  serializeConfig,
  toJsonObject,
  validateConfig,
  type JsonObject,
} from "./loadConfig.js";
import { DEFAULT_CONFIG } from "./schema.js";

const UNSAFE_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

export type ConfigTarget =
  | { scope: "global"; path: string }
  | { scope: "repo"; path: string; globalPath: string };

/** Valide le résultat avant d'écrire : un `set` invalide laisse le fichier intact. */
export async function setConfigValue(target: ConfigTarget, dottedPath: string, rawValue: string): Promise<void> {
  const file = (await readJsonObject(target.path)) ?? {};
  const updated = withValueAt(file, parseSegments(dottedPath, target.path), parseValue(rawValue));
  await assertValid(target, updated);
  await writeAtomically(target.path, updated);
}

async function assertValid(target: ConfigTarget, updated: JsonObject): Promise<void> {
  const defaults = toJsonObject(DEFAULT_CONFIG);
  if (target.scope === "global") {
    validateConfig(mergeDeep(defaults, updated), target.path);
    return;
  }
  assertRepoOverrideAllowed(updated, target.path);
  const globalFile = (await readJsonObject(target.globalPath)) ?? {};
  validateConfig(mergeDeep(mergeDeep(defaults, globalFile), updated), target.path);
}

function parseSegments(dottedPath: string, sourcePath: string): string[] {
  const segments = dottedPath.split(".");
  if (segments.some((segment) => segment === "" || UNSAFE_SEGMENTS.has(segment))) {
    throw new ConfigError(sourcePath, [`chemin invalide : ${dottedPath}`]);
  }
  return segments;
}

/** `true`, `12` ou `["a"]` sont lus comme du JSON ; le reste est une chaîne. */
function parseValue(rawValue: string): unknown {
  try {
    const parsed: unknown = JSON.parse(rawValue);
    return parsed;
  } catch {
    return rawValue;
  }
}

function withValueAt(object: JsonObject, [head, ...rest]: string[], value: unknown): JsonObject {
  if (head === undefined) return object;
  if (rest.length === 0) return { ...object, [head]: value };
  const child = object[head];
  return { ...object, [head]: withValueAt(isJsonObject(child) ? child : {}, rest, value) };
}

async function writeAtomically(path: string, content: JsonObject): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, serializeConfig(content));
  await rename(temporaryPath, path);
}
