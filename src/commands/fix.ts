import { startBranchFlow } from "./shared/startBranchFlow.js";
import type { Command } from "./types.js";

export const fixCommand: Command = {
  name: "fix",
  description: "Committe le travail en cours et crée une branche fix depuis preprod",
  usage: "/fix [nom]",
  examples: ["/fix", "/fix date-facture"],
  gitSteps: ["flux de /commit si le working tree est modifié", "git switch <preprod>", "git pull --ff-only", "git switch -c <prefixes.fix><nom>"],
  run: (ctx, [name]) =>
    startBranchFlow(ctx, { baseKey: "preprod", prefix: ctx.config.prefixes.fix, name }),
};
