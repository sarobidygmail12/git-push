import { openPage } from "./shared/openBrowser.js";
import type { Command } from "./types.js";
import { t } from "../lang/index.js";

export const logCommand: Command = {
  name: "log",
  get description() {
    return t("cmd.log");
  },
  usage: "/log",
  examples: ["/log"],
  gitSteps: ["git log --all --date-order"],
  run: (ctx) => openPage(ctx, "/log"),
};
