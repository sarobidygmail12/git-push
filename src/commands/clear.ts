import type { Command } from "./types.js";

export const clearCommand: Command = {
  name: "clear",
  description: "Efface l'écran",
  usage: "/clear",
  examples: ["/clear"],
  gitSteps: [],
  allowsInvalidConfig: true,
  run: (ctx) => {
    ctx.ui.clear();
    return Promise.resolve();
  },
};
