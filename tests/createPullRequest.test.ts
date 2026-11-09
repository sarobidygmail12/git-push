import open from "open";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pullRequestCommand } from "../src/commands/pullRequest.js";
import { buildPullRequestUrl, toRepositoryWebUrl } from "../src/core/git/pullRequest.js";
import { createFakeContext, type FakeAnswers } from "./helpers/fakeContext.js";
import { createTempRepo, type TempRepo } from "./helpers/tempRepo.js";

vi.mock("open", () => ({ default: vi.fn(() => Promise.resolve({ once: vi.fn() })) }));

const GITHUB_REMOTE = "git@github.com:acme/app.git";
const BRANCH = "feature/a";

describe("/pr", () => {
  let repo: TempRepo;

  beforeEach(() => {
    vi.mocked(open).mockClear();
    repo = createTempRepo();
    repo.git("switch", "--quiet", "-c", BRANCH);
    repo.commit("a.txt", "a\n", "ajoute a");
  });
  afterEach(() => repo.cleanup());

  /** Le remote de test est un dossier local : seule l'adresse lue pour construire l'URL est remplacée. */
  const run = async (answers: FakeAnswers, remoteUrl: string = GITHUB_REMOTE): Promise<string[]> => {
    const ctx = createFakeContext(repo.work, answers);
    const realRun = ctx.git.run.bind(ctx.git);
    vi.spyOn(ctx.git, "run").mockImplementation(async (args, options) => {
      const result = await realRun(args, options);
      return args.join(" ") === "remote get-url origin" ? { ...result, stdout: remoteUrl } : result;
    });
    await pullRequestCommand.run(ctx, []);
    return vi.mocked(ctx.ui.log).mock.calls.map(([message]) => message);
  };

  const remoteHead = (): string => repo.git("ls-remote", "origin", `refs/heads/${BRANCH}`).split("\t")[0] ?? "";

  it("pousse la branche puis ouvre la page GitHub avec le titre et la description", async () => {
    const logs = await run({ ask: ["Mon titre", "Ma description"] });

    const url = "https://github.com/acme/app/compare/main...feature/a?expand=1&title=Mon+titre&body=Ma+description";
    expect(remoteHead()).toBe(repo.git("rev-parse", "HEAD"));
    expect(open).toHaveBeenCalledWith(url);
    expect(logs).toEqual(["Termine la pull request dans ton navigateur :", url]);
  });

  it("omet une description vide", async () => {
    await run({ ask: ["Mon titre", ""] });

    expect(open).toHaveBeenCalledWith("https://github.com/acme/app/compare/main...feature/a?expand=1&title=Mon+titre");
  });

  it.each([
    ["le titre", []],
    ["un titre vide", ["  "]],
    ["la description", ["Mon titre"]],
  ])("n'envoie rien si on annule sur %s", async (_step, ask) => {
    const logs = await run({ ask: [...ask] });

    expect(logs).toEqual(["Pull request annulée, rien n'a été envoyé."]);
    expect(remoteHead()).toBe("");
    expect(open).not.toHaveBeenCalled();
  });

  it("refuse la branche par défaut", async () => {
    repo.git("switch", "--quiet", "main");

    await expect(run({ ask: ["Mon titre", ""] })).rejects.toThrow("branche par défaut");
  });

  it("refuse un remote qui n'est pas un dépôt web, sans rien poser comme question", async () => {
    await expect(run({ ask: [] }, "/srv/git/app.git")).rejects.toThrow("dépôt GitHub");
    expect(remoteHead()).toBe("");
  });
});

describe("adresse de la pull request", () => {
  it.each([
    ["git@github.com:acme/app.git", "https://github.com/acme/app"],
    ["ssh://git@github.com/acme/app.git", "https://github.com/acme/app"],
    ["https://github.com/acme/app.git", "https://github.com/acme/app"],
    ["https://github.com/acme/app/", "https://github.com/acme/app"],
    ["https://user:secret@github.com/acme/app.git", "https://github.com/acme/app"],
  ])("comprend %s", (remote, expected) => {
    expect(toRepositoryWebUrl(remote)).toBe(expected);
  });

  it.each(["/srv/git/app.git", "file:///srv/git/app.git", "https://github.com/app"])("rejette %s", (remote) => {
    expect(toRepositoryWebUrl(remote)).toBeUndefined();
  });

  it("ouvre une merge request sur GitLab, sous-groupes compris", () => {
    const url = new URL(buildPullRequestUrl("https://gitlab.com/acme/team/app", "main", "feature/a", { title: "Titre", body: "Détail" }));

    expect(url.origin + url.pathname).toBe("https://gitlab.com/acme/team/app/-/merge_requests/new");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      "merge_request[source_branch]": "feature/a",
      "merge_request[target_branch]": "main",
      "merge_request[title]": "Titre",
      "merge_request[description]": "Détail",
    });
  });

  it("encode les caractères spéciaux sans casser les / des branches", () => {
    const url = buildPullRequestUrl("https://github.com/acme/app", "main", "feature/a#1", { title: "a&b", body: "" });

    expect(url).toBe("https://github.com/acme/app/compare/main...feature/a%231?expand=1&title=a%26b");
  });
});
