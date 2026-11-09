import { openPage } from "./shared/openBrowser.js";
import type { Command } from "./types.js";

const NAME_COLUMN_WIDTH = 16;

export const helpCommand: Command = {
  name: "help",
  aliases: ["h"],
  description: "Liste les commandes et ouvre l'aide complète",
  usage: "/help",
  examples: ["/help"],
  gitSteps: [],
  allowsInvalidConfig: true,
  run: async (ctx) => {
    const lines = ctx.commands.map((command) => `  /${command.name.padEnd(NAME_COLUMN_WIDTH)}${command.description}`);
    ctx.ui.log(lines.join("\n"));
    await openPage(ctx, "/help");
  },
};
