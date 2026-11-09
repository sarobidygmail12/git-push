import { GitError } from "../errors.js";
import type { GitClient } from "./gitClient.js";
import { t } from "../../lang/index.js";

const REMOTE = "origin";
const SCP_LIKE_REMOTE = /^(?:[^@/]+@)?([^:/]+):(?!\/\/)(.+)$/;
const DEFAULT_BRANCH_LINE = /^ref: refs\/heads\/(\S+)\s+HEAD$/m;

export type NewPullRequest = { title: string; body: string };

/** Demande au remote plutôt qu'à `origin/HEAD`, absent d'un dépôt créé par `git init` puis `remote add`. */
export async function getDefaultBranch(git: GitClient): Promise<string> {
  const { stdout } = await git.run(["ls-remote", "--symref", REMOTE, "HEAD"]);
  const branch = DEFAULT_BRANCH_LINE.exec(stdout)?.[1];
  if (!branch) throw new GitError(t("pr.noDefaultBranch"));
  return branch;
}

export async function getRepositoryWebUrl(git: GitClient): Promise<string> {
  const { stdout } = await git.run(["remote", "get-url", REMOTE]);
  const webUrl = toRepositoryWebUrl(stdout.trim());
  if (!webUrl) throw new GitError(t("pr.unknownRemote"));
  return webUrl;
}

/** Reconstruit l'adresse depuis l'hôte et le chemin seuls : un jeton présent dans le remote ne doit pas finir dans l'URL affichée. */
export function toRepositoryWebUrl(remoteUrl: string): string | undefined {
  const location = parseRemoteLocation(remoteUrl);
  if (!location) return undefined;
  const path = location.path.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
  return path.includes("/") ? `https://${location.host}/${path}` : undefined;
}

function parseRemoteLocation(remoteUrl: string): { host: string; path: string } | undefined {
  const [, scpHost, scpPath] = SCP_LIKE_REMOTE.exec(remoteUrl) ?? [];
  if (scpHost && scpPath) return { host: scpHost, path: scpPath };
  try {
    const url = new URL(remoteUrl);
    if (url.hostname === "") return undefined;
    return { host: url.protocol === "ssh:" ? url.hostname : url.host, path: url.pathname };
  } catch {
    return undefined;
  }
}

/** Git ne sait pas créer de pull request : cette page de GitHub s'ouvre avec le titre et la description déjà remplis. */
export function buildPullRequestUrl(repositoryUrl: string, base: string, head: string, { title, body }: NewPullRequest): string {
  const url = new URL(`${repositoryUrl}/compare/${encodeBranch(base)}...${encodeBranch(head)}`);
  url.searchParams.set("expand", "1");
  url.searchParams.set("title", title);
  if (body !== "") url.searchParams.set("body", body);
  return url.href;
}

function encodeBranch(branch: string): string {
  return branch.split("/").map(encodeURIComponent).join("/");
}
