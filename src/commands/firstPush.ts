import { GitError } from "../core/errors.js";
import { pushCurrentBranch } from "../core/git/branches.js";
import { assertNoOperationInProgress, getStatus } from "../core/git/status.js";
import { isSequenceRunning, resolveSequence, startRebase } from "./shared/resolveSequence.js";
import { secureWorkingTree } from "./shared/secureWorkingTree.js";
import type { Command, CommandContext } from "./types.js";

const REMOTE = "origin";

export const firstPushCommand: Command = {
  name: "first-push",
  aliases: ["fp"],
  description: "Publie la branche pour la première fois, même si le dépôt distant contient déjà un commit",
  usage: "/first-push",
  examples: ["/first-push"],
  gitSteps: [
    "git fetch origin",
    "si le remote a des commits absents en local : flux de /commit ou git stash push -u si le working tree est modifié",
    "git rebase origin/<branche>",
    "en cas de conflit : git rebase --continue | --abort | --skip",
    "git push -u origin <branche>",
  ],
  run: async (ctx) => {
    if (await isSequenceRunning(ctx, "rebase")) return finishRebaseThenPublish(ctx);
    await assertNoOperationInProgress(ctx.git);
    await assertHasOrigin(ctx);

    const status = await getStatus(ctx.git);
    if (!status.branch) throw new GitError("HEAD détaché : bascule d'abord sur une branche.");
    if (!status.headHash) throw new GitError("Aucun commit à publier : lance d'abord /commit.");
    if (status.upstream) {
      ctx.ui.log(`${status.branch} est déjà reliée à ${status.upstream} : utilise /push.`, "warn");
      return;
    }

    await ctx.ui.spinner(`Récupération de ${REMOTE}…`, () => ctx.git.run(["fetch", REMOTE]));
    const missingCommits = await countMissingRemoteCommits(ctx, status.branch);
    if (missingCommits === 0) return publish(ctx);

    ctx.ui.log(`${REMOTE}/${status.branch} contient ${missingCommits} commit(s) absent(s) en local : je les intègre.`);
    if (!(await secureWorkingTree(withoutAutoPush(ctx), "/first-push"))) {
      ctx.ui.log("Publication annulée, rien n'a été poussé.", "warn");
      return;
    }
    await startRebase(ctx, `${REMOTE}/${status.branch}`);
    await finishRebaseThenPublish(ctx);
  },
};

async function assertHasOrigin(ctx: CommandContext): Promise<void> {
  const { exitCode } = await ctx.git.run(["remote", "get-url", REMOTE], { allowFailure: true });
  if (exitCode !== 0) throw new GitError(`Aucun dépôt distant « ${REMOTE} » : ajoute-le avec /init.`);
}

/** Tant que le remote n'est pas intégré, le push automatique de /commit serait rejeté. */
function withoutAutoPush(ctx: CommandContext): CommandContext {
  return { ...ctx, config: { ...ctx.config, commit: { ...ctx.config.commit, autoPush: false } } };
}

async function countMissingRemoteCommits(ctx: CommandContext, branch: string): Promise<number> {
  const remoteRef = `refs/remotes/${REMOTE}/${branch}`;
  const { exitCode } = await ctx.git.run(["show-ref", "--verify", "--quiet", remoteRef], { allowFailure: true });
  if (exitCode !== 0) return 0;
  const { stdout } = await ctx.git.run(["rev-list", "--count", `HEAD..${remoteRef}`]);
  return Number(stdout);
}

async function finishRebaseThenPublish(ctx: CommandContext): Promise<void> {
  const outcome = await resolveSequence(ctx, "rebase");
  if (outcome === "completed") return publish(ctx);
  ctx.ui.log(outcome === "paused" ? "Rien n'a été poussé. Relance /first-push pour reprendre." : "Rien n'a été poussé.", "warn");
}

async function publish(ctx: CommandContext): Promise<void> {
  const status = await getStatus(ctx.git);
  await ctx.ui.spinner("Push…", () => pushCurrentBranch(ctx.git, status));
  ctx.ui.log(`${status.branch ?? "La branche"} est publiée. Les prochains envois passeront par /push.`, "success");
}
