import { GitError } from "../core/errors.js";
import { assertNoOperationInProgress } from "../core/git/status.js";
import { isCommitHash } from "../core/git/log.js";
import { isSequenceRunning, resolveSequence } from "./shared/resolveSequence.js";
import type { Command } from "./types.js";
import { t } from "../lang/index.js";

export const cherryPickCommand: Command = {
  name: "cherry-pick",
  aliases: ["cp"],
  get description() {
    return t("cmd.cherryPick");
  },
  usage: "/cherry-pick <hash...>",
  examples: ["/cherry-pick a1b2c3d", "/cherry-pick a1b2c3d e4f5a6b"],
  get gitSteps() {
    return ["git cherry-pick <hash...>", t("step.conflictCherryPick")];
  },
  run: async (ctx, hashes) => {
    if (hashes.length === 0) {
      ctx.ui.log(t("msg.usage", { usage: "/cherry-pick <hash...>" }), "warn");
      return;
    }
    const invalid = hashes.filter((hash) => !isCommitHash(hash));
    if (invalid.length > 0) throw new GitError(t("cherryPick.invalidHash", { hashes: invalid.join(", ") }));
    await assertNoOperationInProgress(ctx.git);

    const result = await ctx.git.run(["cherry-pick", ...hashes], { allowFailure: true });
    if (result.exitCode !== 0 && !(await isSequenceRunning(ctx, "cherry-pick"))) {
      throw new GitError(result.stderr || result.stdout, { args: ["cherry-pick", ...hashes], exitCode: result.exitCode, stderr: result.stderr });
    }
    if ((await resolveSequence(ctx, "cherry-pick")) === "completed") ctx.ui.log(t("cherryPick.done"), "success");
  },
};
