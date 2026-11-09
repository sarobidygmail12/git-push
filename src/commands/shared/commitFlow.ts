import type { CommitMessageInput } from "../../core/ai/provider.js";
import { hasRemote, pushCurrentBranch } from "../../core/git/branches.js";
import { getStagedChanges, type StagedChanges } from "../../core/git/diff.js";
import { isSensitivePath } from "../../core/git/sensitive.js";
import { assertNoOperationInProgress, getStatus, isStaged, type FileChange, type RepoStatus } from "../../core/git/status.js";
import type { CommandContext } from "../types.js";
import { t } from "../../lang/index.js";

export type CommitFlowResult = "committed" | "nothing" | "cancelled";

type ReviewChoice = "accept" | "edit" | "regenerate" | "cancel";

function reviewChoices(): ReadonlyArray<{ label: string; value: ReviewChoice }> {
  return [
    { label: t("commit.accept"), value: "accept" },
    { label: t("commit.edit"), value: "edit" },
    { label: t("commit.regenerate"), value: "regenerate" },
    { label: t("commit.cancel"), value: "cancel" },
  ];
}

const DETACHED_BRANCH_LABEL = "detached HEAD";

export async function commitFlow(ctx: CommandContext, options: { message?: string } = {}): Promise<CommitFlowResult> {
  const status = await getStatus(ctx.git);
  if (status.files.length === 0) {
    ctx.ui.log(t("commit.nothing"));
    return "nothing";
  }
  await assertNoOperationInProgress(ctx.git);
  if (!(await confirmBeforeStaging(ctx, status))) {
    ctx.ui.log(t("commit.cancelledIndexUnchanged"), "warn");
    return "cancelled";
  }

  if (ctx.config.commit.addAll) await ctx.git.run(["add", "."]);
  const changes = await getStagedChanges(ctx.git);
  if (changes.files.length === 0) {
    ctx.ui.log(t("commit.nothingStaged"));
    return "nothing";
  }

  const message = options.message ?? (await chooseMessage(ctx, toMessageInput(ctx, changes, status)));
  if (message === undefined) {
    ctx.ui.log(t("commit.cancelledStaged"), "warn");
    return "cancelled";
  }

  const { stdout } = await ctx.git.run(["commit", "-m", message]);
  ctx.ui.log(stdout.split("\n")[0] ?? t("commit.created"), "success");
  await pushIfEnabled(ctx, status);
  return "committed";
}

/** Tout ce qui peut faire renoncer passe avant `git add`, pour qu'un refus laisse l'index intact. */
async function confirmBeforeStaging(ctx: CommandContext, status: RepoStatus): Promise<boolean> {
  return (await confirmProtectedBranch(ctx, status)) && (await confirmSensitiveFiles(ctx, status.files));
}

async function confirmProtectedBranch(ctx: CommandContext, status: RepoStatus): Promise<boolean> {
  if (!status.branch || !ctx.config.branches.protected.includes(status.branch)) return true;
  return ctx.ui.confirm(t("commit.protectedConfirm", { branch: status.branch }));
}

export async function confirmSensitiveFiles(ctx: CommandContext, files: readonly FileChange[]): Promise<boolean> {
  const candidates = ctx.config.commit.addAll ? files : files.filter(isStaged);
  const sensitive = candidates.map((file) => file.path).filter(isSensitivePath);
  if (sensitive.length === 0) return true;
  ctx.ui.log(t("commit.sensitiveFound", { files: sensitive.map((path) => `  ${path}`).join("\n") }), "warn");
  return ctx.ui.confirm(t("commit.sensitiveInclude"));
}

function toMessageInput(ctx: CommandContext, changes: StagedChanges, status: RepoStatus): CommitMessageInput {
  return {
    diff: changes.diff,
    diffTruncated: changes.truncated,
    files: changes.files,
    branch: status.branch ?? DETACHED_BRANCH_LABEL,
    convention: ctx.config.commit.convention,
    rejectedMessages: [],
  };
}

async function chooseMessage(ctx: CommandContext, input: CommitMessageInput): Promise<string | undefined> {
  const generated = await ctx.ui.spinner(t("spinner.generating"), () => ctx.ai.generate(input));
  generated.failures.forEach((failure) => ctx.ui.log(t("commit.aiUnavailable", { reason: failure.message }), "warn"));
  if (generated.provider === "fallback" && input.rejectedMessages.length > 0) {
    ctx.ui.log(t("commit.regenerateNoAi"), "warn");
  }
  return reviewMessage(ctx, input, generated.message, generated.provider);
}

async function reviewMessage(
  ctx: CommandContext,
  input: CommitMessageInput,
  message: string,
  author: string,
): Promise<string | undefined> {
  const indented = message.replaceAll("\n", "\n  ");
  const choice = await ctx.ui.select(t("commit.proposed", { author, message: indented }), reviewChoices());
  if (choice === "accept") return message;
  if (choice === "regenerate") {
    return chooseMessage(ctx, { ...input, rejectedMessages: [...input.rejectedMessages, message] });
  }
  if (choice === "edit") {
    const edited = await editSubject(ctx, message);
    return edited ? reviewMessage(ctx, input, edited, t("commit.editedAuthor")) : reviewMessage(ctx, input, message, author);
  }
  return undefined;
}

/** La saisie tient sur une ligne : seul le titre est modifié, le détail par fichier est conservé. */
async function editSubject(ctx: CommandContext, message: string): Promise<string | undefined> {
  const [subject = "", ...details] = message.split("\n");
  const label = details.length > 0 ? t("commit.titlePrompt") : t("commit.messagePrompt");
  const edited = (await ctx.ui.ask(label, { initial: subject }))?.trim();
  return edited ? [edited, ...details].join("\n") : undefined;
}

async function pushIfEnabled(ctx: CommandContext, status: RepoStatus): Promise<void> {
  if (!ctx.config.commit.autoPush) return;
  if (!status.branch) {
    ctx.ui.log(t("commit.pushSkippedDetached"), "warn");
    return;
  }
  if (!(await hasRemote(ctx.git))) {
    ctx.ui.log(t("commit.pushSkippedNoRemote"), "warn");
    return;
  }
  await ctx.ui.spinner(t("spinner.push"), () => pushCurrentBranch(ctx.git, status));
  ctx.ui.log(t("commit.pushed"), "success");
}
