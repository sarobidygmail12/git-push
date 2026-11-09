import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { GitClient } from "./gitClient.js";

const MANAGED_BLOCK_START = "# >>> gitpilot : option ignore";
const MANAGED_BLOCK_END = "# <<< gitpilot : option ignore";

async function resolveExcludePath(git: GitClient): Promise<string> {
  const { stdout } = await git.run(["rev-parse", "--git-path", "info/exclude"]);
  return resolve(git.cwd, stdout.trim());
}

async function readExcludeFile(path: string): Promise<string> {
  return existsSync(path) ? readFile(path, "utf8") : "";
}

function lineSeparatorAfter(content: string): string {
  return content === "" || content.endsWith("\n") ? "" : "\n";
}

/** Ignore un fichier dans ce clone uniquement, sans toucher au `.gitignore` partagé. */
export async function addLocalExclude(git: GitClient, pattern: string): Promise<void> {
  const excludePath = await resolveExcludePath(git);
  const current = await readExcludeFile(excludePath);
  if (current.split("\n").includes(pattern)) return;

  await mkdir(dirname(excludePath), { recursive: true });
  await appendFile(excludePath, `${lineSeparatorAfter(current)}${pattern}\n`);
}

/** Aligne le bloc géré par gitpilot sur l'option `ignore`, sans toucher aux autres lignes du fichier. */
export async function syncIgnoredPatterns(git: GitClient, patterns: readonly string[]): Promise<void> {
  const excludePath = await resolveExcludePath(git);
  const current = await readExcludeFile(excludePath);
  const updated = withManagedBlock(withoutManagedBlock(current), patterns);
  if (updated === current) return;

  await mkdir(dirname(excludePath), { recursive: true });
  await writeFile(excludePath, updated);
}

function withoutManagedBlock(content: string): string {
  const lines = content.split("\n");
  const start = lines.indexOf(MANAGED_BLOCK_START);
  const end = lines.indexOf(MANAGED_BLOCK_END);
  if (start === -1 || end < start) return content;
  return [...lines.slice(0, start), ...lines.slice(end + 1)].join("\n");
}

function withManagedBlock(content: string, patterns: readonly string[]): string {
  if (patterns.length === 0) return content;
  const block = [MANAGED_BLOCK_START, ...patterns, MANAGED_BLOCK_END, ""].join("\n");
  return `${content}${lineSeparatorAfter(content)}${block}`;
}
