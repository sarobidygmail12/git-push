import { GitError } from "../core/errors.js";
import { listSwitchableBranches } from "../core/git/branches.js";
import { assertNoOperationInProgress } from "../core/git/status.js";
import { secureWorkingTree } from "./shared/secureWorkingTree.js";
import type { Command } from "./types.js";

export const switchCommand: Command = {
  name: "switch",
  aliases: ["sw"],
  description: "Change de branche sans perdre les modifications en cours",
  usage: "/switch <branche>",
  examples: ["/switch develop"],
  gitSteps: ["git status", "flux de /commit ou git stash push -u si le working tree est modifié", "git switch <branche>"],
  completeArgs: (ctx) => listSwitchableBranches(ctx.git),
  run: async (ctx, [branch]) => {
    if (branch === undefined) {
      ctx.ui.log("Usage : /switch <branche>", "warn");
      return;
    }
    if (branch.startsWith("-")) throw new GitError(`Nom de branche invalide : ${branch}`);
    await assertNoOperationInProgress(ctx.git);
    if (!(await secureWorkingTree(ctx, `/switch ${branch}`))) {
      ctx.ui.log("Changement de branche annulé.", "warn");
      return;
    }
    await ctx.git.run(["switch", branch]);
    ctx.ui.log(`Sur ${branch}.`, "success");
  },
};
