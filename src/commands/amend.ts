import { assertHeadNotPushed, readHeadMessage } from "../core/git/commits.js";
import { assertNoOperationInProgress, getStatus, isStaged, isUnstaged } from "../core/git/status.js";
import { confirmSensitiveFiles } from "./shared/commitFlow.js";
import type { Command, CommandContext } from "./types.js";
import { t } from "../lang/index.js";

export const amendCommand: Command = {
  name: "amend",
  get description() {
    return t("cmd.amend");
  },
  usage: '/amend ["new message"]',
  examples: ["/amend", '/amend "fix: correct the VAT calculation"'],
  get gitSteps() {
    return ["git branch -r --contains HEAD", t("step.amendAdd"), "git commit --amend"];
  },
  run: async (ctx, args) => {
    await assertNoOperationInProgress(ctx.git);
    await assertHeadNotPushed(ctx.git, await getStatus(ctx.git));

    const currentMessage = await readHeadMessage(ctx.git);
    const [currentSubject = "", ...body] = currentMessage.split("\n");
    const typed = args.join(" ").trim();
    const subject = typed !== "" ? typed : (await ctx.ui.ask(t("amend.prompt"), { initial: currentSubject }))?.trim();
    if (!subject) {
      ctx.ui.log(t("amend.cancelled"), "warn");
      return;
    }
    if (!(await includeWorkingChanges(ctx))) {
      ctx.ui.log(t("amend.cancelled"), "warn");
      return;
    }

    const { files } = await getStatus(ctx.git);
    const isSameMessage = subject === currentSubject;
    if (isSameMessage && !files.some(isStaged)) {
      ctx.ui.log(t("amend.nothing"));
      return;
    }
    const messageArgs = isSameMessage ? ["--no-edit"] : ["-m", [subject, ...body].join("\n")];
    await ctx.git.run(["commit", "--amend", ...messageArgs]);
    ctx.ui.log(t("amend.done"), "success");
  },
};

/** Renvoie false seulement si l'utilisateur refuse d'inclure des fichiers sensibles. */
async function includeWorkingChanges(ctx: CommandContext): Promise<boolean> {
  if (!ctx.config.commit.addAll) return true;
  const { files } = await getStatus(ctx.git);
  const unstaged = files.filter(isUnstaged);
  if (unstaged.length === 0) return true;
  if (!(await ctx.ui.confirm(t("amend.includeUnstaged", { count: unstaged.length })))) return true;
  if (!(await confirmSensitiveFiles(ctx, unstaged))) return false;
  await ctx.git.run(["add", "."]);
  return true;
}
