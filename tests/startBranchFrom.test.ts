import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startBranchFrom } from "../src/core/git/branches.js";
import { GitError } from "../src/core/errors.js";
import { createGitClient, type GitClient } from "../src/core/git/gitClient.js";
import { createTempRepo, type TempRepo } from "./helpers/tempRepo.js";

describe("startBranchFrom", () => {
  let repo: TempRepo;
  let client: GitClient;

  beforeEach(() => {
    repo = createTempRepo();
    client = createGitClient({ cwd: repo.work });
  });
  afterEach(() => repo.cleanup());

  const currentBranch = (): string => repo.git("branch", "--show-current");

  it("crée la branche préfixée depuis la base", async () => {
    const started = await startBranchFrom(client, "develop", "hotfix/", "panier");
    expect(started.branch).toBe("hotfix/panier");
    expect(currentBranch()).toBe("hotfix/panier");
    expect(repo.git("rev-parse", "HEAD")).toBe(repo.git("rev-parse", "develop"));
  });

  it("récupère les commits distants de la base avant de créer la branche", async () => {
    repo.git("switch", "--quiet", "develop");
    repo.commit("remote.txt", "x\n", "commit distant");
    repo.git("push", "--quiet");
    const remoteHead = repo.git("rev-parse", "HEAD");
    repo.git("reset", "--quiet", "--hard", "HEAD~1");
    repo.git("switch", "--quiet", "main");

    await startBranchFrom(client, "develop", "fix/", "maj");
    expect(repo.git("rev-parse", "HEAD")).toBe(remoteHead);
  });

  it("refuse un working tree modifié sans changer de branche ni rien perdre", async () => {
    repo.write("file.txt", "travail en cours\n");
    await expect(startBranchFrom(client, "develop", "fix/", "x")).rejects.toBeInstanceOf(GitError);
    expect(currentBranch()).toBe("main");
    expect(repo.git("status", "--porcelain")).toContain("file.txt");
  });

  it("refuse aussi la présence de fichiers non suivis", async () => {
    repo.write("nouveau.txt", "x\n");
    await expect(startBranchFrom(client, "develop", "fix/", "x")).rejects.toBeInstanceOf(GitError);
    expect(currentBranch()).toBe("main");
  });

  it.each([
    ["un nom invalide", "develop", "bad..name", "invalide"],
    ["une base absente", "inexistante", "ok", "n'existe pas"],
  ])("refuse %s avant toute action", async (_case, base, name, message) => {
    await expect(startBranchFrom(client, base, "fix/", name)).rejects.toThrow(message);
    expect(currentBranch()).toBe("main");
  });

  it("refuse une branche qui existe déjà", async () => {
    repo.git("branch", "fix/existante");
    await expect(startBranchFrom(client, "develop", "fix/", "existante")).rejects.toThrow("existe déjà");
    expect(currentBranch()).toBe("main");
  });

  const divergeDevelop = (): { localHead: string; remoteHead: string } => {
    repo.git("switch", "--quiet", "develop");
    repo.commit("a.txt", "a\n", "distant");
    repo.git("push", "--quiet");
    const remoteHead = repo.git("rev-parse", "HEAD");
    repo.git("reset", "--quiet", "--hard", "HEAD~1");
    repo.commit("b.txt", "b\n", "local divergent");
    const localHead = repo.git("rev-parse", "HEAD");
    repo.git("switch", "--quiet", "main");
    return { localHead, remoteHead };
  };

  it("force : sauvegarde les commits locaux et aligne la base sur le remote", async () => {
    const { localHead, remoteHead } = divergeDevelop();
    const started = await startBranchFrom(client, "develop", "hotfix/", "x", { forceDivergedBase: true });

    expect(currentBranch()).toBe("hotfix/x");
    expect(repo.git("rev-parse", "HEAD")).toBe(remoteHead);
    expect(repo.git("rev-parse", "develop")).toBe(remoteHead);
    expect(started.backupBranch).toBeDefined();
    expect(repo.git("rev-parse", started.backupBranch ?? "")).toBe(localHead);
  });

  it("force : une fois la base alignée, le hotfix suivant n'a plus rien à forcer", async () => {
    divergeDevelop();
    const first = await startBranchFrom(client, "develop", "hotfix/", "x", { forceDivergedBase: true });
    repo.git("switch", "--quiet", "main");
    const second = await startBranchFrom(client, "develop", "hotfix/", "y", { forceDivergedBase: true });
    expect(first.backupBranch).toBeDefined();
    expect(second.backupBranch).toBeUndefined();
  });

  it("force : une autre erreur de pull arrête toujours le flux", async () => {
    repo.git("branch", "sans-upstream");
    await expect(
      startBranchFrom(client, "sans-upstream", "hotfix/", "x", { forceDivergedBase: true }),
    ).rejects.toBeInstanceOf(GitError);
    expect(repo.git("branch", "--list", "hotfix/x")).toBe("");
  });

  it("s'arrête si le pull n'est pas un fast-forward et ne crée pas la branche", async () => {
    repo.git("switch", "--quiet", "develop");
    repo.commit("a.txt", "a\n", "distant");
    repo.git("push", "--quiet");
    repo.git("reset", "--quiet", "--hard", "HEAD~1");
    repo.commit("b.txt", "b\n", "local divergent");
    repo.git("switch", "--quiet", "main");

    await expect(startBranchFrom(client, "develop", "hotfix/", "x")).rejects.toBeInstanceOf(GitError);
    expect(currentBranch()).toBe("develop");
    expect(repo.git("branch", "--list", "hotfix/x")).toBe("");
  });
});
