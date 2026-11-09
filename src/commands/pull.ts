import { assertNoOperationInProgress } from "../core/git/status.js";
import type { Command } from "./types.js";

export const pullCommand: Command = {
  name: "pull",
  description: "Récupère la branche distante en fast-forward uniquement",
  usage: "/pull",
  examples: ["/pull"],
  gitSteps: ["git pull --ff-only"],
  run: async (ctx) => {
    await assertNoOperationInProgress(ctx.git);
    const { stdout } = await ctx.ui.spinner("Pull…", () => ctx.git.run(["pull", "--ff-only"]));
    ctx.ui.log(stdout, "success");
  },
};
