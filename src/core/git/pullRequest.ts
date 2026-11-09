import { execa, type Result } from "execa";
import { z } from "zod";
import { GitError } from "../errors.js";

const LOOKUP_TIMEOUT_MS = 10_000;
const CREATE_TIMEOUT_MS = 30_000;
const OPEN_STATE = "OPEN";
const COMMAND_NOT_FOUND = "ENOENT";

const pullRequestSchema = z.object({ url: z.string(), state: z.string() });

export type NewPullRequest = { title: string; body: string };

function runGh(cwd: string, args: readonly string[], timeout: number): Promise<Result> {
  return execa("gh", [...args], {
    cwd,
    reject: false,
    stdin: "ignore",
    detached: true,
    timeout,
    env: { GH_PROMPT_DISABLED: "1" },
  });
}

function toGhError(result: Result, args: readonly string[]): GitError {
  if (result.code === COMMAND_NOT_FOUND) {
    return new GitError("GitHub CLI (gh) est introuvable : installe-le depuis https://cli.github.com.", { args });
  }
  const output = String(result.stderr ?? "").trim() || result.message || `gh ${args.join(" ")} a échoué`;
  return new GitError(output, { args, stderr: output, ...(result.exitCode === undefined ? {} : { exitCode: result.exitCode }) });
}

/** `gh pr view` suit l'upstream de la branche courante : une PR ouverte depuis un fork est retrouvée aussi. */
export async function findOpenPullRequestUrl(cwd: string): Promise<string | undefined> {
  const result = await runGh(cwd, ["pr", "view", "--json", "url,state"], LOOKUP_TIMEOUT_MS);
  // gh absent, non connecté ou branche sans PR : le push a réussi, l'absence de lien n'est pas une erreur.
  if (result.failed) return undefined;
  const pullRequest = parsePullRequest(String(result.stdout ?? ""));
  return pullRequest?.state === OPEN_STATE ? pullRequest.url : undefined;
}

export async function getDefaultBranch(cwd: string): Promise<string> {
  const args = ["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"];
  const result = await runGh(cwd, args, LOOKUP_TIMEOUT_MS);
  if (result.failed) throw toGhError(result, args);
  return String(result.stdout ?? "").trim();
}

/** La branche doit déjà être sur le remote : sans terminal, `gh pr create` ne propose pas de la pousser. */
export async function createPullRequest(cwd: string, { title, body }: NewPullRequest): Promise<string> {
  const args = ["pr", "create", "--title", title, "--body", body];
  const result = await runGh(cwd, args, CREATE_TIMEOUT_MS);
  if (result.failed) throw toGhError(result, args);
  return String(result.stdout ?? "").trim();
}

function parsePullRequest(output: string): z.infer<typeof pullRequestSchema> | undefined {
  try {
    return pullRequestSchema.parse(JSON.parse(output));
  } catch {
    return undefined;
  }
}
