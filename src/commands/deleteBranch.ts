import { GitError } from "../core/errors.js";
import {
  countCommitsLostByDeleting,
  deleteLocalBranch,
  deleteRemoteBranch,
  isValidBranchName,
  listSwitchableBranches,
  locateBranch,
  type BranchLocations,
} from "../core/git/branches.js";
import type { Config } from "../core/config/schema.js";
import { assertNoOperationInProgress, getStatus } from "../core/git/status.js";
import type { Command, CommandContext } from "./types.js";
import { t } from "../lang/index.js";

const USAGE = "/delete-branch <branch>";

export const deleteBranchCommand: Command = {
  name: "delete-branch",
  aliases: ["db"],
  get description() {
    return t("cmd.deleteBranch");
  },
  usage: USAGE,
  examples: ["/delete-branch feature/cart"],
  gitSteps: ["git branch -D <branch>", "git push <remote> --delete <branch>"],
  completeArgs: async (ctx) => {
    const undeletable = [...protectedBranches(ctx.config), (await getStatus(ctx.git)).branch];
    return (await listSwitchableBranches(ctx.git)).filter((branch) => !undeletable.includes(branch));
  },
  run: async (ctx, [name]) => {
    if (name === undefined) {
      ctx.ui.log(t("msg.usage", { usage: USAGE }), "warn");
      return;
    }
    const found = await findDeletableBranch(ctx, name);
    const target = await chooseTarget(ctx, name, found);
    if (target === undefined || !(await confirmDeletion(ctx, name, target))) {
      ctx.ui.log(t("deleteBranch.cancelled"), "warn");
      return;
    }
    await deleteTarget(ctx, name, target);
  },
};

function protectedBranches({ branches }: Config): string[] {
  return [branches.main, branches.develop, branches.preprod, ...branches.protected];
}

async function findDeletableBranch(ctx: CommandContext, name: string): Promise<BranchLocations> {
  if (!(await isValidBranchName(ctx.git, name))) throw new GitError(t("branch.invalidName", { name }));
  if (protectedBranches(ctx.config).includes(name)) throw new GitError(t("deleteBranch.protected", { name }));
  await assertNoOperationInProgress(ctx.git);
  if ((await getStatus(ctx.git)).branch === name) throw new GitError(t("deleteBranch.current", { name }));
  const found = await locateBranch(ctx.git, name);
  if (!found.local && found.remotes.length === 0) throw new GitError(t("deleteBranch.notFound", { name }));
  return found;
}

async function chooseTarget(
  ctx: CommandContext,
  name: string,
  found: BranchLocations,
): Promise<BranchLocations | undefined> {
  if (!found.local || found.remotes.length === 0) return found;
  const remotes = found.remotes.join(", ");
  const onlyLocal: BranchLocations = { local: true, remotes: [] };
  const onlyRemote: BranchLocations = { local: false, remotes: found.remotes };
  return ctx.ui.select(t("deleteBranch.scopeQuestion", { name }), [
    { label: t("deleteBranch.scopeLocal"), value: onlyLocal },
    { label: t("deleteBranch.scopeRemote", { remotes }), value: onlyRemote },
    { label: t("deleteBranch.scopeBoth", { remotes }), value: found },
  ]);
}

async function confirmDeletion(ctx: CommandContext, name: string, target: BranchLocations): Promise<boolean> {
  const targets = [...(target.local ? [name] : []), ...target.remotes.map((remote) => `${remote}/${name}`)].join(", ");
  const count = await countCommitsLostByDeleting(ctx.git, name, target);
  return ctx.ui.confirm(
    count > 0 ? t("deleteBranch.confirmLost", { targets, count }) : t("deleteBranch.confirm", { targets }),
  );
}

/** Le local d'abord : si Git le refuse (branche ouverte dans un worktree), le distant reste intact. */
async function deleteTarget(ctx: CommandContext, name: string, target: BranchLocations): Promise<void> {
  if (target.local) {
    await deleteLocalBranch(ctx.git, name);
    ctx.ui.log(t("deleteBranch.deletedLocal", { name }), "success");
  }
  await target.remotes.reduce(async (previous, remote) => {
    await previous;
    await deleteOnRemote(ctx, remote, name);
  }, Promise.resolve());
}

async function deleteOnRemote(ctx: CommandContext, remote: string, name: string): Promise<void> {
  await ctx.ui.spinner(t("spinner.deleteRemote", { remote }), () => deleteRemoteBranch(ctx.git, remote, name));
  ctx.ui.log(t("deleteBranch.deletedRemote", { remote, name }), "success");
}
