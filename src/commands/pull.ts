import { assertNoOperationInProgress } from "../core/git/status.js";
import type { Command } from "./types.js";
import { t } from "../lang/index.js";

export const pullCommand: Command = {
  name: "pull",
  get description() {
    return t("cmd.pull");
  },
  usage: "/pull",
  examples: ["/pull"],
  gitSteps: ["git pull --ff-only"],
  run: async (ctx) => {
    await assertNoOperationInProgress(ctx.git);
    const { stdout } = await ctx.ui.spinner(t("spinner.pull"), () => ctx.git.run(["pull", "--ff-only"]));
    ctx.ui.log(stdout, "success");
  },
};
