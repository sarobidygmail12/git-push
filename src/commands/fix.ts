import { startBranchFlow } from "./shared/startBranchFlow.js";
import type { Command } from "./types.js";
import { t } from "../lang/index.js";

export const fixCommand: Command = {
  name: "fix",
  get description() {
    return t("cmd.fix");
  },
  usage: "/fix [name]",
  examples: ["/fix", "/fix invoice-date"],
  get gitSteps() {
    return [t("step.commitFlowIfDirty"), "git switch <preprod>", "git pull --ff-only", "git switch -c <prefixes.fix><name>"];
  },
  run: (ctx, [name]) =>
    startBranchFlow(ctx, { baseKey: "preprod", prefix: ctx.config.prefixes.fix, name }),
};
