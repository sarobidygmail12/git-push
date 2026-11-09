import { findOpenPullRequestUrl } from "../../core/git/pullRequest.js";
import type { CommandContext } from "../types.js";

export async function reportPullRequest(ctx: CommandContext): Promise<void> {
  const url = await ctx.ui.spinner("Recherche d'une pull request…", () => findOpenPullRequestUrl(ctx.git.cwd));
  if (url) ctx.ui.log(`Pull request : ${url}`);
}
