import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGitClient } from "../src/core/git/gitClient.js";
import { countChanges, describeBranch, getStatus, type FileChange } from "../src/core/git/status.js";
import { createTempRepo, type TempRepo } from "./helpers/tempRepo.js";

const FILES_IN_NEW_FOLDER = 2;

const change = (index: string, worktree: string, kind: FileChange["kind"] = "tracked"): FileChange => ({
  path: "file.txt",
  index,
  worktree,
  kind,
});

describe("countChanges", () => {
  it("classe chaque état Git", () => {
    expect(countChanges([change("A", ".")])).toEqual({ added: 1, deleted: 0, modified: 0 });
    expect(countChanges([change(".", "A")])).toEqual({ added: 1, deleted: 0, modified: 0 });
    expect(countChanges([change("?", "?", "untracked")])).toEqual({ added: 1, deleted: 0, modified: 0 });
    expect(countChanges([change("D", ".")])).toEqual({ added: 0, deleted: 1, modified: 0 });
    expect(countChanges([change(".", "D")])).toEqual({ added: 0, deleted: 1, modified: 0 });
    expect(countChanges([change("M", "M")])).toEqual({ added: 0, deleted: 0, modified: 1 });
    expect(countChanges([change("R", ".", "renamed")])).toEqual({ added: 0, deleted: 0, modified: 1 });
    expect(countChanges([change("U", "U", "conflict")])).toEqual({ added: 0, deleted: 0, modified: 1 });
  });
});

describe("état du dépôt pour l'en-tête", () => {
  let repo: TempRepo;

  beforeEach(() => {
    repo = createTempRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  it("compte chaque fichier d'un dossier non suivi", async () => {
    repo.commit("gone.txt", "bye\n", "add gone");
    repo.commit("edited.txt", "v1\n", "add edited");
    rmSync(join(repo.work, "gone.txt"));
    repo.write("edited.txt", "v2\n");
    mkdirSync(join(repo.work, "nouveau"));
    repo.write("nouveau/a.txt", "a\n");
    repo.write("nouveau/b.txt", "b\n");

    const status = await getStatus(createGitClient({ cwd: repo.work }), { listEachUntrackedFile: true });

    expect(countChanges(status.files)).toEqual({ added: FILES_IN_NEW_FOLDER, deleted: 1, modified: 1 });
  });

  it("affiche le hash court en HEAD détaché", async () => {
    repo.git("switch", "--quiet", "--detach");
    const status = await getStatus(createGitClient({ cwd: repo.work }));

    expect(describeBranch(status)).toBe(`HEAD détaché (${repo.git("rev-parse", "--short=7", "HEAD")})`);
  });

  it("donne le nom de la branche courante", async () => {
    const status = await getStatus(createGitClient({ cwd: repo.work }));

    expect(describeBranch(status)).toBe("main");
  });
});
