import { GitError } from "../core/errors.js";
import { pushCurrentBranch } from "../core/git/branches.js";
import { createPullRequest, findOpenPullRequestUrl, getDefaultBranch, type NewPullRequest } from "../core/git/pullRequest.js";
import { assertNoOperationInProgress, getStatus, type RepoStatus } from "../core/git/status.js";
import type { Command, CommandContext } from "./types.js";
import { t } from "../lang/index.js";

export const pullRequestCommand: Command = {
  name: "pr",
  aliases: ["pull-request"],
  get description() {
    return t("cmd.pr");
  },
  usage: "/pr",
  examples: ["/pr"],
  get gitSteps() {
    return [
    t("step.prRepoView"),
    t("step.prViewStop"),
    t("step.prPushIfNeeded"),
    "gh pr create --title <title> --body <description>",
  ];
  },
  run: async (ctx) => {
    await assertNoOperationInProgress(ctx.git);
    const status = await getStatus(ctx.git);
    if (!status.branch) throw new GitError(t("head.switchFirst"));
    if (!status.headHash) throw new GitError(t("pr.noCommit"));

    // Vérifié avant les questions : si gh n'est pas prêt, on l'apprend sans avoir rien saisi.
    const defaultBranch = await ctx.ui.spinner(t("spinner.connectGithub"), () => getDefaultBranch(ctx.git.cwd));
    if (status.branch === defaultBranch) {
      throw new GitError(t("pr.onDefault", { branch: defaultBranch }));
    }

    const openUrl = await ctx.ui.spinner(t("spinner.searchPr"), () => findOpenPullRequestUrl(ctx.git.cwd));
    if (openUrl) {
      ctx.ui.log(t("pr.alreadyOpen", { url: openUrl }), "warn");
      return;
    }

    const draft = await askDraft(ctx);
    if (!draft) {
      ctx.ui.log(t("pr.cancelled"), "warn");
      return;
    }

    if (status.files.length > 0) {
      ctx.ui.log(t("pr.uncommitted", { count: status.files.length }), "warn");
    }
    if (hasUnpushedCommits(status)) await ctx.ui.spinner(t("spinner.push"), () => pushCurrentBranch(ctx.git, status));
    const url = await ctx.ui.spinner(t("spinner.createPr"), () => createPullRequest(ctx.git.cwd, draft));
    ctx.ui.log(t("pr.created", { url }), "success");
  },
};

async function askDraft(ctx: CommandContext): Promise<NewPullRequest | undefined> {
  const { stdout: lastSubject } = await ctx.git.run(["log", "-1", "--format=%s"]);
  const title = (await ctx.ui.ask(t("pr.titlePrompt"), { initial: lastSubject }))?.trim();
  if (!title) return undefined;
  const body = (await ctx.ui.ask(t("pr.bodyPrompt")))?.trim();
  return body === undefined ? undefined : { title, body };
}

function hasUnpushedCommits(status: RepoStatus): boolean {
  return !status.upstream || status.ahead > 0;
}
