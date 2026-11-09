import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configCommand } from "../src/commands/config.js";
import type { CommandContext } from "../src/commands/types.js";
import { ensureGlobalConfig, loadConfig } from "../src/core/config/loadConfig.js";
import { createFakeContext, type FakeAnswers } from "./helpers/fakeContext.js";

describe("/config en liste navigable", () => {
  let directory: string;
  let globalPath: string;
  let repoPath: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "git-push-browse-"));
    globalPath = join(directory, "config.json");
    repoPath = join(directory, ".git-push.json");
    await ensureGlobalConfig(globalPath);
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  const contextWith = (answers: FakeAnswers): CommandContext => {
    const ctx = createFakeContext(directory, answers);
    ctx.paths = { global: globalPath, repo: repoPath };
    return ctx;
  };
  const browse = (answers: FakeAnswers, args: string[] = []): Promise<void> => configCommand.run(contextWith(answers), args);
  const saved = () => loadConfig({ globalPath, repoPath });

  it("Entrée sur une option modifie sa valeur dans le fichier global", async () => {
    await browse({ select: ["commit.convention"], ask: ["free"] });
    expect((await saved()).commit.convention).toBe("free");
  });

  it("enchaîne plusieurs modifications avant de quitter", async () => {
    await browse({ select: ["commit.convention", "branches.preprod"], ask: ["free", "staging"] });
    const config = await saved();
    expect(config.commit.convention).toBe("free");
    expect(config.branches.preprod).toBe("staging");
  });

  it("convertit la saisie selon le type de l'option", async () => {
    await browse({ select: ["commit.autoPush", "branches.protected"], ask: ["false", '["a","b"]'] });
    const config = await saved();
    expect(config.commit.autoPush).toBe(false);
    expect(config.branches.protected).toEqual(["a", "b"]);
  });

  it("garde en texte une option texte dont la valeur ressemble à un nombre", async () => {
    await browse({ select: ["branches.main"], ask: ["123"] });
    expect((await saved()).branches.main).toBe("123");
  });

  it("n'écrit rien si la saisie est annulée ou inchangée", async () => {
    const before = readFileSync(globalPath, "utf8");
    await browse({ select: ["commit.convention", "branches.main"], ask: [undefined, "main"] as string[] });
    expect(readFileSync(globalPath, "utf8")).toBe(before);
  });

  it("signale une valeur invalide, laisse le fichier intact et revient à la liste", async () => {
    const before = readFileSync(globalPath, "utf8");
    const ctx = contextWith({ select: ["ai.provider", "commit.convention"], ask: ["inconnu", "free"] });
    await configCommand.run(ctx, []);

    expect(ctx.ui.log).toHaveBeenCalledWith(expect.stringContaining("ai.provider"), "error");
    expect(before).not.toContain('"convention": "free"');
    expect((await saved()).ai.provider).toBe("groq");
    expect((await saved()).commit.convention).toBe("free");
  });

  it("modifie dans le dépôt une option que le dépôt définit déjà", async () => {
    writeFileSync(repoPath, JSON.stringify({ branches: { preprod: "staging" } }));
    const before = readFileSync(globalPath, "utf8");
    await browse({ select: ["branches.preprod"], ask: ["recette"] });

    expect((await saved()).branches.preprod).toBe("recette");
    expect(readFileSync(globalPath, "utf8")).toBe(before);
  });

  it("--repo écrit dans le fichier du dépôt", async () => {
    const before = readFileSync(globalPath, "utf8");
    await browse({ select: ["branches.develop"], ask: ["dev"] }, ["--repo"]);

    expect((await saved()).branches.develop).toBe("dev");
    expect(readFileSync(globalPath, "utf8")).toBe(before);
  });

  it("/config show affiche encore le JSON sans rien demander", async () => {
    const ctx = contextWith({});
    await configCommand.run(ctx, ["show"]);
    expect(ctx.ui.log).toHaveBeenCalledWith(expect.stringContaining('"develop": "develop"'));
  });
});
