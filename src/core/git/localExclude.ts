import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { GitClient } from "./gitClient.js";

/** Ignore un fichier dans ce clone uniquement, sans toucher au `.gitignore` partagé. */
export async function addLocalExclude(git: GitClient, pattern: string): Promise<void> {
  const { stdout } = await git.run(["rev-parse", "--git-path", "info/exclude"]);
  const excludePath = resolve(git.cwd, stdout.trim());
  const current = existsSync(excludePath) ? await readFile(excludePath, "utf8") : "";
  if (current.split("\n").includes(pattern)) return;

  await mkdir(dirname(excludePath), { recursive: true });
  const separator = current === "" || current.endsWith("\n") ? "" : "\n";
  await appendFile(excludePath, `${separator}${pattern}\n`);
}
