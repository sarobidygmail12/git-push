import { basename } from "node:path";
import { GitError } from "../errors.js";
import type { GitClient } from "./gitClient.js";
import { listRefs, LOCAL_PREFIX, REMOTE_PREFIX, shortRefName } from "./branches.js";

export const LOG_PAGE_SIZE = 100;

const FIELD_SEPARATOR = "\u001f";
const LOG_FORMAT = ["%H", "%h", "%P", "%an", "%aI", "%D", "%s", "%S"].join("%x1f");
const FULL_DECORATIONS = "--decorate=full";
const HEX_DIGITS = "0123456789abcdefABCDEF";
const MIN_HASH_LENGTH = 4;
const HEAD_ARROW = "HEAD -> ";
const TAG_PREFIX = "tag: ";
const TAGS_NAMESPACE = "refs/tags/";
const STASH_REF = "refs/stash";
const REMOTE_HEAD_SUFFIX = "/HEAD";
const MAX_DETAIL_FILES = 300;

/** Par ordre de priorité : un ancêtre partagé appartient à la branche la plus stable, pas à celle qui en est partie. */
const MAINLINE_BRANCHES = ["main", "master", "preprod", "develop"];
const CURRENT_BRANCH_RANK = MAINLINE_BRANCHES.length;
const OTHER_BRANCH_RANK = CURRENT_BRANCH_RANK + 1;

export type LogRef = { name: string; kind: "head" | "branch" | "remote" | "tag" | "stash" };

export type LogCommit = {
  hash: string;
  shortHash: string;
  parents: readonly string[];
  author: string;
  date: string;
  refs: readonly LogRef[];
  subject: string;
  /** Référence par laquelle git a atteint le commit : dernier recours pour le rattacher à une branche. */
  source: string;
};

export type AnnotatedCommit = LogCommit & { branch: string; onCurrentBranch: boolean };

export type LogSearchField = "message" | "author" | "hash";

export type LogQuery = { page: number; search: string; field: LogSearchField; branch: string };

export type LogPage = { commits: readonly AnnotatedCommit[]; hasMore: boolean; page: number };

export type RepoHead = { branch: string | null; hash: string | null };

export type LocalBranch = { name: string; ahead: number; behind: number };

export type RepoOverview = {
  name: string;
  head: RepoHead;
  local: readonly LocalBranch[];
  remote: readonly string[];
  tags: readonly string[];
  authors: readonly { name: string; commits: number }[];
};

export type ChangedFile = { path: string; added: number | null; deleted: number | null };

export type CommitDetails = {
  body: string;
  committer: string;
  files: readonly ChangedFile[];
  fileCount: number;
  containedIn: readonly LogRef[];
};

export function isCommitHash(text: string): boolean {
  return text.length >= MIN_HASH_LENGTH && [...text].every((character) => HEX_DIGITS.includes(character));
}

export function parseGitLog(output: string): LogCommit[] {
  return output.split("\0").filter((record) => record.trim() !== "").map(parseCommit);
}

function parseCommit(record: string): LogCommit {
  const [hash = "", shortHash = "", parents = "", author = "", date = "", refs = "", subject = "", source = ""] = record
    .trim()
    .split(FIELD_SEPARATOR);
  return {
    hash,
    shortHash,
    parents: parents === "" ? [] : parents.split(" "),
    author,
    date,
    refs: parseRefs(refs),
    subject,
    source,
  };
}

export function parseRefs(decoration: string): LogRef[] {
  return decoration === "" ? [] : decoration.split(", ").flatMap(parseRef);
}

function parseRef(text: string): LogRef[] {
  if (text.startsWith(HEAD_ARROW)) return [{ name: "HEAD", kind: "head" }, ...parseRef(text.slice(HEAD_ARROW.length))];
  if (text === "HEAD") return [{ name: "HEAD", kind: "head" }];
  if (text.startsWith(TAG_PREFIX)) return [{ name: stripPrefix(text.slice(TAG_PREFIX.length), TAGS_NAMESPACE), kind: "tag" }];
  if (text === STASH_REF) return [{ name: "stash", kind: "stash" }];
  if (text.startsWith(REMOTE_PREFIX)) {
    return text.endsWith(REMOTE_HEAD_SUFFIX) ? [] : [{ name: text.slice(REMOTE_PREFIX.length), kind: "remote" }];
  }
  return [{ name: stripPrefix(text, LOCAL_PREFIX), kind: "branch" }];
}

function stripPrefix(text: string, prefix: string): string {
  return text.startsWith(prefix) ? text.slice(prefix.length) : text;
}

type BranchCandidate = { name: string; rank: number };

/**
 * Git ne mémorise pas la branche d'un commit : on la déduit en descendant les premiers parents
 * depuis chaque pointe de branche. `commits` doit lister les enfants avant leurs parents.
 */
export function annotateCommits(commits: readonly LogCommit[], head: RepoHead): AnnotatedCommit[] {
  const inherited = new Map<string, BranchCandidate>();
  const reachableFromHead = new Set(head.hash === null ? [] : [head.hash]);

  return commits.map((commit) => {
    const candidate = pickBranch(commit, inherited.get(commit.hash), head.branch);
    const onCurrentBranch = reachableFromHead.has(commit.hash);
    if (onCurrentBranch) commit.parents.forEach((parent) => reachableFromHead.add(parent));

    const [firstParent] = commit.parents;
    if (firstParent !== undefined && candidate !== undefined) {
      const known = inherited.get(firstParent);
      if (known === undefined || candidate.rank < known.rank) inherited.set(firstParent, candidate);
    }
    return { ...commit, branch: candidate?.name ?? "", onCurrentBranch };
  });
}

function pickBranch(commit: LogCommit, inherited: BranchCandidate | undefined, currentBranch: string | null): BranchCandidate | undefined {
  const tips = (kind: LogRef["kind"]): BranchCandidate[] =>
    commit.refs.filter((ref) => ref.kind === kind).map((ref) => toCandidate(ref, currentBranch));
  const lineage = [...tips("branch"), ...(inherited ? [inherited] : []), ...tips("remote")];
  const candidates = lineage.length > 0 ? lineage : sourceCandidate(commit.source, currentBranch);
  return candidates.reduce<BranchCandidate | undefined>((best, next) => (best === undefined || next.rank < best.rank ? next : best), undefined);
}

function toCandidate(ref: LogRef, currentBranch: string | null): BranchCandidate {
  const localName = ref.kind === "remote" ? ref.name.slice(ref.name.indexOf("/") + 1) : ref.name;
  const mainlineIndex = MAINLINE_BRANCHES.indexOf(localName);
  if (mainlineIndex !== -1) return { name: ref.name, rank: mainlineIndex };
  return { name: ref.name, rank: ref.kind === "branch" && ref.name === currentBranch ? CURRENT_BRANCH_RANK : OTHER_BRANCH_RANK };
}

function sourceCandidate(source: string, currentBranch: string | null): BranchCandidate[] {
  if (source === "HEAD") return [toCandidate({ name: currentBranch ?? "HEAD", kind: "branch" }, currentBranch)];
  if (source.startsWith(LOCAL_PREFIX)) return [toCandidate({ name: source.slice(LOCAL_PREFIX.length), kind: "branch" }, currentBranch)];
  if (source.startsWith(REMOTE_PREFIX)) return [toCandidate({ name: source.slice(REMOTE_PREFIX.length), kind: "remote" }, currentBranch)];
  return [];
}

export async function getLogPage(git: GitClient, query: LogQuery): Promise<LogPage> {
  const refs = await listRefs(git);
  const emptyPage: LogPage = { commits: [], hasMore: false, page: query.page };

  const selectedRef = query.branch === "" ? undefined : refs.find((ref) => shortRefName(ref) === query.branch);
  if (query.branch !== "" && !selectedRef) return emptyPage;

  const head = await readHead(git);
  if (query.field === "hash" && query.search !== "") {
    return { ...emptyPage, commits: annotateCommits(await findCommitByHash(git, query.search), head) };
  }

  const { stdout } = await git.run(buildLogArgs(query, selectedRef));
  const commits = annotateCommits(parseGitLog(stdout), head);
  const pageEnd = (query.page + 1) * LOG_PAGE_SIZE;
  return { ...emptyPage, commits: commits.slice(query.page * LOG_PAGE_SIZE, pageEnd), hasMore: commits.length > pageEnd };
}

/** Sans `--skip` : rattacher une page à ses branches demande de connaître les commits des pages précédentes. */
export function buildLogArgs(query: LogQuery, selectedRef: string | undefined): string[] {
  return [
    "log",
    `--format=${LOG_FORMAT}`,
    FULL_DECORATIONS,
    "-z",
    "--date-order",
    `--max-count=${(query.page + 1) * LOG_PAGE_SIZE + 1}`,
    ...searchArgs(query),
    selectedRef ?? "--all",
  ];
}

function searchArgs(query: LogQuery): string[] {
  if (query.search === "") return [];
  const option = query.field === "author" ? "--author" : "--grep";
  return [`${option}=${query.search}`, "--fixed-strings", "--regexp-ignore-case"];
}

async function findCommitByHash(git: GitClient, hash: string): Promise<LogCommit[]> {
  if (!isCommitHash(hash)) return [];
  const { stdout, exitCode } = await git.run(["log", `--format=${LOG_FORMAT}`, FULL_DECORATIONS, "-z", "--max-count=1", hash, "--"], {
    allowFailure: true,
  });
  return exitCode === 0 ? parseGitLog(stdout) : [];
}

export async function readHead(git: GitClient): Promise<RepoHead> {
  const [branch, hash] = await Promise.all([
    git.run(["symbolic-ref", "--short", "--quiet", "HEAD"], { allowFailure: true }),
    git.run(["rev-parse", "--verify", "--quiet", "HEAD"], { allowFailure: true }),
  ]);
  return {
    branch: branch.exitCode === 0 ? branch.stdout.trim() : null,
    hash: hash.exitCode === 0 ? hash.stdout.trim() : null,
  };
}

export async function getRepoOverview(git: GitClient): Promise<RepoOverview> {
  const [topLevel, head, refs, authors] = await Promise.all([
    git.run(["rev-parse", "--show-toplevel"]),
    readHead(git),
    git.run(["for-each-ref", "--format=%(refname)%1f%(upstream:track,nobracket)", LOCAL_PREFIX, REMOTE_PREFIX, TAGS_NAMESPACE]),
    git.run(["shortlog", "--summary", "--numbered", "--all"], { allowFailure: true }),
  ]);
  const rows = refs.stdout.split("\n").filter((row) => row !== "").map((row) => row.split(FIELD_SEPARATOR));
  const namesUnder = (namespace: string): string[] =>
    rows.flatMap(([ref = ""]) => (ref.startsWith(namespace) && !ref.endsWith(REMOTE_HEAD_SUFFIX) ? [ref.slice(namespace.length)] : []));
  const local = rows.flatMap(([ref = "", track = ""]) =>
    ref.startsWith(LOCAL_PREFIX) ? [{ name: ref.slice(LOCAL_PREFIX.length), ahead: trackCount(track, "ahead"), behind: trackCount(track, "behind") }] : [],
  );
  return {
    name: basename(topLevel.stdout.trim()),
    head,
    local,
    remote: namesUnder(REMOTE_PREFIX),
    tags: namesUnder(TAGS_NAMESPACE),
    authors: parseShortlog(authors.stdout),
  };
}

function trackCount(track: string, direction: "ahead" | "behind"): number {
  return Number(new RegExp(`${direction} (\\d+)`).exec(track)?.[1] ?? 0);
}

export function parseShortlog(output: string): { name: string; commits: number }[] {
  return output.split("\n").filter((line) => line.trim() !== "").map((line) => {
    const [count = "0", name = ""] = line.trim().split("\t");
    return { name, commits: Number(count) };
  });
}

export async function getCommitDetails(git: GitClient, hash: string): Promise<CommitDetails> {
  if (!isCommitHash(hash)) throw new GitError(`Hash de commit invalide : ${hash}`);
  const [metadata, stats, containing] = await Promise.all([
    git.run(["show", "--no-patch", "--format=%cn%x1f%b", hash, "--"]),
    git.run(["-c", "core.quotePath=false", "show", "--format=", "--numstat", "-m", "--first-parent", hash, "--"]),
    git.run(["for-each-ref", `--contains=${hash}`, "--format=%(refname)", LOCAL_PREFIX, REMOTE_PREFIX]),
  ]);
  const [committer = "", body = ""] = metadata.stdout.split(FIELD_SEPARATOR);
  const files = parseNumstat(stats.stdout);
  return {
    body: body.trim(),
    committer,
    files: files.slice(0, MAX_DETAIL_FILES),
    fileCount: files.length,
    containedIn: containing.stdout.split("\n").filter((ref) => ref !== "").flatMap(parseRef),
  };
}

export function parseNumstat(output: string): ChangedFile[] {
  return output.split("\n").filter((line) => line !== "").map((line) => {
    const [added = "-", deleted = "-", ...path] = line.split("\t");
    return { path: path.join("\t"), added: added === "-" ? null : Number(added), deleted: deleted === "-" ? null : Number(deleted) };
  });
}
