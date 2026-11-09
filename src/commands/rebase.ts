import { GitError } from "../core/errors.js";
import { isValidBranchName } from "../core/git/branches.js";
import { assertNoOperationInProgress, getStatus } from "../core/git/status.js";
import { isSequenceRunning, resolveSequence, startRebase } from "./shared/resolveSequence.js";
import { reportPullRequest } from "./shared/reportPullRequest.js";
import { secureWorkingTree } from "./shared/secureWorkingTree.js";
import type { Command, CommandContext } from "./types.js";
import { t } from "../lang/index.js";

const REMOTE = "origin";

export const rebaseCommand: Command = {
  name: "rebase",
  aliases: ["rb"],
  get description() {
    return t("cmd.rebase");
  },
  usage: "/rebase [develop|preprod]",
  examples: ["/rebase", "/rebase develop", "/rebase preprod"],
  get gitSteps() {
    return [
    "git fetch origin <base>",
    t("step.commitOrStashIfDirty"),
    "git rebase origin/<base>",
    t("step.conflictRebase"),
    t("step.forcePushAfterConfirm"),
  ];
  },
  completeArgs: (ctx) => Promise.resolve(listBases(ctx)),
  run: async (ctx, [requestedBase]) => {
    if (await isSequenceRunning(ctx, "rebase")) return finishRebase(ctx);
    await assertNoOperationInProgress(ctx.git);

    const base = await chooseBase(ctx, requestedBase);
    if (!base) {
      ctx.ui.log(t("rebase.cancelled"), "warn");
      return;
    }
    await rebaseOnLatest(ctx, base);
  },
};

function listBases(ctx: CommandContext): string[] {
  return [ctx.config.branches.develop, ctx.config.branches.preprod];
}

async function chooseBase(ctx: CommandContext, requestedBase: string | undefined): Promise<string | undefined> {
  const bases = listBases(ctx);
  if (requestedBase === undefined) {
    return ctx.ui.select(t("rebase.selectBase"), bases.map((base) => ({ label: base, value: base })));
  }
  if (!bases.includes(requestedBase)) throw new GitError(t("rebase.unknownBase", { base: requestedBase, choices: bases.join(", ") }));
  return requestedBase;
}

async function rebaseOnLatest(ctx: CommandContext, base: string): Promise<void> {
  // La base peut venir d'un .gitpilot.json : un nom comme `--upload-pack=…` ne doit jamais atteindre git fetch.
  if (!(await isValidBranchName(ctx.git, base))) throw new GitError(t("branch.invalidName", { name: base }));
  const { branch } = await getStatus(ctx.git);
  if (!branch) throw new GitError(t("head.switchFirst"));

  await ctx.ui.spinner(t("spinner.fetchRemote", { remote: `${REMOTE}/${base}` }), () => ctx.git.run(["fetch", REMOTE, base]));

  if (!(await confirmProtectedRebase(ctx, branch)) || !(await secureWorkingTree(ctx, `/rebase ${base}`))) {
    ctx.ui.log(t("rebase.cancelled"), "warn");
    return;
  }

  await startRebase(ctx, `${REMOTE}/${base}`);
  await finishRebase(ctx);
}

async function confirmProtectedRebase(ctx: CommandContext, branch: string): Promise<boolean> {
  if (!ctx.config.branches.protected.includes(branch)) return true;
  return ctx.ui.confirm(t("rebase.protectedConfirm", { branch }));
}

async function finishRebase(ctx: CommandContext): Promise<void> {
  if ((await resolveSequence(ctx, "rebase")) !== "completed") return;
  ctx.ui.log(t("rebase.done"), "success");
  await offerForcePush(ctx);
}

/** Après un rebase, une branche déjà poussée a divergé : seul un push forcé peut la mettre à jour. */
async function offerForcePush(ctx: CommandContext): Promise<void> {
  const status = await getStatus(ctx.git);
  if (!status.upstream || status.ahead === 0 || status.behind === 0) return;

  const question = t("rebase.forcePushConfirm", { branch: status.branch ?? t("firstPush.theBranch"), upstream: status.upstream ?? "" });
  if (!(await ctx.ui.confirm(question))) {
    ctx.ui.log(t("rebase.notPushed"), "warn");
    return;
  }
  await ctx.ui.spinner(t("spinner.push"), () => ctx.git.run(["push", "--force-with-lease"], { destructiveConfirmed: true }));
  ctx.ui.log(t("commit.pushed"), "success");
  await reportPullRequest(ctx);
}
