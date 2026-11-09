import { writeFile } from "node:fs/promises";
import { execa, parseCommandString } from "execa";
import { loadConfig, serializeConfig } from "../core/config/loadConfig.js";
import { setConfigValue, type ConfigTarget } from "../core/config/saveConfig.js";
import { GitPilotError } from "../core/errors.js";
import type { Command, CommandContext } from "./types.js";

const REPO_FLAG = "--repo";
const DEFAULT_EDITOR = "vi";
const SUBCOMMANDS = ["set", "edit"];

export const configCommand: Command = {
  name: "config",
  description: "Affiche ou modifie la configuration",
  usage: "/config [set chemin valeur | edit] [--repo]",
  examples: ["/config", "/config set commit.autoPush false", "/config set --repo branches.develop dev", "/config edit"],
  gitSteps: [],
  allowsInvalidConfig: true,
  completeArgs: () => Promise.resolve(SUBCOMMANDS),
  run: async (ctx, args) => {
    const useRepo = args.includes(REPO_FLAG);
    const [subcommand, path, ...valueParts] = args.filter((arg) => arg !== REPO_FLAG);
    if (subcommand === undefined) return showConfig(ctx);
    if (subcommand === "edit") return editConfig(ctx, useRepo);
    if (subcommand === "set" && path !== undefined && valueParts.length > 0) {
      await setConfigValue(resolveTarget(ctx, useRepo), path, valueParts.join(" "));
      ctx.ui.log(`${path} mis à jour.`, "success");
      return;
    }
    ctx.ui.log(`Usage : ${configCommand.usage}`, "warn");
  },
};

function showConfig(ctx: CommandContext): void {
  const repoLine = ctx.paths.repo ? `\nDépôt  : ${ctx.paths.repo}` : "";
  ctx.ui.log(`Global : ${ctx.paths.global}${repoLine}\n\n${serializeConfig(ctx.config)}`);
}

function resolveTarget(ctx: CommandContext, useRepo: boolean): ConfigTarget {
  if (!useRepo) return { scope: "global", path: ctx.paths.global };
  if (!ctx.paths.repo) throw new GitPilotError("--repo demande d'être dans un dépôt Git.");
  return { scope: "repo", path: ctx.paths.repo, globalPath: ctx.paths.global };
}

async function editConfig(ctx: CommandContext, useRepo: boolean): Promise<void> {
  const target = resolveTarget(ctx, useRepo);
  if (target.scope === "repo") await createIfMissing(target.path);
  const [editor = DEFAULT_EDITOR, ...editorArgs] = parseCommandString(process.env["VISUAL"] ?? process.env["EDITOR"] ?? DEFAULT_EDITOR);
  await ctx.ui.runExternal(async () => {
    await execa(editor, [...editorArgs, target.path], { stdio: "inherit" });
  });
  await loadConfig({ globalPath: ctx.paths.global, repoPath: ctx.paths.repo });
  ctx.ui.log("Configuration valide.", "success");
}

async function createIfMissing(path: string): Promise<void> {
  try {
    await writeFile(path, "{}\n", { flag: "wx" });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
  }
}
