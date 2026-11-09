import { commitFlow } from "./shared/commitFlow.js";
import type { Command } from "./types.js";
import { t } from "../lang/index.js";

export const commitCommand: Command = {
  name: "commit",
  aliases: ["cm"],
  get description() {
    return t("cmd.commit");
  },
  usage: '/commit ["message"]',
  examples: ["/commit", '/commit "fix: correct the VAT calculation"'],
  get gitSteps() {
    return ["git add .", "git diff --cached", 'git commit -m "<message>"', t("step.pushOrUpstream")];
  },
  run: async (ctx, args) => {
    const message = args.join(" ").trim();
    await commitFlow(ctx, message === "" ? {} : { message });
  },
};
