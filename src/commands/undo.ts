import { GitError } from "../core/errors.js";
import { assertHeadNotPushed, countHeadParents } from "../core/git/commits.js";
import { assertNoOperationInProgress, getStatus } from "../core/git/status.js";
import type { Command } from "./types.js";

export const undoCommand: Command = {
  name: "undo",
  description: "Annule le dernier commit non poussé et garde ses modifications",
  usage: "/undo",
  examples: ["/undo"],
  gitSteps: ["git branch -r --contains HEAD", "git reset --soft HEAD~1"],
  run: async (ctx) => {
    await assertNoOperationInProgress(ctx.git);
    await assertHeadNotPushed(ctx.git, await getStatus(ctx.git));
    const parents = await countHeadParents(ctx.git);
    if (parents === 0) throw new GitError("Refusé : c'est le premier commit du dépôt.");
    if (parents > 1) throw new GitError("Refusé : le dernier commit est un merge.");
    await ctx.git.run(["reset", "--soft", "HEAD~1"]);
    ctx.ui.log("Dernier commit annulé, ses modifications sont indexées.", "success");
  },
};
