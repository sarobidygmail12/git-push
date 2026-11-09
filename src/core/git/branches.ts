import { GitError } from "../errors.js";
import type { GitClient } from "./gitClient.js";
import { assertNoOperationInProgress, getStatus, type RepoStatus } from "./status.js";
import { t } from "../../lang/index.js";

export const REMOTE_PREFIX = "refs/remotes/";
export const LOCAL_PREFIX = "refs/heads/";
const BACKUP_PREFIX = "backup/";
const BACKUP_HASH_LENGTH = 7;
const LS_REMOTE_NOT_FOUND = 2;

export async function isValidBranchName(git: GitClient, name: string): Promise<boolean> {
  const { exitCode } = await git.run(["check-ref-format", "--branch", name], { allowFailure: true });
  return exitCode === 0;
}

export async function branchExists(git: GitClient, name: string): Promise<boolean> {
  const { exitCode } = await git.run(["show-ref", "--verify", "--quiet", `${LOCAL_PREFIX}${name}`], {
    allowFailure: true,
  });
  return exitCode === 0;
}

export async function listRefs(git: GitClient): Promise<string[]> {
  const { stdout } = await git.run(["for-each-ref", "--format=%(refname)", LOCAL_PREFIX, REMOTE_PREFIX]);
  return stdout.split("\n").filter((ref) => ref !== "" && !ref.endsWith("/HEAD"));
}

export function shortRefName(ref: string): string {
  return ref.startsWith(LOCAL_PREFIX) ? ref.slice(LOCAL_PREFIX.length) : ref.slice(REMOTE_PREFIX.length);
}

/** Noms acceptés par `git switch` : locaux, et distants sans le nom du remote. */
export async function listSwitchableBranches(git: GitClient): Promise<string[]> {
  const refs = await listRefs(git);
  return [...new Set(refs.map(toSwitchableName))].sort();
}

function toSwitchableName(ref: string): string {
  if (ref.startsWith(LOCAL_PREFIX)) return ref.slice(LOCAL_PREFIX.length);
  return ref.slice(REMOTE_PREFIX.length).split("/").slice(1).join("/");
}

export async function hasRemote(git: GitClient): Promise<boolean> {
  const { stdout } = await git.run(["remote"]);
  return stdout.trim() !== "";
}

export type BranchLocations = { local: boolean; remotes: readonly string[] };

export async function locateBranch(git: GitClient, name: string): Promise<BranchLocations> {
  const refs = await listRefs(git);
  return {
    local: refs.includes(`${LOCAL_PREFIX}${name}`),
    remotes: refs.filter((ref) => ref.startsWith(REMOTE_PREFIX) && toSwitchableName(ref) === name).map(remoteNameOf),
  };
}

function remoteNameOf(ref: string): string {
  const path = ref.slice(REMOTE_PREFIX.length);
  return path.slice(0, path.indexOf("/"));
}

/** Commits que seules les références supprimées atteignent : ni HEAD ni aucune autre branche ne les garde. */
export async function countCommitsLostByDeleting(git: GitClient, name: string, target: BranchLocations): Promise<number> {
  const deleted = [
    ...(target.local ? [`${LOCAL_PREFIX}${name}`] : []),
    ...target.remotes.map((remote) => `${REMOTE_PREFIX}${remote}/${name}`),
  ];
  const kept = (await listRefs(git)).filter((ref) => !deleted.includes(ref));
  const { stdout } = await git.run(["rev-list", "--count", ...deleted, "--not", "HEAD", ...kept]);
  return Number(stdout.trim());
}

/** `-D` et non `-d` : `-d` compare à l'upstream, et l'appelant a déjà fait confirmer les commits perdus. */
export async function deleteLocalBranch(git: GitClient, name: string): Promise<void> {
  await git.run(["branch", "-D", name], { destructiveConfirmed: true });
}

export async function deleteRemoteBranch(git: GitClient, remote: string, name: string): Promise<void> {
  const ref = `${LOCAL_PREFIX}${name}`;
  const { exitCode } = await git.run(["ls-remote", "--exit-code", remote, ref], { allowFailure: true });
  if (exitCode === LS_REMOTE_NOT_FOUND) {
    await git.run(["branch", "-d", "-r", `${remote}/${name}`]);
    return;
  }
  await git.run(["push", remote, "--delete", ref], { destructiveConfirmed: true });
}

export async function pushCurrentBranch(git: GitClient, status: RepoStatus): Promise<void> {
  if (!status.branch) throw new GitError(t("head.nothingToPush"));
  await git.run(status.upstream ? ["push"] : ["push", "-u", "origin", status.branch]);
}

/** À appeler avant tout effet de bord, pour qu'un nom refusé ne laisse pas un commit derrière lui. */
export async function assertCanStartBranch(git: GitClient, base: string, branchName: string): Promise<void> {
  await assertNoOperationInProgress(git);
  if (!(await isValidBranchName(git, branchName))) throw new GitError(t("branch.invalidName", { name: branchName }));
  if (!(await branchExists(git, base))) throw new GitError(t("branch.baseMissing", { base }));
  if (await branchExists(git, branchName)) throw new GitError(t("branch.exists", { name: branchName }));
}

export type StartedBranch = { branch: string; steps: readonly string[]; backupBranch?: string };

export type StartBranchOptions = {
  /** Si la base a divergé de son remote, la sauvegarde puis l'aligne sur le remote au lieu de s'arrêter. */
  forceDivergedBase?: boolean;
};

export async function startBranchFrom(
  git: GitClient,
  base: string,
  prefix: string,
  name: string,
  options: StartBranchOptions = {},
): Promise<StartedBranch> {
  const branch = `${prefix}${name}`;
  await assertCanStartBranch(git, base, branch);
  await assertCleanWorkingTree(git);

  await git.run(["switch", base]);
  const sync = await syncBaseWithRemote(git, options);
  await git.run(["switch", "-c", branch]);

  return {
    branch,
    steps: [`git switch ${base}`, ...sync.steps, `git switch -c ${branch}`],
    ...(sync.backupBranch === undefined ? {} : { backupBranch: sync.backupBranch }),
  };
}

type BaseSync = { steps: readonly string[]; backupBranch?: string };

async function syncBaseWithRemote(git: GitClient, options: StartBranchOptions): Promise<BaseSync> {
  const args = ["pull", "--ff-only"];
  const pull = await git.run(args, { allowFailure: true });
  if (pull.exitCode === 0) return { steps: ["git pull --ff-only"] };

  const status = await getStatus(git);
  if (options.forceDivergedBase && isDiverged(status) && status.upstream && status.branch && status.headHash) {
    return forceBaseToUpstream(git, status.branch, status.headHash, status.upstream);
  }
  const output = pull.stderr || pull.stdout;
  throw new GitError(output, { args, exitCode: pull.exitCode, stderr: output });
}

function isDiverged(status: RepoStatus): boolean {
  return status.ahead > 0 && status.behind > 0;
}

/** Le working tree est propre ici (vérifié avant le switch) : seuls les commits locaux changent, et ils sont sauvegardés. */
async function forceBaseToUpstream(git: GitClient, base: string, headHash: string, upstream: string): Promise<BaseSync> {
  const backupBranch = `${BACKUP_PREFIX}${base}-${headHash.slice(0, BACKUP_HASH_LENGTH)}`;
  if (!(await branchExists(git, backupBranch))) await git.run(["branch", backupBranch, headHash]);
  await git.run(["reset", "--hard", upstream], { destructiveConfirmed: true });
  return { steps: [`git branch ${backupBranch}`, `git reset --hard ${upstream}`], backupBranch };
}

async function assertCleanWorkingTree(git: GitClient): Promise<void> {
  const { files } = await getStatus(git);
  if (files.length > 0) {
    throw new GitError(t("branch.dirtyTree", { count: files.length }));
  }
}
