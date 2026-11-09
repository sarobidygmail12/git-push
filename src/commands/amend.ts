import { assertHeadNotPushed, readHeadMessage } from "../core/git/commits.js";
import { assertNoOperationInProgress, getStatus, isStaged, isUnstaged } from "../core/git/status.js";
import { confirmSensitiveFiles } from "./shared/commitFlow.js";
import type { Command, CommandContext } from "./types.js";

export const amendCommand: Command = {
  name: "amend",
  description: "Modifie le dernier commit non poussé",
  usage: '/amend ["nouveau message"]',
  examples: ["/amend", '/amend "fix: corrige le calcul de TVA"'],
  gitSteps: ["git branch -r --contains HEAD", "git add . (après confirmation)", "git commit --amend"],
  run: async (ctx, args) => {
    await assertNoOperationInProgress(ctx.git);
    await assertHeadNotPushed(ctx.git, await getStatus(ctx.git));

    const currentMessage = await readHeadMessage(ctx.git);
    const [currentSubject = "", ...body] = currentMessage.split("\n");
    const typed = args.join(" ").trim();
    const subject = typed !== "" ? typed : (await ctx.ui.ask("Message du commit", { initial: currentSubject }))?.trim();
    if (!subject) {
      ctx.ui.log("Amend annulé.", "warn");
      return;
    }
    if (!(await includeWorkingChanges(ctx))) {
      ctx.ui.log("Amend annulé.", "warn");
      return;
    }

    const { files } = await getStatus(ctx.git);
    const isSameMessage = subject === currentSubject;
    if (isSameMessage && !files.some(isStaged)) {
      ctx.ui.log("Rien à modifier.");
      return;
    }
    const messageArgs = isSameMessage ? ["--no-edit"] : ["-m", [subject, ...body].join("\n")];
    await ctx.git.run(["commit", "--amend", ...messageArgs]);
    ctx.ui.log("Dernier commit modifié.", "success");
  },
};

/** Renvoie false seulement si l'utilisateur refuse d'inclure des fichiers sensibles. */
async function includeWorkingChanges(ctx: CommandContext): Promise<boolean> {
  if (!ctx.config.commit.addAll) return true;
  const { files } = await getStatus(ctx.git);
  const unstaged = files.filter(isUnstaged);
  if (unstaged.length === 0) return true;
  if (!(await ctx.ui.confirm(`Inclure ${unstaged.length} fichier(s) non indexé(s) dans le commit ?`))) return true;
  if (!(await confirmSensitiveFiles(ctx, unstaged))) return false;
  await ctx.git.run(["add", "."]);
  return true;
}
