import { GitError } from "../core/errors.js";
import { pushCurrentBranch } from "../core/git/branches.js";
import { createPullRequest, findOpenPullRequestUrl, getDefaultBranch, type NewPullRequest } from "../core/git/pullRequest.js";
import { assertNoOperationInProgress, getStatus, type RepoStatus } from "../core/git/status.js";
import type { Command, CommandContext } from "./types.js";

export const pullRequestCommand: Command = {
  name: "pr",
  aliases: ["pull-request"],
  description: "Crée une pull request pour la branche courante",
  usage: "/pr",
  examples: ["/pr"],
  gitSteps: [
    "gh repo view (trouve la branche par défaut)",
    "gh pr view (s'arrête si une PR est déjà ouverte)",
    "git push (ou git push -u origin <branche>) si des commits ne sont pas envoyés",
    "gh pr create --title <titre> --body <description>",
  ],
  run: async (ctx) => {
    await assertNoOperationInProgress(ctx.git);
    const status = await getStatus(ctx.git);
    if (!status.branch) throw new GitError("HEAD détaché : bascule d'abord sur une branche.");
    if (!status.headHash) throw new GitError("Aucun commit à proposer : lance d'abord /commit.");

    // Vérifié avant les questions : si gh n'est pas prêt, on l'apprend sans avoir rien saisi.
    const defaultBranch = await ctx.ui.spinner("Connexion à GitHub…", () => getDefaultBranch(ctx.git.cwd));
    if (status.branch === defaultBranch) {
      throw new GitError(`Tu es sur ${defaultBranch}, la branche par défaut : crée d'abord une branche avec /branch.`);
    }

    const openUrl = await ctx.ui.spinner("Recherche d'une pull request…", () => findOpenPullRequestUrl(ctx.git.cwd));
    if (openUrl) {
      ctx.ui.log(`Une pull request est déjà ouverte : ${openUrl}`, "warn");
      return;
    }

    const draft = await askDraft(ctx);
    if (!draft) {
      ctx.ui.log("Pull request annulée, rien n'a été envoyé.", "warn");
      return;
    }

    if (status.files.length > 0) {
      ctx.ui.log(`${status.files.length} fichier(s) non commité(s) ne feront pas partie de la pull request.`, "warn");
    }
    if (hasUnpushedCommits(status)) await ctx.ui.spinner("Push…", () => pushCurrentBranch(ctx.git, status));
    const url = await ctx.ui.spinner("Création de la pull request…", () => createPullRequest(ctx.git.cwd, draft));
    ctx.ui.log(`Pull request créée : ${url}`, "success");
  },
};

async function askDraft(ctx: CommandContext): Promise<NewPullRequest | undefined> {
  const { stdout: lastSubject } = await ctx.git.run(["log", "-1", "--format=%s"]);
  const title = (await ctx.ui.ask("Titre de la pull request", { initial: lastSubject }))?.trim();
  if (!title) return undefined;
  const body = (await ctx.ui.ask("Description (vide pour ignorer)"))?.trim();
  return body === undefined ? undefined : { title, body };
}

function hasUnpushedCommits(status: RepoStatus): boolean {
  return !status.upstream || status.ahead > 0;
}
