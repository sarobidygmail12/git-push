import { REPO_CONFIG_FILENAME } from "../../core/config/loadConfig.js";
import { setConfigValue, type ConfigTarget } from "../../core/config/saveConfig.js";
import { assertCanStartBranch, branchExists, startBranchFrom } from "../../core/git/branches.js";
import { addLocalExclude } from "../../core/git/localExclude.js";
import { getStatus } from "../../core/git/status.js";
import type { CommandContext } from "../types.js";
import { commitFlow } from "./commitFlow.js";
import { t } from "../../lang/index.js";

export type BaseBranchKey = "develop" | "preprod";

export type StartBranchRequest = {
  baseKey: BaseBranchKey;
  prefix: string;
  name: string | undefined;
  forceDivergedBase?: boolean;
};

export async function startBranchFlow(ctx: CommandContext, request: StartBranchRequest): Promise<void> {
  const configuredBase = ctx.config.branches[request.baseKey];
  const base = await chooseBase(ctx, configuredBase);
  if (!base) {
    ctx.ui.log(t("branch.cancelNoBase"), "warn");
    return;
  }

  const name = request.name ?? (await ctx.ui.ask(t("branch.nameQuestion", { prefix: request.prefix })))?.trim();
  if (!name) {
    ctx.ui.log(t("branch.cancelNoName"), "warn");
    return;
  }

  // Vérifié avant le commit : un nom refusé ne doit pas laisser un commit poussé pour rien.
  await assertCanStartBranch(ctx.git, base, `${request.prefix}${name}`);

  const { files } = await getStatus(ctx.git);
  const hadChanges = files.length > 0;
  if (hadChanges && (await commitFlow(ctx)) === "cancelled") {
    ctx.ui.log(t("branch.stopNotCommitted"), "warn");
    return;
  }

  const started = await startBranchFrom(ctx.git, base, request.prefix, name, {
    forceDivergedBase: request.forceDivergedBase ?? false,
  });
  const steps = [...(hadChanges ? [t("branch.stepCommit")] : []), ...started.steps];
  if (started.backupBranch) {
    ctx.ui.log(t("branch.baseDiverged", { base, backup: started.backupBranch }), "warn");
  }
  ctx.ui.log(t("branch.startedFrom", { branch: started.branch, base, steps: steps.map((step) => `  ✓ ${step}`).join("\n") }), "success");

  if (base !== configuredBase) await rememberBase(ctx, request.baseKey, base);
}

async function chooseBase(ctx: CommandContext, configuredBase: string): Promise<string | undefined> {
  if (await branchExists(ctx.git, configuredBase)) return configuredBase;
  const answer = await ctx.ui.ask(t("branch.baseAsk", { base: configuredBase }));
  return answer?.trim() || undefined;
}

/** Appelé après la création de la branche : seule une base qui a fonctionné est enregistrée. */
async function rememberBase(ctx: CommandContext, key: BaseBranchKey, base: string): Promise<void> {
  const configPath = `branches.${key}`;
  const target: ConfigTarget = ctx.paths.repo
    ? { scope: "repo", path: ctx.paths.repo, globalPath: ctx.paths.global }
    : { scope: "global", path: ctx.paths.global };

  // Sinon le fichier, non suivi, salirait le working tree et serait committé au prochain /fix.
  if (target.scope === "repo") await addLocalExclude(ctx.git, `/${REPO_CONFIG_FILENAME}`);
  // Encodé en JSON : une branche nommée « 123 » serait sinon lue comme un nombre.
  await setConfigValue(target, configPath, JSON.stringify(base));
  ctx.ui.log(t("branch.baseSaved", { path: configPath, base, file: target.path }), "success");
}
