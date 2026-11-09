import { GitError } from "../core/errors.js";
import { pushCurrentBranch } from "../core/git/branches.js";
import { assertNoOperationInProgress, getStatus } from "../core/git/status.js";
import { isSequenceRunning, resolveSequence, startRebase } from "./shared/resolveSequence.js";
import { secureWorkingTree } from "./shared/secureWorkingTree.js";
import type { Command, CommandContext } from "./types.js";
import { t } from "../lang/index.js";

const REMOTE = "origin";

export const firstPushCommand: Command = {
  name: "first-push",
  aliases: ["fp"],
  get description() {
    return t("cmd.firstPush");
  },
  usage: "/first-push",
  examples: ["/first-push"],
  get gitSteps() {
    return [
    "git fetch origin",
    t("step.firstPushDirty"),
    "git rebase origin/<branch>",
    t("step.conflictRebase"),
    "git push -u origin <branch>",
  ];
  },
  run: async (ctx) => {
    if (await isSequenceRunning(ctx, "rebase")) return finishRebaseThenPublish(ctx);
    await assertNoOperationInProgress(ctx.git);
    await assertHasOrigin(ctx);

    const status = await getStatus(ctx.git);
    if (!status.branch) throw new GitError(t("head.switchFirst"));
    if (!status.headHash) throw new GitError(t("firstPush.noCommit"));
    if (status.upstream) {
      ctx.ui.log(t("firstPush.alreadyLinked", { branch: status.branch, upstream: status.upstream }), "warn");
      return;
    }

    await ctx.ui.spinner(t("spinner.fetchRemote", { remote: REMOTE }), () => ctx.git.run(["fetch", REMOTE]));
    const missingCommits = await countMissingRemoteCommits(ctx, status.branch);
    if (missingCommits === 0) return publish(ctx);

    ctx.ui.log(t("firstPush.missingCommits", { remote: `${REMOTE}/${status.branch}`, count: missingCommits }));
    if (!(await secureWorkingTree(withoutAutoPush(ctx), "/first-push"))) {
      ctx.ui.log(t("firstPush.cancelled"), "warn");
      return;
    }
    await startRebase(ctx, `${REMOTE}/${status.branch}`);
    await finishRebaseThenPublish(ctx);
  },
};

async function assertHasOrigin(ctx: CommandContext): Promise<void> {
  const { exitCode } = await ctx.git.run(["remote", "get-url", REMOTE], { allowFailure: true });
  if (exitCode !== 0) throw new GitError(t("firstPush.noRemote", { remote: REMOTE }));
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
  ctx.ui.log(t(outcome === "paused" ? "firstPush.pausedNothing" : "firstPush.nothing"), "warn");
}

async function publish(ctx: CommandContext): Promise<void> {
  const status = await getStatus(ctx.git);
  await ctx.ui.spinner(t("spinner.push"), () => pushCurrentBranch(ctx.git, status));
  ctx.ui.log(t("firstPush.published", { branch: status.branch ?? t("firstPush.theBranch") }), "success");
}
