import { GitError } from "../errors.js";
import type { GitClient } from "./gitClient.js";
import { assertNoOperationInProgress, getStatus, type RepoStatus } from "./status.js";

export const REMOTE_PREFIX = "refs/remotes/";
export const LOCAL_PREFIX = "refs/heads/";
const BACKUP_PREFIX = "backup/";
const BACKUP_HASH_LENGTH = 7;

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

export async function pushCurrentBranch(git: GitClient, status: RepoStatus): Promise<void> {
  if (!status.branch) throw new GitError("HEAD détaché : rien à pousser.");
  await git.run(status.upstream ? ["push"] : ["push", "-u", "origin", status.branch]);
}

/** À appeler avant tout effet de bord, pour qu'un nom refusé ne laisse pas un commit derrière lui. */
export async function assertCanStartBranch(git: GitClient, base: string, branchName: string): Promise<void> {
  await assertNoOperationInProgress(git);
  if (!(await isValidBranchName(git, branchName))) throw new GitError(`Nom de branche invalide : ${branchName}`);
  if (!(await branchExists(git, base))) throw new GitError(`La branche de base « ${base} » n'existe pas localement.`);
  if (await branchExists(git, branchName)) throw new GitError(`La branche « ${branchName} » existe déjà.`);
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
    throw new GitError(`Working tree non propre (${files.length} fichier(s)) : aucun changement de branche effectué.`);
  }
}
