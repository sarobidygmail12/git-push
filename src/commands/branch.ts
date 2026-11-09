import { GitError } from "../core/errors.js";
import { branchExists, isValidBranchName } from "../core/git/branches.js";
import { assertNoOperationInProgress, getStatus } from "../core/git/status.js";
import type { Command } from "./types.js";
import { t } from "../lang/index.js";

export const branchCommand: Command = {
  name: "branch",
  get description() {
    return t("cmd.branch");
  },
  usage: "/branch <name>",
  examples: ["/branch feature/cart"],
  gitSteps: ["git switch -c <name>"],
  run: async (ctx, [name]) => {
    if (name === undefined) {
      ctx.ui.log(t("msg.usage", { usage: "/branch <name>" }), "warn");
      return;
    }
    if (!(await isValidBranchName(ctx.git, name))) throw new GitError(t("branch.invalidName", { name }));
    if (await branchExists(ctx.git, name)) throw new GitError(t("branch.exists", { name }));
    await assertNoOperationInProgress(ctx.git);
    const { files } = await getStatus(ctx.git);
    await ctx.git.run(["switch", "-c", name]);
    ctx.ui.log(t(files.length > 0 ? "branch.createdWithChanges" : "branch.created", { name }), "success");
  },
};
