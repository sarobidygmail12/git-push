import { execa } from "execa";
import { GitError } from "../errors.js";

export type GitResult = { stdout: string; stderr: string; exitCode: number };

export type GitRunOptions = {
  allowFailure?: boolean;
  destructiveConfirmed?: boolean;
};

export interface GitClient {
  readonly cwd: string;
  run(args: readonly string[], options?: GitRunOptions): Promise<GitResult>;
}

export type GitClientOptions = {
  cwd: string;
  /** Appelé avant chaque commande. Absent : client silencieux (en-tête, autocomplétion, API web). */
  onCommand?: (commandLine: string) => void;
};

const GIT_ENVIRONMENT = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_EDITOR: "true",
  GIT_OPTIONAL_LOCKS: "0",
};

export function createGitClient({ cwd, onCommand }: GitClientOptions): GitClient {
  return {
    cwd,
    async run(args, options = {}) {
      assertNotDestructive(args, options);
      onCommand?.(`git ${args.map(quoteForDisplay).join(" ")}`);
      // `detached` retire le terminal à git : ssh et gpg échouent au lieu de disputer le clavier à Ink.
      const result = await execa("git", [...args], {
        cwd,
        reject: false,
        stdin: "ignore",
        detached: true,
        env: GIT_ENVIRONMENT,
      });
      return toGitResult(args, options, {
        stdout: String(result.stdout ?? ""),
        stderr: String(result.stderr ?? ""),
        exitCode: result.exitCode,
        spawnError: result.failed && result.exitCode === undefined ? result.message : undefined,
      });
    },
  };
}

type RawResult = { stdout: string; stderr: string; exitCode: number | undefined; spawnError: string | undefined };

function toGitResult(args: readonly string[], options: GitRunOptions, raw: RawResult): GitResult {
  if (raw.spawnError !== undefined || raw.exitCode === undefined) {
    throw new GitError(`Impossible d'exécuter git : ${raw.spawnError ?? "processus interrompu"}`, { args });
  }
  if (raw.exitCode !== 0 && !options.allowFailure) {
    const output = raw.stderr || raw.stdout;
    throw new GitError(output || `git ${args.join(" ")} a échoué`, { args, exitCode: raw.exitCode, stderr: output });
  }
  return { stdout: raw.stdout, stderr: raw.stderr, exitCode: raw.exitCode };
}

function assertNotDestructive(args: readonly string[], options: GitRunOptions): void {
  if (options.destructiveConfirmed || !isDestructive(args)) return;
  throw new GitError(`Commande destructive bloquée sans confirmation : git ${args.join(" ")}`, { args });
}

export function isDestructive(args: readonly string[]): boolean {
  const [subcommand, ...rest] = args;
  if (subcommand === "clean") return true;
  if (subcommand === "reset") return rest.includes("--hard");
  if (subcommand !== "push") return false;
  return rest.some((arg) => arg === "-f" || arg.startsWith("--force") || arg.startsWith("+"));
}

function quoteForDisplay(arg: string): string {
  return arg.includes(" ") || arg.includes('"') ? `"${arg.replaceAll('"', '\\"')}"` : arg;
}
