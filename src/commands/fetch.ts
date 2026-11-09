import type { Command } from "./types.js";

export const fetchCommand: Command = {
  name: "fetch",
  description: "Récupère les références de tous les remotes",
  usage: "/fetch",
  examples: ["/fetch"],
  gitSteps: ["git fetch --all"],
  run: async (ctx) => {
    await ctx.ui.spinner("Fetch…", () => ctx.git.run(["fetch", "--all"]));
    ctx.ui.log("Références à jour.", "success");
  },
};
