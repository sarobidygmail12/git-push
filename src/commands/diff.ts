import { getStatus } from "../core/git/status.js";
import type { Command } from "./types.js";

export const diffCommand: Command = {
  name: "diff",
  description: "Résume les changements en cours",
  usage: "/diff",
  examples: ["/diff"],
  gitSteps: ["git diff --cached --stat", "git diff --stat"],
  run: async (ctx) => {
    const staged = await ctx.git.run(["diff", "--cached", "--stat"]);
    const unstaged = await ctx.git.run(["diff", "--stat"]);
    const { files } = await getStatus(ctx.git);
    const untracked = files.filter((file) => file.kind === "untracked").map((file) => `  ${file.path}`);
    const sections = [
      staged.stdout && `Indexé :\n${staged.stdout}`,
      unstaged.stdout && `Non indexé :\n${unstaged.stdout}`,
      untracked.length > 0 && `Non suivis :\n${untracked.join("\n")}`,
    ].filter((section) => typeof section === "string" && section !== "");
    ctx.ui.log(sections.length > 0 ? sections.join("\n\n") : "Aucun changement.");
  },
};
