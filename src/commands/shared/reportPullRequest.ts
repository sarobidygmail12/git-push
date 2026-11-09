import { findOpenPullRequestUrl } from "../../core/git/pullRequest.js";
import type { CommandContext } from "../types.js";
import { t } from "../../lang/index.js";

export async function reportPullRequest(ctx: CommandContext): Promise<void> {
  const url = await ctx.ui.spinner(t("spinner.searchPr"), () => findOpenPullRequestUrl(ctx.git.cwd));
  if (url) ctx.ui.log(t("pr.link", { url }));
}
