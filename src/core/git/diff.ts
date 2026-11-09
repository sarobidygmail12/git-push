import type { GitClient } from "./gitClient.js";
import { isSensitivePath } from "./sensitive.js";

export const MAX_DIFF_CHARS = 12_000;

export type StagedFile = { path: string; originalPath?: string; status: string };

export type StagedChanges = { files: readonly StagedFile[]; diff: string; truncated: boolean };

export async function getStagedChanges(git: GitClient, maxChars: number = MAX_DIFF_CHARS): Promise<StagedChanges> {
  const { stdout } = await git.run(["diff", "--cached", "--name-status", "-z"]);
  const files = parseNameStatus(stdout);
  if (files.length === 0) return { files, diff: "", truncated: false };

  const { stdout: diff } = await git.run(["-c", "core.quotePath=false", "diff", "--cached", "--no-color", "--no-ext-diff", "--", ".", ...sensitiveExclusions(files)]);
  return { files, diff: diff.slice(0, maxChars), truncated: diff.length > maxChars };
}

type NameStatusScan = { files: StagedFile[]; status: string | undefined; renameOrigin: string | undefined };

/** Format `-z` : statut, chemin ; et pour un renommage ou une copie, statut, ancien chemin, nouveau chemin. */
export function parseNameStatus(output: string): StagedFile[] {
  const fields = output.split("\0").filter((field) => field !== "");
  return fields.reduce<NameStatusScan>(scanNameStatusField, { files: [], status: undefined, renameOrigin: undefined }).files;
}

function scanNameStatusField(scan: NameStatusScan, field: string): NameStatusScan {
  if (scan.status === undefined) return { ...scan, status: field.charAt(0) };
  if (isTwoPathStatus(scan.status) && scan.renameOrigin === undefined) return { ...scan, renameOrigin: field };
  scan.files.push({
    path: field,
    status: scan.status,
    ...(scan.renameOrigin === undefined ? {} : { originalPath: scan.renameOrigin }),
  });
  return { files: scan.files, status: undefined, renameOrigin: undefined };
}

function isTwoPathStatus(status: string): boolean {
  return status === "R" || status === "C";
}

/** Le nom du fichier reste envoyé à l'IA, jamais son contenu. */
function sensitiveExclusions(files: readonly StagedFile[]): string[] {
  return files
    .flatMap((file) => (file.originalPath === undefined ? [file.path] : [file.path, file.originalPath]))
    .filter(isSensitivePath)
    .map((path) => `:(exclude,literal)${path}`);
}
