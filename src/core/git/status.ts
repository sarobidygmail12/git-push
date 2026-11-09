import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GitError } from "../errors.js";
import type { GitClient } from "./gitClient.js";
import { t } from "../../lang/index.js";

export type FileChange = {
  path: string;
  originalPath?: string;
  index: string;
  worktree: string;
  kind: "tracked" | "renamed" | "conflict" | "untracked";
};

export type RepoStatus = {
  /** `undefined` en HEAD détaché. */
  branch: string | undefined;
  /** `undefined` tant que le dépôt n'a aucun commit. */
  headHash: string | undefined;
  upstream: string | undefined;
  ahead: number;
  behind: number;
  files: readonly FileChange[];
};

export type OperationInProgress = "merge" | "cherry-pick" | "revert" | "rebase" | "bisect";

const OPERATION_MARKERS: ReadonlyArray<readonly [string, OperationInProgress]> = [
  ["MERGE_HEAD", "merge"],
  ["CHERRY_PICK_HEAD", "cherry-pick"],
  ["REVERT_HEAD", "revert"],
  ["rebase-merge", "rebase"],
  ["rebase-apply", "rebase"],
  ["BISECT_LOG", "bisect"],
];

const UNCHANGED = ".";
const UNTRACKED = "?";

/** Nombre de champs avant le chemin, qui peut lui-même contenir des espaces. */
const ORDINARY_FIELDS_BEFORE_PATH = 8;
const RENAMED_FIELDS_BEFORE_PATH = 9;
const CONFLICT_FIELDS_BEFORE_PATH = 10;
const SHORT_HASH_LENGTH = 7;

/** Sans `listEachUntrackedFile`, Git résume un dossier non suivi en une seule entrée. */
export async function getStatus(
  git: GitClient,
  { listEachUntrackedFile = false }: { listEachUntrackedFile?: boolean } = {},
): Promise<RepoStatus> {
  const untrackedArgs = listEachUntrackedFile ? ["--untracked-files=all"] : [];
  const { stdout } = await git.run(["status", "--porcelain=v2", "--branch", "-z", ...untrackedArgs]);
  return parseStatus(stdout);
}

export function parseStatus(output: string): RepoStatus {
  const records = output.split("\0").filter((record) => record !== "");
  const headers = new Map(records.filter((record) => record.startsWith("# ")).map(parseHeader));
  const [ahead, behind] = parseAheadBehind(headers.get("branch.ab"));
  const head = headers.get("branch.head");
  const oid = headers.get("branch.oid");

  return {
    branch: head === undefined || head === "(detached)" ? undefined : head,
    headHash: oid === undefined || oid === "(initial)" ? undefined : oid,
    upstream: headers.get("branch.upstream"),
    ahead,
    behind,
    files: parseFileRecords(records.filter((record) => !record.startsWith("# "))),
  };
}

function parseHeader(record: string): [string, string] {
  const [key = "", ...value] = record.slice("# ".length).split(" ");
  return [key, value.join(" ")];
}

function parseAheadBehind(value: string | undefined): [number, number] {
  const [ahead = "+0", behind = "-0"] = value?.split(" ") ?? [];
  return [Number(ahead.slice(1)), Number(behind.slice(1))];
}

type RecordScan = { files: FileChange[]; renameAwaitingOrigin: FileChange | undefined };

/** Un renommage occupe deux enregistrements : le second est le chemin d'origine. */
function parseFileRecords(records: readonly string[]): FileChange[] {
  return records.reduce<RecordScan>(scanRecord, { files: [], renameAwaitingOrigin: undefined }).files;
}

function scanRecord(scan: RecordScan, record: string): RecordScan {
  if (scan.renameAwaitingOrigin) {
    scan.files.push({ ...scan.renameAwaitingOrigin, originalPath: record });
    return { files: scan.files, renameAwaitingOrigin: undefined };
  }
  if (record.startsWith("2 ")) {
    return { files: scan.files, renameAwaitingOrigin: parseWithState(record, RENAMED_FIELDS_BEFORE_PATH, "renamed") };
  }
  const change = parseSingleRecord(record);
  if (change) scan.files.push(change);
  return scan;
}

function parseSingleRecord(record: string): FileChange | undefined {
  if (record.startsWith("? ")) {
    return { path: record.slice("? ".length), index: UNTRACKED, worktree: UNTRACKED, kind: "untracked" };
  }
  if (record.startsWith("1 ")) return parseWithState(record, ORDINARY_FIELDS_BEFORE_PATH, "tracked");
  if (record.startsWith("u ")) return parseWithState(record, CONFLICT_FIELDS_BEFORE_PATH, "conflict");
  return undefined;
}

function parseWithState(record: string, fieldsBeforePath: number, kind: FileChange["kind"]): FileChange {
  const fields = record.split(" ");
  const state = fields[1] ?? "";
  return {
    path: fields.slice(fieldsBeforePath).join(" "),
    index: state.charAt(0),
    worktree: state.charAt(1),
    kind,
  };
}

export const isStaged = (file: FileChange): boolean =>
  file.kind !== "untracked" && file.kind !== "conflict" && file.index !== UNCHANGED;

export const isUnstaged = (file: FileChange): boolean =>
  file.kind === "untracked" || (file.kind !== "conflict" && file.worktree !== UNCHANGED);

export const isConflict = (file: FileChange): boolean => file.kind === "conflict";

export type ChangeCounts = { added: number; deleted: number; modified: number };

export function countChanges(files: readonly FileChange[]): ChangeCounts {
  const counts: ChangeCounts = { added: 0, deleted: 0, modified: 0 };
  files.forEach((file) => {
    counts[categorizeChange(file)] += 1;
  });
  return counts;
}

function categorizeChange(file: FileChange): keyof ChangeCounts {
  if (file.kind === "untracked") return "added";
  if (file.kind !== "tracked") return "modified";
  if (file.index === "D" || file.worktree === "D") return "deleted";
  return file.index === "A" || file.worktree === "A" ? "added" : "modified";
}

export async function getRepoRoot(git: GitClient): Promise<string | undefined> {
  const { stdout, exitCode } = await git.run(["rev-parse", "--show-toplevel"], { allowFailure: true });
  return exitCode === 0 && stdout !== "" ? stdout : undefined;
}

export async function getOperationInProgress(git: GitClient): Promise<OperationInProgress | undefined> {
  const { stdout: gitDir } = await git.run(["rev-parse", "--absolute-git-dir"]);
  return OPERATION_MARKERS.find(([marker]) => existsSync(join(gitDir, marker)))?.[1];
}

export async function assertNoOperationInProgress(git: GitClient): Promise<void> {
  const operation = await getOperationInProgress(git);
  if (operation) throw new GitError(t("status.operationInProgress", { operation }));
}

export function describeBranch(status: RepoStatus): string {
  return status.branch ?? t("head.detachedWithHash", { hash: status.headHash?.slice(0, SHORT_HASH_LENGTH) ?? "?" });
}

export function describeStatusLine(status: RepoStatus): string {
  const count = status.files.length;
  const changes = count === 0 ? t("status.noChanges") : t("status.changedFiles", { count });
  return t("status.line", { branch: describeBranch(status), changes });
}

/** Filet commun : après une étape en échec, on dit où en est le dépôt. */
export async function describeRepoState(git: GitClient): Promise<string | undefined> {
  const root = await getRepoRoot(git);
  if (!root) return undefined;
  const [status, operation] = await Promise.all([getStatus(git), getOperationInProgress(git)]);
  return operation ? `${describeStatusLine(status)}, ${operation} en cours` : describeStatusLine(status);
}

const CONFLICT_MARKER = "<<<<<<<";

export async function isConflictResolved(git: GitClient, path: string): Promise<boolean> {
  try {
    const content = await readFile(join(git.cwd, path), "utf8");
    return !content.includes(CONFLICT_MARKER);
  } catch {
    return false;
  }
}
