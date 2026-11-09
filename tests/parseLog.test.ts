import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGitClient } from "../src/core/git/gitClient.js";
import {
  annotateCommits,
  getCommitDetails,
  getLogPage,
  getRepoOverview,
  LOG_PAGE_SIZE,
  parseGitLog,
  parseNumstat,
  parseRefs,
  parseShortlog,
  type LogCommit,
  type LogQuery,
} from "../src/core/git/log.js";
import { createTempRepo, type TempRepo } from "./helpers/tempRepo.js";

const SEPARATOR = "\u001f";
const record = (...fields: string[]): string => fields.join(SEPARATOR);
const QUERY: LogQuery = { page: 0, search: "", field: "message", branch: "" };

describe("parseGitLog", () => {
  it("lit tous les champs d'un commit", () => {
    const output = `${record("aaa111", "aaa", "p1 p2", "Ada", "2026-01-02T03:04:05+00:00", "HEAD -> main, tag: v1, origin/main", "feat: x")}\0`;
    expect(parseGitLog(output)).toEqual([
      {
        hash: "aaa111",
        shortHash: "aaa",
        parents: ["p1", "p2"],
        author: "Ada",
        date: "2026-01-02T03:04:05+00:00",
        refs: [
          { name: "HEAD", kind: "head" },
          { name: "main", kind: "branch" },
          { name: "v1", kind: "tag" },
          { name: "origin/main", kind: "branch" },
        ],
        subject: "feat: x",
        source: "",
      },
    ]);
  });

  it("gère le commit racine, sans parent ni référence", () => {
    const [commit] = parseGitLog(`${record("h", "s", "", "A", "d", "", "init")}\0`);
    expect(commit?.parents).toEqual([]);
    expect(commit?.refs).toEqual([]);
  });

  it("sépare plusieurs commits et garde les caractères spéciaux du sujet", () => {
    const output = `${record("a", "a", "", "A", "d", "", "sujet, avec | des <b>")}\0${record("b", "b", "", "B", "d", "", "autre")}\0`;
    expect(parseGitLog(output).map((commit) => commit.subject)).toEqual(["sujet, avec | des <b>", "autre"]);
  });

  it("renvoie une liste vide sans commit", () => {
    expect(parseGitLog("")).toEqual([]);
  });

  it("distingue local, distant et tag quand les décorations sont complètes", () => {
    expect(parseRefs("HEAD -> refs/heads/feature/a, tag: refs/tags/v1, refs/remotes/origin/feature/a, refs/remotes/origin/HEAD, refs/stash")).toEqual([
      { name: "HEAD", kind: "head" },
      { name: "feature/a", kind: "branch" },
      { name: "v1", kind: "tag" },
      { name: "origin/feature/a", kind: "remote" },
      { name: "stash", kind: "stash" },
    ]);
  });

  it("reconnaît un HEAD détaché", () => {
    expect(parseRefs("HEAD")).toEqual([{ name: "HEAD", kind: "head" }]);
  });
});

const commit = (hash: string, parents: string[], refs: LogCommit["refs"] = [], source = ""): LogCommit => ({
  hash,
  shortHash: hash,
  parents,
  author: "A",
  date: "d",
  refs,
  subject: hash,
  source,
});
const local = (name: string) => ({ name, kind: "branch" }) as const;

describe("annotateCommits", () => {
  const branchesOf = (commits: LogCommit[], branch: string | null, hash: string | null) =>
    Object.fromEntries(annotateCommits(commits, { branch, hash }).map((item) => [item.hash, item.branch]));

  it("descend le nom de branche le long des premiers parents", () => {
    const commits = [commit("c", ["b"], [local("feature")]), commit("b", ["a"]), commit("a", [])];
    expect(branchesOf(commits, "main", null)).toEqual({ c: "feature", b: "feature", a: "feature" });
  });

  it("rattache un ancêtre commun à la branche principale, même depuis une autre branche courante", () => {
    const commits = [commit("x", ["a"], [local("feature")]), commit("y", ["a"], [local("main")]), commit("a", [])];
    expect(branchesOf(commits, "feature", "x")).toEqual({ x: "feature", y: "main", a: "main" });
  });

  it("préfère la branche courante aux autres branches de travail", () => {
    const commits = [commit("x", ["a"], [local("autre")]), commit("y", ["a"], [local("feature")]), commit("a", [])];
    expect(branchesOf(commits, "feature", "y").a).toBe("feature");
  });

  it("préfère la branche locale à son équivalent distant", () => {
    const commits = [commit("a", [], [{ name: "origin/feature", kind: "remote" }, local("feature")])];
    expect(branchesOf(commits, null, null).a).toBe("feature");
  });

  it("garde le nom d'un distant sans branche locale", () => {
    expect(branchesOf([commit("a", [], [{ name: "origin/x", kind: "remote" }])], null, null).a).toBe("origin/x");
  });

  it("se rabat sur la référence source quand la chaîne est coupée", () => {
    const commits = [commit("a", [], [], "refs/remotes/origin/x"), commit("b", [], [], "HEAD"), commit("c", [], [], "abc123")];
    expect(branchesOf(commits, "dev", null)).toEqual({ a: "origin/x", b: "dev", c: "" });
  });

  it("ne laisse pas la référence source écraser la lignée d'une branche fusionnée", () => {
    const commits = [commit("f2", ["f1"], [local("feature")]), commit("f1", [], [], "refs/heads/develop")];
    expect(branchesOf(commits, null, null).f1).toBe("feature");
  });

  it("marque tout ce qui est atteignable depuis HEAD, parents de fusion compris", () => {
    const commits = [commit("o", ["a"], [local("other")]), commit("m", ["a", "f"]), commit("f", ["a"]), commit("a", [])];
    const onCurrent = annotateCommits(commits, { branch: "main", hash: "m" }).filter((item) => item.onCurrentBranch);
    expect(onCurrent.map((item) => item.hash)).toEqual(["m", "f", "a"]);
  });
});

describe("analyse des sorties git", () => {
  it("lit shortlog", () => {
    expect(parseShortlog("    12\tAda Lovelace\n     1\tBob\n")).toEqual([
      { name: "Ada Lovelace", commits: 12 },
      { name: "Bob", commits: 1 },
    ]);
  });

  it("lit numstat, y compris les fichiers binaires", () => {
    expect(parseNumstat("3\t1\tsrc/a.ts\n-\t-\timg.png\n")).toEqual([
      { path: "src/a.ts", added: 3, deleted: 1 },
      { path: "img.png", added: null, deleted: null },
    ]);
  });
});

describe("getLogPage", () => {
  let repo: TempRepo;

  beforeEach(() => {
    repo = createTempRepo();
  });
  afterEach(() => repo.cleanup());

  const page = (overrides: Partial<LogQuery>) => getLogPage(createGitClient({ cwd: repo.work }), { ...QUERY, ...overrides });

  it("cherche dans les messages sans interpréter la saisie comme une regex", async () => {
    repo.commit("a.txt", "a\n", "fix: prix [TVA]");
    repo.commit("b.txt", "b\n", "feat: panier");
    const { commits } = await page({ search: "[tva]" });
    expect(commits.map((commit) => commit.subject)).toEqual(["fix: prix [TVA]"]);
  });

  it("cherche par auteur et par hash", async () => {
    repo.commit("a.txt", "a\n", "un commit");
    const hash = repo.git("rev-parse", "--short", "HEAD");
    expect((await page({ search: "test", field: "author" })).commits.length).toBeGreaterThan(0);
    expect((await page({ search: hash, field: "hash" })).commits.map((commit) => commit.subject)).toEqual(["un commit"]);
    expect((await page({ search: "--all", field: "hash" })).commits).toEqual([]);
  });

  it("filtre par branche et ignore une branche inconnue", async () => {
    repo.git("switch", "--quiet", "develop");
    repo.commit("a.txt", "a\n", "sur develop");
    expect((await page({ branch: "main" })).commits.map((commit) => commit.subject)).toEqual(["initial"]);
    expect((await page({ branch: "--output=/tmp/x" })).commits).toEqual([]);
  });

  it("indique s'il reste une page suivante", async () => {
    const extraCommits = LOG_PAGE_SIZE + 1;
    Array.from({ length: extraCommits }, (_unused, index) =>
      repo.git("commit", "--quiet", "--allow-empty", "-m", `commit ${index}`),
    );
    const first = await page({});
    expect(first.commits).toHaveLength(LOG_PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    const second = await page({ page: 1 });
    expect(second.hasMore).toBe(false);
  });

  it("rattache chaque commit à sa branche et conserve ce rattachement sur les pages suivantes", async () => {
    repo.git("switch", "--quiet", "-c", "feature");
    Array.from({ length: LOG_PAGE_SIZE + 2 }, (_unused, index) =>
      repo.git("commit", "--quiet", "--allow-empty", "-m", `commit ${index}`),
    );
    const first = await page({ branch: "feature" });
    const second = await page({ branch: "feature", page: 1 });
    expect(first.commits[0]).toMatchObject({ branch: "feature", onCurrentBranch: true });
    expect(second.commits[0]).toMatchObject({ branch: "feature", onCurrentBranch: true });
  });

  it("décrit le dépôt : branche courante, avance, distants, tags et auteurs", async () => {
    repo.commit("a.txt", "a\n", "local seulement");
    repo.git("tag", "v1");
    const overview = await getRepoOverview(createGitClient({ cwd: repo.work }));
    expect(overview.head.branch).toBe("main");
    expect(overview.local.find((branch) => branch.name === "main")).toEqual({ name: "main", ahead: 1, behind: 0 });
    expect(overview.remote).toContain("origin/main");
    expect(overview.remote.some((name) => name.endsWith("/HEAD"))).toBe(false);
    expect(overview.tags).toEqual(["v1"]);
    expect(overview.authors).toEqual([{ name: "Test", commits: 2 }]);
  });

  it("détaille un commit : corps, fichiers et branches qui le contiennent", async () => {
    repo.git("switch", "--quiet", "-c", "feature");
    repo.write("a.txt", "un\ndeux\n");
    repo.git("add", ".");
    repo.git("commit", "--quiet", "-m", "sujet", "-m", "le corps");
    const details = await getCommitDetails(createGitClient({ cwd: repo.work }), repo.git("rev-parse", "HEAD"));
    expect(details.body).toBe("le corps");
    expect(details.committer).toBe("Test");
    expect(details.files).toEqual([{ path: "a.txt", added: 2, deleted: 0 }]);
    expect(details.containedIn).toEqual([{ name: "feature", kind: "branch" }]);
  });

  it("refuse un hash qui pourrait être lu comme une option", async () => {
    await expect(getCommitDetails(createGitClient({ cwd: repo.work }), "--all")).rejects.toThrow("invalide");
  });
});
