import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rebaseCommand } from "../src/commands/rebase.js";
import { DEFAULT_CONFIG } from "../src/core/config/schema.js";
import { createFakeContext, type FakeAnswers } from "./helpers/fakeContext.js";
import { createTempRepo, type TempRepo } from "./helpers/tempRepo.js";

describe("/rebase", () => {
  let repo: TempRepo;

  beforeEach(() => {
    repo = createTempRepo();
  });
  afterEach(() => repo.cleanup());

  const head = (): string => repo.git("rev-parse", "HEAD");
  const parent = (): string => repo.git("rev-parse", "HEAD~1");
  const run = (answers: FakeAnswers, args: string[] = []): Promise<void> =>
    rebaseCommand.run(createFakeContext(repo.work, answers), args);

  /** Pousse un commit sur le remote en laissant la branche locale en retard. */
  const addRemoteCommit = (branch: string, file: string, content: string): string => {
    repo.git("switch", "--quiet", branch);
    repo.commit(file, content, `distant sur ${branch}`);
    repo.git("push", "--quiet");
    const remoteHead = head();
    repo.git("reset", "--quiet", "--hard", "HEAD~1");
    return remoteHead;
  };

  const startFeature = (file: string, content: string): void => {
    repo.git("switch", "--quiet", "-c", "feature/a", "main");
    repo.commit(file, content, "travail feature");
  };

  it("rebase sur la dernière version distante, même si la branche locale est en retard", async () => {
    const remoteHead = addRemoteCommit("develop", "remote.txt", "x\n");
    const staleDevelop = head();
    startFeature("feature.txt", "y\n");

    await run({}, ["develop"]);

    expect(parent()).toBe(remoteHead);
    expect(repo.git("rev-parse", "develop")).toBe(staleDevelop);
  });

  it("propose le choix de la base quand aucune n'est donnée", async () => {
    const remoteHead = addRemoteCommit("preprod", "remote.txt", "x\n");
    startFeature("feature.txt", "y\n");

    await run({ select: "preprod" });

    expect(parent()).toBe(remoteHead);
  });

  it("restaure la branche si le conflit est annulé", async () => {
    addRemoteCommit("develop", "conflit.txt", "distant\n");
    startFeature("conflit.txt", "local\n");
    const before = head();

    await run({ select: "abort" }, ["develop"]);

    expect(head()).toBe(before);
    expect(repo.git("status", "--porcelain")).toBe("");
  });

  it("laisse le rebase en cours si le choix est fermé, puis le reprend", async () => {
    addRemoteCommit("develop", "conflit.txt", "distant\n");
    startFeature("conflit.txt", "local\n");
    const before = head();

    await run({}, ["develop"]);
    expect(repo.git("status")).toContain("rebase");

    await run({ select: "abort" });
    expect(head()).toBe(before);
  });

  it("ne force pas le push sans confirmation", async () => {
    addRemoteCommit("develop", "remote.txt", "x\n");
    startFeature("feature.txt", "y\n");
    repo.git("push", "--quiet", "-u", "origin", "feature/a");
    const pushedHead = head();

    await run({ confirm: false }, ["develop"]);

    expect(head()).not.toBe(pushedHead);
    expect(repo.git("rev-parse", "origin/feature/a")).toBe(pushedHead);
  });

  it("pousse avec --force-with-lease une fois confirmé", async () => {
    addRemoteCommit("develop", "remote.txt", "x\n");
    startFeature("feature.txt", "y\n");
    repo.git("push", "--quiet", "-u", "origin", "feature/a");

    await run({ confirm: true }, ["develop"]);

    expect(repo.git("rev-parse", "origin/feature/a")).toBe(head());
  });

  it("ne rebase pas si l'utilisateur renonce à sécuriser ses modifications", async () => {
    const remoteHead = addRemoteCommit("develop", "remote.txt", "x\n");
    startFeature("feature.txt", "y\n");
    repo.write("feature.txt", "en cours\n");

    await run({}, ["develop"]);

    expect(parent()).not.toBe(remoteHead);
    expect(repo.git("status", "--porcelain")).toContain("feature.txt");
  });

  it("met les modifications de côté avant de rebaser", async () => {
    const remoteHead = addRemoteCommit("develop", "remote.txt", "x\n");
    startFeature("feature.txt", "y\n");
    repo.write("feature.txt", "en cours\n");

    await run({ select: "stash" }, ["develop"]);

    expect(parent()).toBe(remoteHead);
    expect(repo.git("stash", "list")).toContain("gitpilot");
  });

  it("refuse une base hors de la liste", async () => {
    await expect(run({}, ["main"])).rejects.toThrow("Base inconnue");
  });

  it("refuse une branche protégée sans confirmation", async () => {
    const remoteHead = addRemoteCommit("develop", "remote.txt", "x\n");
    repo.git("switch", "--quiet", "main");
    repo.commit("local.txt", "z\n", "local main");

    await run({ confirm: false }, ["develop"]);

    expect(parent()).not.toBe(remoteHead);
  });

  it("n'envoie jamais à git fetch une base qui ressemble à une option", async () => {
    const config = {
      ...DEFAULT_CONFIG,
      branches: { ...DEFAULT_CONFIG.branches, develop: "--upload-pack=touch /tmp/gitpilot-pwn" },
    };
    await expect(
      rebaseCommand.run(createFakeContext(repo.work, {}, config), ["--upload-pack=touch /tmp/gitpilot-pwn"]),
    ).rejects.toThrow("invalide");
  });
});
