import { GitError } from "../errors.js";
import type { GitClient } from "./gitClient.js";
import type { RepoStatus } from "./status.js";

export async function isHeadPushed(git: GitClient): Promise<boolean> {
  const { stdout } = await git.run(["branch", "-r", "--contains", "HEAD"]);
  return stdout.trim() !== "";
}

export async function countHeadParents(git: GitClient): Promise<number> {
  const { stdout } = await git.run(["rev-list", "--parents", "-n", "1", "HEAD"]);
  return stdout.trim().split(" ").length - 1;
}

export async function assertHeadNotPushed(git: GitClient, status: RepoStatus): Promise<void> {
  if (!status.headHash) throw new GitError("Le dépôt n'a encore aucun commit.");
  if (await isHeadPushed(git)) throw new GitError("Refusé : le dernier commit est déjà poussé.");
}

export async function readHeadMessage(git: GitClient): Promise<string> {
  const { stdout } = await git.run(["log", "-1", "--format=%B"]);
  return stdout.trimEnd();
}
