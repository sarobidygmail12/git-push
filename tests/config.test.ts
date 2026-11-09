import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { redactApiKeys } from "../src/core/config/apiKeys.js";
import { ensureGlobalConfig, loadConfig, OWNER_ONLY_FILE_MODE } from "../src/core/config/loadConfig.js";
import { setConfigValue } from "../src/core/config/saveConfig.js";
import { DEFAULT_CONFIG, describeConfigOptions } from "../src/core/config/schema.js";
import { ConfigError } from "../src/core/errors.js";

const PERMISSION_BITS = 0o777;
const WORLD_READABLE_MODE = 0o644;

describe("configuration", () => {
  let directory: string;
  let globalPath: string;
  let repoPath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "gitpilot-config-"));
    globalPath = join(directory, "nested", "config.json");
    repoPath = join(directory, ".gitpilot.json");
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  const writeJson = (path: string, content: object): void => writeFileSync(path, JSON.stringify(content));
  const permissionsOf = (path: string): number => statSync(path).mode & PERMISSION_BITS;

  it("crée le fichier global avec les valeurs par défaut", async () => {
    await ensureGlobalConfig(globalPath);
    expect(await loadConfig({ globalPath })).toEqual(DEFAULT_CONFIG);
  });

  it("n'écrase jamais un fichier global existant", async () => {
    await ensureGlobalConfig(globalPath);
    await setConfigValue({ scope: "global", path: globalPath }, "commit.autoPush", "false");
    await ensureGlobalConfig(globalPath);
    expect((await loadConfig({ globalPath })).commit.autoPush).toBe(false);
  });

  it("complète un fichier partiel avec les valeurs par défaut", async () => {
    await ensureGlobalConfig(globalPath);
    writeJson(globalPath, { commit: { convention: "free" } });
    const config = await loadConfig({ globalPath });
    expect(config.commit.convention).toBe("free");
    expect(config.commit.addAll).toBe(true);
  });

  it("accepte un ancien fichier qui contient encore commit.language", async () => {
    await ensureGlobalConfig(globalPath);
    writeJson(globalPath, { commit: { language: "fr" } });
    expect((await loadConfig({ globalPath })).commit).toEqual(DEFAULT_CONFIG.commit);
  });

  it("laisse le fichier du dépôt surcharger le global et remplace les tableaux", async () => {
    await ensureGlobalConfig(globalPath);
    writeJson(repoPath, { branches: { develop: "dev", protected: ["release"] } });
    const config = await loadConfig({ globalPath, repoPath });
    expect(config.branches.develop).toBe("dev");
    expect(config.branches.main).toBe("main");
    expect(config.branches.protected).toEqual(["release"]);
  });

  it("rejette une clé inconnue, donc toute clé API écrite en clair", async () => {
    await ensureGlobalConfig(globalPath);
    writeJson(globalPath, { ai: { groq: { apiKey: "secret" } } });
    await expect(loadConfig({ globalPath })).rejects.toBeInstanceOf(ConfigError);
  });

  it("signale un JSON invalide avec le chemin du fichier", async () => {
    await ensureGlobalConfig(globalPath);
    writeFileSync(globalPath, "{ pas du json");
    await expect(loadConfig({ globalPath })).rejects.toThrow(globalPath);
  });

  it.each([
    ["ai.ollama.baseUrl", { ai: { ollama: { baseUrl: "https://evil.test" } } }],
    ["ai.groq.apiKeyEnv", { ai: { groq: { apiKeyEnv: "AWS_SECRET_ACCESS_KEY" } } }],
  ])("interdit %s dans le fichier du dépôt", async (key, content) => {
    await ensureGlobalConfig(globalPath);
    writeJson(repoPath, content);
    await expect(loadConfig({ globalPath, repoPath })).rejects.toThrow(key);
  });

  it("convertit les valeurs de /config set selon leur type", async () => {
    await ensureGlobalConfig(globalPath);
    const target = { scope: "global", path: globalPath } as const;
    await setConfigValue(target, "web.port", "5000");
    await setConfigValue(target, "branches.protected", '["a","b"]');
    await setConfigValue(target, "ai.provider", "ollama");
    const config = await loadConfig({ globalPath });
    expect(config.web.port).toBe(Number("5000"));
    expect(config.branches.protected).toEqual(["a", "b"]);
    expect(config.ai.provider).toBe("ollama");
  });

  it("laisse le fichier intact si /config set produit une config invalide", async () => {
    await ensureGlobalConfig(globalPath);
    const before = readFileSync(globalPath, "utf8");
    await expect(
      setConfigValue({ scope: "global", path: globalPath }, "ai.provider", "inconnu"),
    ).rejects.toBeInstanceOf(ConfigError);
    expect(readFileSync(globalPath, "utf8")).toBe(before);
  });

  it("accepte une clé API dans apiKeyEnv du fichier global et la masque à l'affichage", async () => {
    await ensureGlobalConfig(globalPath);
    const pastedKey = "gsk_AbCdEfGh123";
    await setConfigValue({ scope: "global", path: globalPath }, "ai.groq.apiKeyEnv", pastedKey);

    const config = await loadConfig({ globalPath });
    expect(config.ai.groq.apiKeyEnv).toBe(pastedKey);
    expect(JSON.stringify(redactApiKeys(config))).not.toContain(pastedKey);
  });

  it("rend le fichier global lisible par son seul propriétaire, même s'il existait déjà", async () => {
    await ensureGlobalConfig(globalPath);
    chmodSync(globalPath, WORLD_READABLE_MODE);

    await ensureGlobalConfig(globalPath);
    expect(permissionsOf(globalPath)).toBe(OWNER_ONLY_FILE_MODE);

    await setConfigValue({ scope: "global", path: globalPath }, "ai.groq.apiKeyEnv", "gsk_AbCd123");
    expect(permissionsOf(globalPath)).toBe(OWNER_ONLY_FILE_MODE);
  });

  it("n'altère pas un nom de variable à l'affichage", () => {
    expect(redactApiKeys(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG);
  });

  it("refuse un chemin qui viserait le prototype", async () => {
    await ensureGlobalConfig(globalPath);
    await expect(
      setConfigValue({ scope: "global", path: globalPath }, "__proto__.polluted", "true"),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it("documente chaque option depuis le schéma", () => {
    const paths = describeConfigOptions().map((option) => option.path);
    expect(paths).toContain("commit.autoPush");
    expect(paths).toContain("ai.groq.apiKeyEnv");
  });
});
