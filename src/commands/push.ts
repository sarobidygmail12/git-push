import { pushCurrentBranch } from "../core/git/branches.js";
import { getStatus } from "../core/git/status.js";
import type { Command } from "./types.js";
import { t } from "../lang/index.js";

export const pushCommand: Command = {
  name: "push",
  get description() {
    return t("cmd.push");
  },
  usage: "/push",
  examples: ["/push"],
  get gitSteps() {
    return [t("step.pushOrUpstream")];
  },
  run: async (ctx) => {
    const status = await getStatus(ctx.git);
    await ctx.ui.spinner(t("spinner.push"), () => pushCurrentBranch(ctx.git, status));
    ctx.ui.log(t("commit.pushed"), "success");
  },
};
