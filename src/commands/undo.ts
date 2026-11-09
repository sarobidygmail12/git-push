import { GitError } from "../core/errors.js";
import { assertHeadNotPushed, countHeadParents } from "../core/git/commits.js";
import { assertNoOperationInProgress, getStatus } from "../core/git/status.js";
import type { Command } from "./types.js";
import { t } from "../lang/index.js";

export const undoCommand: Command = {
  name: "undo",
  get description() {
    return t("cmd.undo");
  },
  usage: "/undo",
  examples: ["/undo"],
  gitSteps: ["git branch -r --contains HEAD", "git reset --soft HEAD~1"],
  run: async (ctx) => {
    await assertNoOperationInProgress(ctx.git);
    await assertHeadNotPushed(ctx.git, await getStatus(ctx.git));
    const parents = await countHeadParents(ctx.git);
    if (parents === 0) throw new GitError(t("undo.firstCommit"));
    if (parents > 1) throw new GitError(t("undo.merge"));
    await ctx.git.run(["reset", "--soft", "HEAD~1"]);
    ctx.ui.log(t("undo.done"), "success");
  },
};
