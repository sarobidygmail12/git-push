import { commitFlow } from "./shared/commitFlow.js";
import type { Command } from "./types.js";

export const commitCommand: Command = {
  name: "commit",
  aliases: ["cm"],
  description: "Committe et pousse, avec un message généré par IA",
  usage: '/commit ["message"]',
  examples: ["/commit", '/commit "fix: corrige le calcul de TVA"'],
  gitSteps: ["git add .", "git diff --cached", 'git commit -m "<message>"', "git push (ou git push -u origin <branche>)"],
  run: async (ctx, args) => {
    const message = args.join(" ").trim();
    await commitFlow(ctx, message === "" ? {} : { message });
  },
};
