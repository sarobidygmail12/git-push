import { startBranchFlow } from "./shared/startBranchFlow.js";
import type { Command } from "./types.js";
import { t } from "../lang/index.js";

export const hotfixCommand: Command = {
  name: "hotfix",
  get description() {
    return t("cmd.hotfix");
  },
  usage: "/hotfix [name]",
  examples: ["/hotfix", "/hotfix empty-cart"],
  get gitSteps() {
    return [t("step.commitFlowIfDirty"), "git switch <develop>", "git pull --ff-only", t("step.hotfixDiverged"), "git switch -c <prefixes.hotfix><name>"];
  },
  run: (ctx, [name]) =>
    startBranchFlow(ctx, { baseKey: "develop", prefix: ctx.config.prefixes.hotfix, name, forceDivergedBase: true }),
};
