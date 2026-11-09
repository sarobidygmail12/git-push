import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteBranchCommand } from "../src/commands/deleteBranch.js";
import { isDestructive } from "../src/core/git/gitClient.js";
import { createFakeContext } from "./helpers/fakeContext.js";
import { createTempRepo, type TempRepo } from "./helpers/tempRepo.js";

const LOST_COMMITS = 2;

describe("/delete-branch", () => {
  let repo: TempRepo;

  beforeEach(() => {
    repo = createTempRepo();
  });
  afterEach(() => repo.cleanup());

  const localBranch = (name: string): string => repo.git("branch", "--list", name);
  const remoteBranch = (name: string): string => repo.git("ls-remote", "--heads", "origin", name);

  const publishBranch = (name: string): void => {
    repo.git("branch", name);
    repo.git("push", "--quiet", "-u", "origin", name);
  };

  it("supprime la branche locale et distante avec git seul", async () => {
    publishBranch("feature/a");
    const ctx = createFakeContext(repo.work, { confirm: true });
    vi.spyOn(ctx.ui, "select").mockImplementation((_question, choices) => Promise.resolve(choices[2]?.value));
    await deleteBranchCommand.run(ctx, ["feature/a"]);
    expect(localBranch("feature/a")).toBe("");
    expect(remoteBranch("feature/a")).toBe("");
  });

  it("garde le distant si seul le local est choisi", async () => {
    publishBranch("feature/a");
    const ctx = createFakeContext(repo.work, { confirm: true });
    vi.spyOn(ctx.ui, "select").mockImplementation((_question, choices) => Promise.resolve(choices[0]?.value));
    await deleteBranchCommand.run(ctx, ["feature/a"]);
    expect(localBranch("feature/a")).toBe("");
    expect(remoteBranch("feature/a")).not.toBe("");
  });

  it("supprime une branche qui n'existe que sur le distant", async () => {
    publishBranch("feature/a");
    repo.git("branch", "--quiet", "-D", "feature/a");
    await deleteBranchCommand.run(createFakeContext(repo.work, { confirm: true }), ["feature/a"]);
    expect(remoteBranch("feature/a")).toBe("");
  });

  it("nettoie une référence distante déjà supprimée sur le serveur", async () => {
    publishBranch("feature/a");
    const head = repo.git("rev-parse", "feature/a");
    repo.git("push", "--quiet", "origin", "--delete", "feature/a");
    repo.git("branch", "--quiet", "-D", "feature/a");
    repo.git("update-ref", "refs/remotes/origin/feature/a", head);

    await deleteBranchCommand.run(createFakeContext(repo.work, { confirm: true }), ["feature/a"]);

    expect(repo.git("branch", "-r", "--list", "origin/feature/a")).toBe("");
  });

  it("annonce les commits qui n'existent nulle part ailleurs", async () => {
    repo.git("switch", "--quiet", "-c", "feature/a");
    repo.commit("a.txt", "a\n", "un");
    repo.commit("b.txt", "b\n", "deux");
    repo.git("switch", "--quiet", "main");
    const ctx = createFakeContext(repo.work, { confirm: true });
    const confirm = vi.spyOn(ctx.ui, "confirm");

    await deleteBranchCommand.run(ctx, ["feature/a"]);

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining(String(LOST_COMMITS)));
    expect(localBranch("feature/a")).toBe("");
  });

  it("compte aussi les commits présents seulement sur le distant supprimé", async () => {
    repo.git("switch", "--quiet", "-c", "feature/a");
    repo.commit("a.txt", "a\n", "un");
    repo.git("push", "--quiet", "-u", "origin", "feature/a");
    repo.git("switch", "--quiet", "main");
    const ctx = createFakeContext(repo.work, { confirm: false });
    vi.spyOn(ctx.ui, "select").mockImplementation((_question, choices) => Promise.resolve(choices[2]?.value));
    const confirm = vi.spyOn(ctx.ui, "confirm");

    await deleteBranchCommand.run(ctx, ["feature/a"]);

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("1 commit"));
  });

  it("ne touche à rien si la suppression n'est pas confirmée", async () => {
    publishBranch("feature/a");
    const ctx = createFakeContext(repo.work, { confirm: false });
    vi.spyOn(ctx.ui, "select").mockImplementation((_question, choices) => Promise.resolve(choices[2]?.value));
    await deleteBranchCommand.run(ctx, ["feature/a"]);
    expect(localBranch("feature/a")).not.toBe("");
    expect(remoteBranch("feature/a")).not.toBe("");
  });

  it("refuse la branche courante", async () => {
    repo.git("switch", "--quiet", "-c", "feature/a");
    await expect(deleteBranchCommand.run(createFakeContext(repo.work, { confirm: true }), ["feature/a"])).rejects.toThrow("courante");
    expect(localBranch("feature/a")).not.toBe("");
  });

  it.each(["main", "develop", "preprod"])("refuse la branche protégée %s", async (name) => {
    await expect(deleteBranchCommand.run(createFakeContext(repo.work, { confirm: true }), [name])).rejects.toThrow("protégée");
    expect(remoteBranch(name)).not.toBe("");
  });

  it("refuse une branche inconnue et un nom lu comme une option", async () => {
    const ctx = createFakeContext(repo.work, { confirm: true });
    await expect(deleteBranchCommand.run(ctx, ["inconnue"])).rejects.toThrow("introuvable");
    await expect(deleteBranchCommand.run(ctx, ["--all"])).rejects.toThrow("invalide");
  });

  it("n'autocomplète ni la branche courante ni les branches protégées", async () => {
    publishBranch("feature/a");
    const suggestions = await deleteBranchCommand.completeArgs?.(createFakeContext(repo.work, {}), "");
    expect(suggestions).toEqual(["feature/a"]);
  });

  it.each([
    [["branch", "-D", "x"]],
    [["push", "origin", "--delete", "x"]],
    [["push", "origin", "-d", "x"]],
    [["push", "origin", ":x"]],
  ])("le client Git bloque %j sans confirmation", (args) => {
    expect(isDestructive(args)).toBe(true);
  });
});
