import { GitError } from "../../core/errors.js";
import { getOperationInProgress, getStatus, isConflict, isConflictResolved } from "../../core/git/status.js";
import type { CommandContext } from "../types.js";

export type SequenceOperation = "cherry-pick" | "rebase";

export type SequenceOutcome = "completed" | "aborted" | "paused";

type ConflictAction = "continue" | "abort" | "skip";

const CONFLICT_CHOICES = [
  { label: "Continuer (conflits résolus)", value: "continue" },
  { label: "Annuler tout (--abort)", value: "abort" },
  { label: "Passer ce commit (--skip)", value: "skip" },
] as const satisfies ReadonlyArray<{ label: string; value: ConflictAction }>;

export async function isSequenceRunning(ctx: CommandContext, operation: SequenceOperation): Promise<boolean> {
  return (await getOperationInProgress(ctx.git)) === operation;
}

/** Un conflit laisse le rebase en cours pour `resolveSequence` ; seul un échec au démarrage lève une erreur. */
export async function startRebase(ctx: CommandContext, target: string): Promise<void> {
  const args = ["rebase", target];
  const result = await ctx.git.run(args, { allowFailure: true });
  if (result.exitCode === 0 || (await isSequenceRunning(ctx, "rebase"))) return;
  const output = result.stderr || result.stdout;
  throw new GitError(output, { args, exitCode: result.exitCode, stderr: output });
}

/** Accompagne un cherry-pick ou un rebase commit après commit, jusqu'à ce qu'il soit fini ou abandonné. */
export async function resolveSequence(ctx: CommandContext, operation: SequenceOperation): Promise<SequenceOutcome> {
  if (!(await isSequenceRunning(ctx, operation))) return "completed";

  const conflicts = await listConflicts(ctx);
  const details = conflicts.length > 0 ? formatPaths(conflicts) : "  (aucun : le commit est peut-être vide)";
  ctx.ui.log(`${operation} interrompu, fichiers en conflit :\n${details}`, "warn");

  const action = await ctx.ui.select("Que faire ?", CONFLICT_CHOICES);
  if (!action) {
    ctx.ui.log(`${operation} toujours en cours. Relance /status pour voir l'état.`, "warn");
    return "paused";
  }
  if (action === "abort") {
    await ctx.git.run([operation, "--abort"]);
    ctx.ui.log(`${operation} annulé.`, "success");
    return "aborted";
  }
  if (action === "continue") await continueSequence(ctx, operation, conflicts);
  else await ctx.git.run([operation, "--skip"], { allowFailure: true });
  return resolveSequence(ctx, operation);
}

async function listConflicts(ctx: CommandContext): Promise<string[]> {
  const { files } = await getStatus(ctx.git);
  return files.filter(isConflict).map((file) => file.path);
}

async function continueSequence(
  ctx: CommandContext,
  operation: SequenceOperation,
  conflicts: readonly string[],
): Promise<void> {
  const unresolved = await findUnresolved(ctx, conflicts);
  if (unresolved.length > 0) {
    ctx.ui.log(`Conflits encore présents dans :\n${formatPaths(unresolved)}`, "error");
    return;
  }
  if (conflicts.length > 0) await ctx.git.run(["add", "--", ...conflicts]);
  const result = await ctx.git.run([operation, "--continue"], { allowFailure: true });
  if (result.exitCode !== 0) ctx.ui.log(result.stderr || result.stdout, "warn");
}

async function findUnresolved(ctx: CommandContext, paths: readonly string[]): Promise<string[]> {
  const resolved = await Promise.all(paths.map((path) => isConflictResolved(ctx.git, path)));
  return paths.filter((_path, index) => !resolved[index]);
}

function formatPaths(paths: readonly string[]): string {
  return paths.map((path) => `  ${path}`).join("\n");
}
