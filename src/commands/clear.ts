import type { Command } from "./types.js";
import { t } from "../lang/index.js";

export const clearCommand: Command = {
  name: "clear",
  get description() {
    return t("cmd.clear");
  },
  usage: "/clear",
  examples: ["/clear"],
  gitSteps: [],
  allowsInvalidConfig: true,
  run: (ctx) => {
    ctx.ui.clear();
    return Promise.resolve();
  },
};
