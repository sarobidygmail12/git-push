import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TempRepo = {
  root: string;
  work: string;
  git: (...args: string[]) => string;
  write: (path: string, content: string) => void;
  commit: (path: string, content: string, message: string) => void;
  cleanup: () => void;
};

function runGit(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Crée un clone de travail relié à un remote nu, avec main, develop et preprod poussées. */
export function createTempRepo(): TempRepo {
  const root = mkdtempSync(join(tmpdir(), "gitpilot-test-"));
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  runGit(root, ["init", "--quiet", "--bare", "--initial-branch=main", origin]);
  runGit(root, ["clone", "--quiet", origin, work]);

  const git = (...args: string[]): string => runGit(work, args);
  const write = (path: string, content: string): void => writeFileSync(join(work, path), content);
  const commit = (path: string, content: string, message: string): void => {
    write(path, content);
    git("add", ".");
    git("commit", "--quiet", "-m", message);
  };

  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("switch", "--quiet", "-C", "main");
  commit("file.txt", "initial\n", "initial");
  git("push", "--quiet", "-u", "origin", "main");
  ["develop", "preprod"].forEach((branch) => {
    git("switch", "--quiet", "-c", branch);
    git("push", "--quiet", "-u", "origin", branch);
  });
  git("switch", "--quiet", "main");

  return { root, work, git, write, commit, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
