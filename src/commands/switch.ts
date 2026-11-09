import { GitError } from "../core/errors.js";
import { listSwitchableBranches } from "../core/git/branches.js";
import { assertNoOperationInProgress } from "../core/git/status.js";
import { secureWorkingTree } from "./shared/secureWorkingTree.js";
import type { Command } from "./types.js";
import { t } from "../lang/index.js";

export const switchCommand: Command = {
  name: "switch",
  aliases: ["sw"],
  get description() {
    return t("cmd.switch");
  },
  usage: "/switch <branch>",
  examples: ["/switch develop"],
  get gitSteps() {
    return ["git status", t("step.commitOrStashIfDirty"), "git switch <branch>"];
  },
  completeArgs: (ctx) => listSwitchableBranches(ctx.git),
  run: async (ctx, [branch]) => {
    if (branch === undefined) {
      ctx.ui.log(t("msg.usage", { usage: "/switch <branch>" }), "warn");
      return;
    }
    if (branch.startsWith("-")) throw new GitError(t("branch.invalidName", { name: branch }));
    await assertNoOperationInProgress(ctx.git);
    if (!(await secureWorkingTree(ctx, `/switch ${branch}`))) {
      ctx.ui.log(t("switch.cancelled"), "warn");
      return;
    }
    await ctx.git.run(["switch", branch]);
    ctx.ui.log(t("switch.on", { branch }), "success");
  },
};
