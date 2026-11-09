import { GitError } from "../core/errors.js";
import { branchExists, isValidBranchName } from "../core/git/branches.js";
import { assertNoOperationInProgress, getStatus } from "../core/git/status.js";
import type { Command } from "./types.js";

export const branchCommand: Command = {
  name: "branch",
  description: "Crée une branche et bascule dessus",
  usage: "/branch <nom>",
  examples: ["/branch feature/panier"],
  gitSteps: ["git switch -c <nom>"],
  run: async (ctx, [name]) => {
    if (name === undefined) {
      ctx.ui.log("Usage : /branch <nom>", "warn");
      return;
    }
    if (!(await isValidBranchName(ctx.git, name))) throw new GitError(`Nom de branche invalide : ${name}`);
    if (await branchExists(ctx.git, name)) throw new GitError(`La branche « ${name} » existe déjà.`);
    await assertNoOperationInProgress(ctx.git);
    const { files } = await getStatus(ctx.git);
    await ctx.git.run(["switch", "-c", name]);
    ctx.ui.log(`Branche ${name} créée.${files.length > 0 ? " Les modifications en cours suivent." : ""}`, "success");
  },
};
