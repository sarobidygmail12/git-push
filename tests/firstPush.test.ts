import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { firstPushCommand } from "../src/commands/firstPush.js";
import { createFakeContext, type FakeAnswers } from "./helpers/fakeContext.js";
import { createTempRepo, type TempRepo } from "./helpers/tempRepo.js";

const BRANCH = "publication";

describe("/first-push", () => {
  let repo: TempRepo;

  beforeEach(() => {
    repo = createTempRepo();
  });
  afterEach(() => repo.cleanup());

  const head = (): string => repo.git("rev-parse", "HEAD");
  const remoteHead = (): string => repo.git("ls-remote", "origin", `refs/heads/${BRANCH}`).split("\t")[0] ?? "";
  const run = (answers: FakeAnswers = {}): Promise<void> => firstPushCommand.run(createFakeContext(repo.work, answers), []);

  /** Reproduit un dépôt créé sur GitHub avec une LICENSE : le remote et le local n'ont aucun commit commun. */
  const createUnrelatedHistories = (remoteFile: string, localFile: string): string => {
    repo.git("switch", "--quiet", "--orphan", BRANCH);
    repo.commit(remoteFile, "distant\n", "Initial commit");
    repo.git("push", "--quiet", "origin", BRANCH);
    const pushedHead = head();
    repo.git("switch", "--quiet", "main");
    repo.git("branch", "--quiet", "-D", BRANCH);
    repo.git("switch", "--quiet", "--orphan", BRANCH);
    repo.commit(localFile, "local\n", "init");
    return pushedHead;
  };

  it("publie par-dessus un remote à l'historique sans rapport", async () => {
    const initialCommit = createUnrelatedHistories("LICENSE", "app.txt");

    await run();

    expect(repo.git("rev-parse", "HEAD~1")).toBe(initialCommit);
    expect(remoteHead()).toBe(head());
    expect(repo.git("ls-files")).toContain("LICENSE");
    expect(repo.git("rev-parse", "--abbrev-ref", "@{upstream}")).toBe(`origin/${BRANCH}`);
  });

  it("publie directement une branche absente du remote", async () => {
    repo.git("switch", "--quiet", "-c", BRANCH);
    repo.commit("app.txt", "local\n", "travail");

    await run();

    expect(remoteHead()).toBe(head());
    expect(repo.git("rev-parse", "--abbrev-ref", "@{upstream}")).toBe(`origin/${BRANCH}`);
  });

  it("ne touche pas à une branche déjà reliée", async () => {
    repo.commit("app.txt", "local\n", "travail");
    const pushed = repo.git("rev-parse", "origin/main");

    await run();

    expect(repo.git("ls-remote", "origin", "refs/heads/main").split("\t")[0]).toBe(pushed);
  });

  it("n'envoie le commit proposé qu'après avoir intégré le remote", async () => {
    const initialCommit = createUnrelatedHistories("LICENSE", "app.txt");
    repo.write("wip.txt", "en cours\n");

    await run({ select: ["commit", "accept"] });

    expect(repo.git("rev-list", "--max-parents=0", "HEAD")).toBe(initialCommit);
    expect(remoteHead()).toBe(head());
    expect(repo.git("ls-files")).toContain("wip.txt");
  });

  it("ne pousse rien si l'utilisateur renonce à sécuriser ses modifications", async () => {
    const initialCommit = createUnrelatedHistories("LICENSE", "app.txt");
    repo.write("wip.txt", "en cours\n");

    await run();

    expect(remoteHead()).toBe(initialCommit);
  });

  it("ne pousse rien si le conflit est annulé", async () => {
    const initialCommit = createUnrelatedHistories("meme.txt", "meme.txt");
    const before = head();

    await run({ select: "abort" });

    expect(head()).toBe(before);
    expect(remoteHead()).toBe(initialCommit);
  });

  it("reprend un rebase laissé en pause puis publie", async () => {
    createUnrelatedHistories("meme.txt", "meme.txt");
    await run();
    expect(repo.git("status")).toContain("rebase");

    repo.write("meme.txt", "fusionné\n");
    await run({ select: "continue" });

    expect(remoteHead()).toBe(head());
  });

  it("refuse un HEAD détaché", async () => {
    repo.git("switch", "--quiet", "--detach");
    await expect(run()).rejects.toThrow("HEAD détaché");
  });

  it("refuse une branche sans commit", async () => {
    repo.git("switch", "--quiet", "--orphan", BRANCH);
    await expect(run()).rejects.toThrow("Aucun commit");
  });

  it("refuse un dépôt sans origin", async () => {
    repo.git("remote", "remove", "origin");
    await expect(run()).rejects.toThrow("origin");
  });
});
