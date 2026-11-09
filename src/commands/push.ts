import { pushCurrentBranch } from "../core/git/branches.js";
import { getStatus } from "../core/git/status.js";
import { reportPullRequest } from "./shared/reportPullRequest.js";
import type { Command } from "./types.js";

export const pushCommand: Command = {
  name: "push",
  description: "Pousse la branche courante",
  usage: "/push",
  examples: ["/push"],
  gitSteps: ["git push (ou git push -u origin <branche>)", "gh pr view (affiche le lien si une PR est ouverte)"],
  run: async (ctx) => {
    const status = await getStatus(ctx.git);
    await ctx.ui.spinner("Push…", () => pushCurrentBranch(ctx.git, status));
    ctx.ui.log("Poussé.", "success");
    await reportPullRequest(ctx);
  },
};
