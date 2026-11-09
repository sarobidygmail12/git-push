import { openPage } from "./shared/openBrowser.js";
import type { Command } from "./types.js";

export const logCommand: Command = {
  name: "log",
  description: "Ouvre le graphe des commits (branches, auteurs, détails) dans le navigateur",
  usage: "/log",
  examples: ["/log"],
  gitSteps: ["git log --all --date-order"],
  run: (ctx) => openPage(ctx, "/log"),
};
