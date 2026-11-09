import type { Command } from "./types.js";

export const exitCommand: Command = {
  name: "exit",
  aliases: ["quit"],
  description: "Quitte gitpilot",
  usage: "/exit",
  examples: ["/exit"],
  gitSteps: [],
  allowsInvalidConfig: true,
  run: (ctx) => {
    ctx.exit();
    return Promise.resolve();
  },
};
