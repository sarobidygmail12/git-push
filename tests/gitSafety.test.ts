import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitFlow } from "../src/commands/shared/commitFlow.js";
import { startBranchFlow } from "../src/commands/shared/startBranchFlow.js";
import { initCommand } from "../src/commands/init.js";
import { undoCommand } from "../src/commands/undo.js";
import { DEFAULT_CONFIG } from "../src/core/config/schema.js";
import { getStagedChanges, parseNameStatus } from "../src/core/git/diff.js";
import { createGitClient, isDestructive } from "../src/core/git/gitClient.js";
import { isSensitivePath } from "../src/core/git/sensitive.js";
import { getRepoRoot, getStatus, parseStatus } from "../src/core/git/status.js";
import { createFakeContext } from "./helpers/fakeContext.js";
import { createTempRepo, type TempRepo } from "./helpers/tempRepo.js";

const TRUNCATED_LENGTH = 10;
const COMMITS_AHEAD = 2;
const STAGED_FILE_COUNT = 2;

describe("garde-fous du client Git", () => {
  it.each([
    [["push", "--force"]],
    [["push", "-f", "origin", "main"]],
    [["push", "--force-with-lease"]],
    [["push", "origin", "+main"]],
    [["reset", "--hard"]],
    [["clean", "-fd"]],
  ])("bloque %j", (args) => {
    expect(isDestructive(args)).toBe(true);
  });

  it.each([[["push"]], [["push", "-u", "origin", "main"]], [["reset", "--soft", "HEAD~1"]]])("autorise %j", (args) => {
    expect(isDestructive(args)).toBe(false);
  });

  it("refuse d'exécuter une commande destructive sans confirmation", async () => {
    await expect(createGitClient({ cwd: "." }).run(["reset", "--hard"])).rejects.toThrow("bloquée");
  });
});

describe("parsing", () => {
  it("lit branche, upstream, renommage et chemins avec espaces", () => {
    const output = [
      "# branch.oid abc",
      "# branch.head main",
      "# branch.upstream origin/main",
      "# branch.ab +2 -1",
      "1 .M N... 100644 100644 100644 aaa bbb un fichier.txt",
      "2 R. N... 100644 100644 100644 aaa bbb R100 nouveau nom.txt",
      "2 ancien.txt",
      "? non suivi.txt",
      "",
    ].join("\0");
    const status = parseStatus(output);
    expect(status).toMatchObject({ branch: "main", upstream: "origin/main", ahead: COMMITS_AHEAD, behind: 1 });
    expect(status.files.map((file) => file.path)).toEqual(["un fichier.txt", "nouveau nom.txt", "non suivi.txt"]);
    expect(status.files[1]?.originalPath).toBe("2 ancien.txt");
  });

  it("lit un renommage dans --name-status -z", () => {
    expect(parseNameStatus("M\0a.txt\0R100\0vieux.txt\0neuf.txt\0")).toEqual([
      { path: "a.txt", status: "M" },
      { path: "neuf.txt", originalPath: "vieux.txt", status: "R" },
    ]);
  });

  it.each([".env", ".env.local", "conf/.env", "server.pem", "api.key", "id_rsa"])("considère %s comme sensible", (path) => {
    expect(isSensitivePath(path)).toBe(true);
  });

  it("ne signale pas un fichier ordinaire", () => {
    expect(isSensitivePath("src/keyboard.ts")).toBe(false);
  });
});

describe("flux sur un vrai dépôt", () => {
  let repo: TempRepo;

  beforeEach(() => {
    repo = createTempRepo();
  });
  afterEach(() => repo.cleanup());

  const head = (): string => repo.git("rev-parse", "HEAD");

  it("n'envoie jamais à l'IA le contenu d'un fichier sensible, mais garde son nom", async () => {
    repo.write(".env", "SECRET=valeur-interdite\n");
    repo.write("public.txt", "contenu visible\n");
    repo.git("add", ".");
    const changes = await getStagedChanges(createGitClient({ cwd: repo.work }));
    expect(changes.diff).toContain("contenu visible");
    expect(changes.diff).not.toContain("valeur-interdite");
    expect(changes.files.map((file) => file.path)).toContain(".env");
  });

  it("tronque le diff et conserve la liste complète des fichiers", async () => {
    repo.write("a.txt", "x".repeat(TRUNCATED_LENGTH * TRUNCATED_LENGTH));
    repo.write("b.txt", "y\n");
    repo.git("add", ".");
    const changes = await getStagedChanges(createGitClient({ cwd: repo.work }), TRUNCATED_LENGTH);
    expect(changes.diff).toHaveLength(TRUNCATED_LENGTH);
    expect(changes.truncated).toBe(true);
    expect(changes.files).toHaveLength(STAGED_FILE_COUNT);
  });

  it("laisse l'index intact si la branche protégée n'est pas confirmée", async () => {
    repo.write("file.txt", "modifié\n");
    expect(await commitFlow(createFakeContext(repo.work, { confirm: false }))).toBe("cancelled");
    expect(repo.git("diff", "--cached", "--name-only")).toBe("");
  });

  it("n'effectue aucun commit si l'utilisateur annule", async () => {
    repo.git("switch", "--quiet", "develop");
    const before = head();
    repo.write("file.txt", "modifié\n");
    expect(await commitFlow(createFakeContext(repo.work, { select: "cancel" }))).toBe("cancelled");
    expect(head()).toBe(before);
    expect(repo.git("status", "--porcelain")).toContain("file.txt");
  });

  it("Modifier change le titre et conserve le détail par fichier", async () => {
    repo.git("switch", "--quiet", "-c", "feature/titre");
    repo.write("file.txt", "modifié\n");
    const ctx = createFakeContext(repo.work, { select: ["edit", "accept"], ask: "fix: titre corrigé" });
    const message = "feat: généré\n\n- file.txt : ajoute une ligne";
    ctx.ai = { generate: () => Promise.resolve({ message, provider: "fallback", failures: [] }) };

    await commitFlow(ctx);

    expect(repo.git("log", "-1", "--format=%B")).toBe("fix: titre corrigé\n\n- file.txt : ajoute une ligne");
  });

  it("committe et pose l'upstream sur une nouvelle branche", async () => {
    repo.git("switch", "--quiet", "-c", "feature/a");
    repo.write("file.txt", "modifié\n");
    expect(await commitFlow(createFakeContext(repo.work, { select: "accept" }))).toBe("committed");
    expect(repo.git("log", "-1", "--format=%s")).toBe("feat: généré");
    expect(repo.git("rev-parse", "origin/feature/a")).toBe(head());
  });

  it("ne change pas de branche si le commit préalable est annulé", async () => {
    repo.git("switch", "--quiet", "-c", "feature/b");
    repo.write("file.txt", "modifié\n");
    const ctx = createFakeContext(repo.work, { select: "cancel" });
    await startBranchFlow(ctx, { base: "develop", prefix: "hotfix/", name: "x" });
    expect(repo.git("branch", "--show-current")).toBe("feature/b");
    expect(repo.git("branch", "--list", "hotfix/x")).toBe("");
  });

  it("ne committe rien si le nom de la nouvelle branche est refusé", async () => {
    repo.git("switch", "--quiet", "-c", "feature/c");
    const before = head();
    repo.write("file.txt", "modifié\n");
    const ctx = createFakeContext(repo.work, { select: "accept" });
    await expect(startBranchFlow(ctx, { base: "develop", prefix: "hotfix/", name: "bad..name" })).rejects.toThrow("invalide");
    expect(head()).toBe(before);
  });

  it("/init crée le dépôt sur la branche principale configurée dans le dossier courant par défaut", async () => {
    const emptyDirectory = join(repo.root, "vide");
    mkdirSync(emptyDirectory);
    await initCommand.run(createFakeContext(emptyDirectory, { ask: ["", ""] }), []);
    expect(await getRepoRoot(createGitClient({ cwd: emptyDirectory }))).toContain("vide");
    expect((await getStatus(createGitClient({ cwd: emptyDirectory }))).branch).toBe(DEFAULT_CONFIG.branches.main);
    expect(execFileSync("git", ["remote"], { cwd: emptyDirectory, encoding: "utf8" })).toBe("");
  });

  it("/init crée le dossier demandé et le relie au dépôt distant", async () => {
    const launchDirectory = join(repo.root, "lancement");
    mkdirSync(launchDirectory);
    await initCommand.run(createFakeContext(launchDirectory, { ask: ["../a/b", "git@example.com:moi/b.git"] }), []);
    const target = join(repo.root, "a", "b");
    expect(execFileSync("git", ["remote", "get-url", "origin"], { cwd: target, encoding: "utf8" }).trim()).toBe("git@example.com:moi/b.git");
    expect(await getRepoRoot(createGitClient({ cwd: launchDirectory }))).toBeUndefined();
  });

  it("/init ne fait rien si une question est annulée", async () => {
    const launchDirectory = join(repo.root, "annule");
    mkdirSync(launchDirectory);
    await initCommand.run(createFakeContext(launchDirectory, { ask: [] }), []);
    await initCommand.run(createFakeContext(launchDirectory, { ask: [""] }), []);
    expect(await getRepoRoot(createGitClient({ cwd: launchDirectory }))).toBeUndefined();
  });

  it("/init refuse une URL pouvant être lue comme une option, avant de créer quoi que ce soit", async () => {
    const launchDirectory = join(repo.root, "url");
    mkdirSync(launchDirectory);
    const ctx = createFakeContext(launchDirectory, { ask: ["", "--mirror=push"] });
    await expect(initCommand.run(ctx, [])).rejects.toThrow("invalide");
    expect(await getRepoRoot(createGitClient({ cwd: launchDirectory }))).toBeUndefined();
  });

  it("/init ne touche pas à un dépôt déjà relié, même vers un sous-dossier absent", async () => {
    const before = head();
    await initCommand.run(createFakeContext(repo.work, { ask: ["sous/dossier", "git@example.com:autre.git"] }), []);
    expect(head()).toBe(before);
    expect(existsSync(join(repo.work, "sous"))).toBe(false);
    expect(repo.git("remote", "get-url", "origin")).not.toContain("example.com");
  });

  it("/init ajoute le dépôt distant à un dépôt existant qui n'en a pas", async () => {
    repo.git("remote", "remove", "origin");
    await initCommand.run(createFakeContext(repo.work, { ask: ["", "git@example.com:moi/x.git"] }), []);
    expect(repo.git("remote", "get-url", "origin")).toBe("git@example.com:moi/x.git");
  });

  it("/undo refuse un commit déjà poussé", async () => {
    const before = head();
    await expect(undoCommand.run(createFakeContext(repo.work, {}), [])).rejects.toThrow("déjà poussé");
    expect(head()).toBe(before);
  });

  it("/undo garde les modifications d'un commit local", async () => {
    repo.commit("local.txt", "x\n", "local");
    await undoCommand.run(createFakeContext(repo.work, {}, DEFAULT_CONFIG), []);
    expect(repo.git("log", "-1", "--format=%s")).toBe("initial");
    expect(repo.git("diff", "--cached", "--name-only")).toBe("local.txt");
  });
});
