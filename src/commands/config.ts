import { writeFile } from "node:fs/promises";
import { execa, parseCommandString } from "execa";
import { redactApiKeys } from "../core/config/apiKeys.js";
import { loadConfig, readJsonObject, serializeConfig } from "../core/config/loadConfig.js";
import { getValueAt, setConfigValue, type ConfigTarget } from "../core/config/saveConfig.js";
import { DEFAULT_CONFIG, describeConfigOptions, type Config, type ConfigOptionDoc } from "../core/config/schema.js";
import { ConfigError, GitPilotError } from "../core/errors.js";
import type { Command, CommandContext } from "./types.js";

const REPO_FLAG = "--repo";
const DEFAULT_EDITOR = "vi";
const SUBCOMMANDS = ["show", "set", "edit"];
const BROWSE_QUESTION = "Configuration (↑↓ pour naviguer, Entrée pour modifier, Échap pour quitter)";

export const configCommand: Command = {
  name: "config",
  description: "Liste les options et permet de les modifier",
  usage: "/config [show | set chemin valeur | edit] [--repo]",
  examples: ["/config", "/config --repo", "/config show", "/config set commit.autoPush false", "/config set --repo branches.develop dev", "/config edit"],
  gitSteps: [],
  allowsInvalidConfig: true,
  completeArgs: () => Promise.resolve(SUBCOMMANDS),
  run: async (ctx, args) => {
    const useRepo = args.includes(REPO_FLAG);
    const [subcommand, path, ...valueParts] = args.filter((arg) => arg !== REPO_FLAG);
    if (subcommand === undefined) return browseConfig(ctx, useRepo);
    if (subcommand === "show") return showConfig(ctx);
    if (subcommand === "edit") return editConfig(ctx, useRepo);
    if (subcommand === "set" && path !== undefined && valueParts.length > 0) {
      await setConfigValue(resolveTarget(ctx, useRepo), path, restoreListQuotes(path, valueParts.join(" ")));
      ctx.ui.log(`${path} mis à jour.`, "success");
      return;
    }
    ctx.ui.log(`Usage : ${configCommand.usage}`, "warn");
  },
};

/** Le parseur de commandes retire les `"` : `["a","b"]` arrive ici sous la forme `[a,b]`. */
function restoreListQuotes(path: string, rawValue: string): string {
  const isBracketed = rawValue.startsWith("[") && rawValue.endsWith("]");
  if (!isBracketed || !Array.isArray(getValueAt(DEFAULT_CONFIG, path))) return rawValue;
  const items = rawValue.slice(1, -1).split(",").map((item) => item.trim()).filter((item) => item !== "");
  return JSON.stringify(items);
}

function showConfig(ctx: CommandContext): void {
  ctx.ui.log(`${describeLocations(ctx)}\n\n${serializeConfig(redactApiKeys(ctx.config))}`);
}

function describeLocations(ctx: CommandContext): string {
  const repoLine = ctx.paths.repo ? `\nDépôt  : ${ctx.paths.repo}` : "";
  return `Global : ${ctx.paths.global}${repoLine}`;
}

async function browseConfig(ctx: CommandContext, useRepo: boolean): Promise<void> {
  ctx.ui.log(describeLocations(ctx));
  await browseFrom(ctx, ctx.config, useRepo);
}

/** Réaffiche la liste après chaque modification, curseur sur l'option modifiée, jusqu'à Échap. */
async function browseFrom(ctx: CommandContext, config: Config, useRepo: boolean, initial?: string): Promise<void> {
  const options = describeConfigOptions();
  const choices = options.map((option) => toChoice(option, redactApiKeys(config)));
  const selectedPath = await ctx.ui.select(BROWSE_QUESTION, choices, initial === undefined ? undefined : { initial });
  const selected = options.find((option) => option.path === selectedPath);
  if (!selected) return;
  await browseFrom(ctx, await editOption(ctx, config, selected, useRepo), useRepo, selected.path);
}

function toChoice(option: ConfigOptionDoc, config: Config): { label: string; value: string } {
  return { label: `${option.path} = ${formatValue(getValueAt(config, option.path))}`, value: option.path };
}

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Renvoie la configuration à afficher ensuite : inchangée si la saisie est annulée ou refusée. */
async function editOption(ctx: CommandContext, config: Config, option: ConfigOptionDoc, useRepo: boolean): Promise<Config> {
  const current = getValueAt(config, option.path);
  const initial = formatValue(getValueAt(redactApiKeys(config), option.path));
  const answer = (await ctx.ui.ask(`${option.path} : ${option.description}`, { initial }))?.trim();
  if (answer === undefined || answer === initial) return config;

  try {
    const target = await resolveEditTarget(ctx, option.path, useRepo);
    // Encodé en JSON pour une option texte : une branche nommée « 123 » serait sinon lue comme un nombre.
    await setConfigValue(target, option.path, typeof current === "string" ? JSON.stringify(answer) : answer);
    ctx.ui.log(`${option.path} mis à jour dans ${target.path}.`, "success");
    return await loadConfig({ globalPath: ctx.paths.global, repoPath: ctx.paths.repo });
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    ctx.ui.log(error.message, "error");
    return config;
  }
}

/** Une option déjà définie par le dépôt s'y modifie : écrite en global, elle resterait sans effet. */
async function resolveEditTarget(ctx: CommandContext, path: string, useRepo: boolean): Promise<ConfigTarget> {
  if (useRepo || !ctx.paths.repo) return resolveTarget(ctx, useRepo);
  const repoFile = await readJsonObject(ctx.paths.repo);
  return resolveTarget(ctx, getValueAt(repoFile, path) !== undefined);
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
