import { startBranchFlow } from "./shared/startBranchFlow.js";
import type { Command } from "./types.js";

export const hotfixCommand: Command = {
  name: "hotfix",
  description: "Committe le travail en cours et crée une branche hotfix depuis develop",
  usage: "/hotfix [nom]",
  examples: ["/hotfix", "/hotfix panier-vide"],
  gitSteps: ["flux de /commit si le working tree est modifié", "git switch <develop>", "git pull --ff-only", "si develop a divergé : git branch backup/<develop>-<hash> puis git reset --hard <upstream>", "git switch -c <prefixes.hotfix><nom>"],
  run: (ctx, [name]) =>
    startBranchFlow(ctx, { base: ctx.config.branches.develop, prefix: ctx.config.prefixes.hotfix, name, forceDivergedBase: true }),
};
