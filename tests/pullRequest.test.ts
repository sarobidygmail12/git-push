import { chmodSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pushCommand } from "../src/commands/push.js";
import { findOpenPullRequestUrl } from "../src/core/git/pullRequest.js";
import { createFakeContext } from "./helpers/fakeContext.js";
import { createTempRepo, type TempRepo } from "./helpers/tempRepo.js";

const PULL_REQUEST_URL = "https://github.com/acme/app/pull/42";

describe("/push et pull request", () => {
  let repo: TempRepo;
  const originalPath = process.env.PATH;

  beforeEach(() => {
    repo = createTempRepo();
    repo.git("switch", "--quiet", "-c", "feature/a");
    repo.commit("a.txt", "a\n", "a");
  });
  afterEach(() => {
    process.env.PATH = originalPath;
    repo.cleanup();
  });

  const installFakeGh = (script: string): void => {
    const path = join(repo.root, "gh");
    writeFileSync(path, `#!/bin/sh\n${script}\n`);
    chmodSync(path, 0o755);
    process.env.PATH = `${repo.root}${delimiter}${originalPath ?? ""}`;
  };

  const pushAndReadLogs = async (): Promise<string[]> => {
    const ctx = createFakeContext(repo.work, {});
    await pushCommand.run(ctx, []);
    return vi.mocked(ctx.ui.log).mock.calls.map(([message]) => message);
  };

  const remoteHead = (): string => repo.git("ls-remote", "origin", "refs/heads/feature/a").split("\t")[0] ?? "";

  it("affiche le lien quand la branche a une PR ouverte", async () => {
    installFakeGh(`echo '{"url":"${PULL_REQUEST_URL}","state":"OPEN"}'`);

    expect(await pushAndReadLogs()).toEqual(["Poussé.", `Pull request : ${PULL_REQUEST_URL}`]);
  });

  it.each(["MERGED", "CLOSED"])("n'affiche pas de lien pour une PR %s", async (state) => {
    installFakeGh(`echo '{"url":"${PULL_REQUEST_URL}","state":"${state}"}'`);

    expect(await pushAndReadLogs()).toEqual(["Poussé."]);
  });

  it("n'échoue pas quand gh ne trouve rien ou n'est pas connecté", async () => {
    installFakeGh("echo 'no pull requests found' >&2; exit 1");

    expect(await pushAndReadLogs()).toEqual(["Poussé."]);
    expect(remoteHead()).toBe(repo.git("rev-parse", "HEAD"));
  });

  it("ignore une sortie illisible de gh", async () => {
    installFakeGh("echo 'pas du json'");

    expect(await pushAndReadLogs()).toEqual(["Poussé."]);
  });

  it("n'échoue pas quand gh n'est pas installé", async () => {
    process.env.PATH = "/nonexistent";

    await expect(findOpenPullRequestUrl(repo.work)).resolves.toBeUndefined();
  });
});
