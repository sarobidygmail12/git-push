import type { Command } from "./types.js";
import { t } from "../lang/index.js";

export const exitCommand: Command = {
  name: "exit",
  aliases: ["quit"],
  get description() {
    return t("cmd.exit");
  },
  usage: "/exit",
  examples: ["/exit"],
  gitSteps: [],
  allowsInvalidConfig: true,
  run: (ctx) => {
    ctx.exit();
    return Promise.resolve();
  },
};
