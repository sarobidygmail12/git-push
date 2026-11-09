import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { GitError } from "../core/errors.js";
import type { GitClient } from "../core/git/gitClient.js";
import type { Command, CommandContext } from "./types.js";
import { t } from "../lang/index.js";

const REMOTE_NAME = "origin";
const HOME_PREFIX = "~/";

export const initCommand: Command = {
  name: "init",
  get description() {
    return t("cmd.init");
  },
  usage: "/init",
  examples: ["/init"],
  gitSteps: ["git -C <folder> init -b <branches.main>", "git -C <folder> remote add origin <url>"],
  run: async (ctx) => {
    const directory = await askDirectory(ctx);
    if (directory === undefined) return;

    const existingRoot = await findRepoRoot(ctx.git, directory);
    if (existingRoot) {
      ctx.ui.log(t("init.existing", { root: existingRoot }), "warn");
      if (await hasOrigin(ctx.git, existingRoot)) return;
    }

    const remoteUrl = await askRemoteUrl(ctx);
    if (remoteUrl === undefined) return;

    if (!existingRoot) {
      await ctx.git.run(["init", "-b", ctx.config.branches.main, directory]);
      ctx.ui.log(t("init.done", { directory, branch: ctx.config.branches.main }), "success");
    }
    const root = existingRoot ?? directory;
    if (remoteUrl !== "") {
      await ctx.git.run(["-C", root, "remote", "add", REMOTE_NAME, remoteUrl]);
      ctx.ui.log(t("init.remote", { name: REMOTE_NAME, url: remoteUrl }), "success");
    }
    if (directory !== resolve(ctx.git.cwd)) {
      ctx.ui.log(t("init.sessionStays", { cwd: ctx.git.cwd, root }));
    }
  },
};

async function askDirectory(ctx: CommandContext): Promise<string | undefined> {
  const answer = (await ctx.ui.ask(t("init.folderPrompt"), { initial: ctx.git.cwd }))?.trim();
  if (answer === undefined) return undefined;
  return resolve(ctx.git.cwd, expandHome(answer));
}

/** Le shell n'intervient pas ici : sans cela, `~/projet` créerait un dossier nommé `~`. */
function expandHome(path: string): string {
  if (path === "~") return homedir();
  return path.startsWith(HOME_PREFIX) ? join(homedir(), path.slice(HOME_PREFIX.length)) : path;
}

async function askRemoteUrl(ctx: CommandContext): Promise<string | undefined> {
  const url = (await ctx.ui.ask(t("init.urlPrompt")))?.trim();
  if (url === undefined) return undefined;
  const hasWhitespace = [...url].some((character) => character.trim() === "");
  if (url.startsWith("-") || hasWhitespace) throw new GitError(t("init.invalidUrl", { url }));
  return url;
}

/** Part du dossier existant le plus proche : un sous-dossier encore absent d'un dépôt est quand même dans ce dépôt. */
async function findRepoRoot(git: GitClient, directory: string): Promise<string | undefined> {
  const { stdout, exitCode } = await git.run(["-C", nearestExistingDirectory(directory), "rev-parse", "--show-toplevel"], {
    allowFailure: true,
  });
  return exitCode === 0 && stdout !== "" ? stdout : undefined;
}

function nearestExistingDirectory(path: string): string {
  return existsSync(path) || dirname(path) === path ? path : nearestExistingDirectory(dirname(path));
}

async function hasOrigin(git: GitClient, root: string): Promise<boolean> {
  const { exitCode } = await git.run(["-C", root, "remote", "get-url", REMOTE_NAME], { allowFailure: true });
  return exitCode === 0;
}
