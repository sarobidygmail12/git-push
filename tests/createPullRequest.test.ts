import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pullRequestCommand } from "../src/commands/pullRequest.js";
import { getDefaultBranch } from "../src/core/git/pullRequest.js";
import { createFakeContext, type FakeAnswers } from "./helpers/fakeContext.js";
import { createTempRepo, type TempRepo } from "./helpers/tempRepo.js";

const NEW_URL = "https://github.com/acme/app/pull/7";
const OPEN_URL = "https://github.com/acme/app/pull/3";
const BRANCH = "feature/a";
const EXECUTABLE_MODE = 0o755;

describe("/pr", () => {
  let repo: TempRepo;
  const originalPath = process.env.PATH;

  const argsFile = (): string => join(repo.root, "gh-create-args");

  const installFakeGh = ({ prView = "exit 1", prCreate = `echo ${NEW_URL}` } = {}): void => {
    const path = join(repo.root, "gh");
    writeFileSync(
      path,
      `#!/bin/sh
case "$1 $2" in
  "repo view") echo main ;;
  "pr view") ${prView} ;;
  "pr create")
    printf '%s\\n' "$@" > "${argsFile()}"
    ${prCreate} ;;
esac
`,
    );
    chmodSync(path, EXECUTABLE_MODE);
    process.env.PATH = `${repo.root}${delimiter}${originalPath ?? ""}`;
  };

  beforeEach(() => {
    repo = createTempRepo();
    repo.git("switch", "--quiet", "-c", BRANCH);
    repo.commit("a.txt", "a\n", "ajoute a");
    installFakeGh();
  });
  afterEach(() => {
    process.env.PATH = originalPath;
    repo.cleanup();
  });

  const run = async (answers: FakeAnswers): Promise<string[]> => {
    const ctx = createFakeContext(repo.work, answers);
    await pullRequestCommand.run(ctx, []);
    return vi.mocked(ctx.ui.log).mock.calls.map(([message]) => message);
  };

  const remoteHead = (): string => repo.git("ls-remote", "origin", `refs/heads/${BRANCH}`).split("\t")[0] ?? "";
  const createArgs = (): string[] => {
    const lines = readFileSync(argsFile(), "utf8");
    return lines.slice(0, lines.lastIndexOf("\n")).split("\n");
  };

  it("pousse la branche puis crée la PR avec le titre et la description saisis", async () => {
    const logs = await run({ ask: ["Mon titre", "Ma description"] });

    expect(remoteHead()).toBe(repo.git("rev-parse", "HEAD"));
    expect(createArgs()).toEqual(["pr", "create", "--title", "Mon titre", "--body", "Ma description"]);
    expect(logs).toEqual([`Pull request créée : ${NEW_URL}`]);
  });

  it("accepte une description vide", async () => {
    await run({ ask: ["Mon titre", ""] });

    expect(createArgs()).toEqual(["pr", "create", "--title", "Mon titre", "--body", ""]);
  });

  it.each([
    ["le titre", []],
    ["un titre vide", ["  "]],
    ["la description", ["Mon titre"]],
  ])("n'envoie rien si on annule sur %s", async (_step, ask) => {
    const logs = await run({ ask: [...ask] });

    expect(logs).toEqual(["Pull request annulée, rien n'a été envoyé."]);
    expect(remoteHead()).toBe("");
    expect(existsSync(argsFile())).toBe(false);
  });

  it("ne recrée pas une PR déjà ouverte", async () => {
    installFakeGh({ prView: `echo '{"url":"${OPEN_URL}","state":"OPEN"}'` });

    const logs = await run({ ask: ["Mon titre", "Ma description"] });

    expect(logs).toEqual([`Une pull request est déjà ouverte : ${OPEN_URL}`]);
    expect(existsSync(argsFile())).toBe(false);
  });

  it("refuse la branche par défaut", async () => {
    repo.git("switch", "--quiet", "main");

    await expect(run({ ask: ["Mon titre", ""] })).rejects.toThrow("branche par défaut");
  });

  it("remonte l'erreur de gh", async () => {
    installFakeGh({ prCreate: "echo 'No commits between main and feature/a' >&2; exit 1" });

    await expect(run({ ask: ["Mon titre", ""] })).rejects.toThrow("No commits between");
  });

  it("explique quand gh n'est pas installé", async () => {
    process.env.PATH = "/nonexistent";

    await expect(getDefaultBranch(repo.work)).rejects.toThrow("GitHub CLI");
  });
});
