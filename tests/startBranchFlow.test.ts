import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fixCommand } from "../src/commands/fix.js";
import { hotfixCommand } from "../src/commands/hotfix.js";
import type { CommandContext } from "../src/commands/types.js";
import { loadConfig, REPO_CONFIG_FILENAME } from "../src/core/config/loadConfig.js";
import { DEFAULT_CONFIG, type Config } from "../src/core/config/schema.js";
import { createFakeContext, type FakeAnswers } from "./helpers/fakeContext.js";
import { createTempRepo, type TempRepo } from "./helpers/tempRepo.js";

const MISSING_BASE = "absente";

describe("branche de base absente de /fix et /hotfix", () => {
  let repo: TempRepo;

  beforeEach(() => {
    repo = createTempRepo();
  });
  afterEach(() => repo.cleanup());

  const repoConfig = (): string => join(repo.work, REPO_CONFIG_FILENAME);
  const globalConfig = (): string => join(repo.root, "config.json");
  const savedConfig = (): Promise<Config> => loadConfig({ globalPath: globalConfig(), repoPath: repoConfig() });
  const currentBranch = (): string => repo.git("branch", "--show-current");

  const pushBranch = (branch: string): void => {
    repo.git("switch", "--quiet", "-c", branch);
    repo.git("push", "--quiet", "-u", "origin", branch);
    repo.git("switch", "--quiet", "main");
  };

  const contextWith = (answers: FakeAnswers, branches: Partial<Config["branches"]>): CommandContext => {
    const ctx = createFakeContext(repo.work, answers, { ...DEFAULT_CONFIG, branches: { ...DEFAULT_CONFIG.branches, ...branches } });
    ctx.paths = { global: globalConfig(), repo: repoConfig() };
    return ctx;
  };

  it("/fix demande la base, part de celle-ci et l'enregistre dans le dépôt", async () => {
    pushBranch("staging");
    await fixCommand.run(contextWith({ ask: "staging" }, { preprod: MISSING_BASE }), ["bug"]);

    expect(currentBranch()).toBe("fix/bug");
    expect(repo.git("rev-parse", "HEAD")).toBe(repo.git("rev-parse", "staging"));
    expect((await savedConfig()).branches.preprod).toBe("staging");
  });

  it("/hotfix enregistre la base dans branches.develop", async () => {
    pushBranch("dev");
    await hotfixCommand.run(contextWith({ ask: "dev" }, { develop: MISSING_BASE }), ["panier"]);

    expect(currentBranch()).toBe("hotfix/panier");
    expect((await savedConfig()).branches.develop).toBe("dev");
  });

  it("garde le working tree propre après l'enregistrement", async () => {
    pushBranch("staging");
    await fixCommand.run(contextWith({ ask: "staging" }, { preprod: MISSING_BASE }), ["bug"]);

    expect(existsSync(repoConfig())).toBe(true);
    expect(repo.git("status", "--porcelain")).toBe("");
  });

  it("enregistre un nom de branche numérique comme une chaîne", async () => {
    pushBranch("123");
    await fixCommand.run(contextWith({ ask: "123" }, { preprod: MISSING_BASE }), ["bug"]);

    expect((await savedConfig()).branches.preprod).toBe("123");
  });

  it("ne demande rien et n'écrit rien quand la base configurée existe", async () => {
    await fixCommand.run(contextWith({ ask: "ne-doit-pas-servir" }, {}), ["bug"]);

    expect(repo.git("rev-parse", "HEAD")).toBe(repo.git("rev-parse", "preprod"));
    expect(existsSync(repoConfig())).toBe(false);
  });

  it("annule sans rien créer si aucun nom n'est saisi", async () => {
    await fixCommand.run(contextWith({ ask: "  " }, { preprod: MISSING_BASE }), ["bug"]);

    expect(currentBranch()).toBe("main");
    expect(existsSync(repoConfig())).toBe(false);
  });

  it("refuse une base saisie inexistante sans l'enregistrer", async () => {
    const ctx = contextWith({ ask: "inconnue" }, { preprod: MISSING_BASE });

    await expect(fixCommand.run(ctx, ["bug"])).rejects.toThrow("n'existe pas");
    expect(currentBranch()).toBe("main");
    expect(existsSync(repoConfig())).toBe(false);
  });
});
