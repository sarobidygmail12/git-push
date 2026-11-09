import type { Command } from "./types.js";
import { t } from "../lang/index.js";

export const fetchCommand: Command = {
  name: "fetch",
  get description() {
    return t("cmd.fetch");
  },
  usage: "/fetch",
  examples: ["/fetch"],
  gitSteps: ["git fetch --all"],
  run: async (ctx) => {
    await ctx.ui.spinner(t("spinner.fetch"), () => ctx.git.run(["fetch", "--all"]));
    ctx.ui.log(t("fetch.done"), "success");
  },
};
