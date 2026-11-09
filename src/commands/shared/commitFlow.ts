import type { CommitMessageInput } from "../../core/ai/provider.js";
import { hasRemote, pushCurrentBranch } from "../../core/git/branches.js";
import { getStagedChanges, type StagedChanges } from "../../core/git/diff.js";
import { isSensitivePath } from "../../core/git/sensitive.js";
import { assertNoOperationInProgress, getStatus, isStaged, type FileChange, type RepoStatus } from "../../core/git/status.js";
import type { CommandContext } from "../types.js";
import { reportPullRequest } from "./reportPullRequest.js";

export type CommitFlowResult = "committed" | "nothing" | "cancelled";

type ReviewChoice = "accept" | "edit" | "regenerate" | "cancel";

const REVIEW_CHOICES = [
  { label: "Valider", value: "accept" },
  { label: "Modifier", value: "edit" },
  { label: "Régénérer", value: "regenerate" },
  { label: "Annuler", value: "cancel" },
] as const satisfies ReadonlyArray<{ label: string; value: ReviewChoice }>;

const DETACHED_BRANCH_LABEL = "HEAD détaché";

export async function commitFlow(ctx: CommandContext, options: { message?: string } = {}): Promise<CommitFlowResult> {
  const status = await getStatus(ctx.git);
  if (status.files.length === 0) {
    ctx.ui.log("Rien à committer.");
    return "nothing";
  }
  await assertNoOperationInProgress(ctx.git);
  if (!(await confirmBeforeStaging(ctx, status))) {
    ctx.ui.log("Commit annulé, index inchangé.", "warn");
    return "cancelled";
  }

  if (ctx.config.commit.addAll) await ctx.git.run(["add", "."]);
  const changes = await getStagedChanges(ctx.git);
  if (changes.files.length === 0) {
    ctx.ui.log("Rien d'indexé : utilise `git add` ou active commit.addAll.");
    return "nothing";
  }

  const message = options.message ?? (await chooseMessage(ctx, toMessageInput(ctx, changes, status)));
  if (message === undefined) {
    ctx.ui.log("Commit annulé. Les fichiers restent indexés.", "warn");
    return "cancelled";
  }

  const { stdout } = await ctx.git.run(["commit", "-m", message]);
  ctx.ui.log(stdout.split("\n")[0] ?? "Commit créé.", "success");
  await pushIfEnabled(ctx, status);
  return "committed";
}

/** Tout ce qui peut faire renoncer passe avant `git add`, pour qu'un refus laisse l'index intact. */
async function confirmBeforeStaging(ctx: CommandContext, status: RepoStatus): Promise<boolean> {
  return (await confirmProtectedBranch(ctx, status)) && (await confirmSensitiveFiles(ctx, status.files));
}

async function confirmProtectedBranch(ctx: CommandContext, status: RepoStatus): Promise<boolean> {
  if (!status.branch || !ctx.config.branches.protected.includes(status.branch)) return true;
  return ctx.ui.confirm(`« ${status.branch} » est une branche protégée. Committer quand même ?`);
}

export async function confirmSensitiveFiles(ctx: CommandContext, files: readonly FileChange[]): Promise<boolean> {
  const candidates = ctx.config.commit.addAll ? files : files.filter(isStaged);
  const sensitive = candidates.map((file) => file.path).filter(isSensitivePath);
  if (sensitive.length === 0) return true;
  ctx.ui.log(`Fichiers sensibles détectés :\n${sensitive.map((path) => `  ${path}`).join("\n")}`, "warn");
  return ctx.ui.confirm("Les inclure dans le commit ?");
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
  const generated = await ctx.ui.spinner("Génération du message…", () => ctx.ai.generate(input));
  generated.failures.forEach((failure) => ctx.ui.log(`IA indisponible, ${failure.message}`, "warn"));
  if (generated.provider === "fallback" && input.rejectedMessages.length > 0) {
    ctx.ui.log("Sans IA, Régénérer redonne le même message : configure une clé API (GROQ_API_KEY ou GEMINI_API_KEY) ou choisis Modifier.", "warn");
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
  const choice = await ctx.ui.select(`Message proposé (${author}) :\n  ${indented}\n`, REVIEW_CHOICES);
  if (choice === "accept") return message;
  if (choice === "regenerate") {
    return chooseMessage(ctx, { ...input, rejectedMessages: [...input.rejectedMessages, message] });
  }
  if (choice === "edit") {
    const edited = await editSubject(ctx, message);
    return edited ? reviewMessage(ctx, input, edited, "modifié") : reviewMessage(ctx, input, message, author);
  }
  return undefined;
}

/** La saisie tient sur une ligne : seul le titre est modifié, le détail par fichier est conservé. */
async function editSubject(ctx: CommandContext, message: string): Promise<string | undefined> {
  const [subject = "", ...details] = message.split("\n");
  const label = details.length > 0 ? "Titre du commit (le détail par fichier est conservé)" : "Message de commit";
  const edited = (await ctx.ui.ask(label, { initial: subject }))?.trim();
  return edited ? [edited, ...details].join("\n") : undefined;
}

async function pushIfEnabled(ctx: CommandContext, status: RepoStatus): Promise<void> {
  if (!ctx.config.commit.autoPush) return;
  if (!status.branch) {
    ctx.ui.log("HEAD détaché : push ignoré.", "warn");
    return;
  }
  if (!(await hasRemote(ctx.git))) {
    ctx.ui.log("Aucun remote configuré : push ignoré.", "warn");
    return;
  }
  await ctx.ui.spinner("Push…", () => pushCurrentBranch(ctx.git, status));
  ctx.ui.log("Poussé.", "success");
  await reportPullRequest(ctx);
}
