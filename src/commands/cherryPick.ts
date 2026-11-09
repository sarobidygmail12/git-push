import { GitError } from "../core/errors.js";
import { assertNoOperationInProgress } from "../core/git/status.js";
import { isCommitHash } from "../core/git/log.js";
import { isSequenceRunning, resolveSequence } from "./shared/resolveSequence.js";
import type { Command } from "./types.js";

export const cherryPickCommand: Command = {
  name: "cherry-pick",
  aliases: ["cp"],
  description: "Applique un ou plusieurs commits sur la branche courante",
  usage: "/cherry-pick <hash...>",
  examples: ["/cherry-pick a1b2c3d", "/cherry-pick a1b2c3d e4f5a6b"],
  gitSteps: ["git cherry-pick <hash...>", "en cas de conflit : git cherry-pick --continue | --abort | --skip"],
  run: async (ctx, hashes) => {
    if (hashes.length === 0) {
      ctx.ui.log("Usage : /cherry-pick <hash...>", "warn");
      return;
    }
    const invalid = hashes.filter((hash) => !isCommitHash(hash));
    if (invalid.length > 0) throw new GitError(`Hash invalide : ${invalid.join(", ")}`);
    await assertNoOperationInProgress(ctx.git);

    const result = await ctx.git.run(["cherry-pick", ...hashes], { allowFailure: true });
    if (result.exitCode !== 0 && !(await isSequenceRunning(ctx, "cherry-pick"))) {
      throw new GitError(result.stderr || result.stdout, { args: ["cherry-pick", ...hashes], exitCode: result.exitCode, stderr: result.stderr });
    }
    if ((await resolveSequence(ctx, "cherry-pick")) === "completed") ctx.ui.log("Cherry-pick terminé.", "success");
  },
};
