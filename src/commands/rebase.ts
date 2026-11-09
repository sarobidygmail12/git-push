import { GitError } from "../core/errors.js";
import { isValidBranchName } from "../core/git/branches.js";
import { assertNoOperationInProgress, getStatus } from "../core/git/status.js";
import { isSequenceRunning, resolveSequence } from "./shared/resolveSequence.js";
import { secureWorkingTree } from "./shared/secureWorkingTree.js";
import type { Command, CommandContext } from "./types.js";

const REMOTE = "origin";

export const rebaseCommand: Command = {
  name: "rebase",
  aliases: ["rb"],
  description: "Rebase la branche courante sur la dernière version de develop ou preprod",
  usage: "/rebase [develop|preprod]",
  examples: ["/rebase", "/rebase develop", "/rebase preprod"],
  gitSteps: [
    "git fetch origin <base>",
    "flux de /commit ou git stash push -u si le working tree est modifié",
    "git rebase origin/<base>",
    "en cas de conflit : git rebase --continue | --abort | --skip",
    "si la branche était déjà poussée, après confirmation : git push --force-with-lease",
  ],
  completeArgs: (ctx) => Promise.resolve(listBases(ctx)),
  run: async (ctx, [requestedBase]) => {
    if (await isSequenceRunning(ctx, "rebase")) return finishRebase(ctx);
    await assertNoOperationInProgress(ctx.git);

    const base = await chooseBase(ctx, requestedBase);
    if (!base) {
      ctx.ui.log("Rebase annulé.", "warn");
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
    return ctx.ui.select("Rebaser sur la dernière version de :", bases.map((base) => ({ label: base, value: base })));
  }
  if (!bases.includes(requestedBase)) throw new GitError(`Base inconnue : ${requestedBase}. Choix : ${bases.join(", ")}.`);
  return requestedBase;
}

async function rebaseOnLatest(ctx: CommandContext, base: string): Promise<void> {
  // La base peut venir d'un .gitpilot.json : un nom comme `--upload-pack=…` ne doit jamais atteindre git fetch.
  if (!(await isValidBranchName(ctx.git, base))) throw new GitError(`Nom de branche invalide : ${base}`);
  const { branch } = await getStatus(ctx.git);
  if (!branch) throw new GitError("HEAD détaché : bascule d'abord sur une branche.");

  await ctx.ui.spinner(`Récupération de ${REMOTE}/${base}…`, () => ctx.git.run(["fetch", REMOTE, base]));

  if (!(await confirmProtectedRebase(ctx, branch)) || !(await secureWorkingTree(ctx, `/rebase ${base}`))) {
    ctx.ui.log("Rebase annulé.", "warn");
    return;
  }

  const target = `${REMOTE}/${base}`;
  const result = await ctx.git.run(["rebase", target], { allowFailure: true });
  if (result.exitCode !== 0 && !(await isSequenceRunning(ctx, "rebase"))) {
    const output = result.stderr || result.stdout;
    throw new GitError(output, { args: ["rebase", target], exitCode: result.exitCode, stderr: output });
  }
  await finishRebase(ctx);
}

async function confirmProtectedRebase(ctx: CommandContext, branch: string): Promise<boolean> {
  if (!ctx.config.branches.protected.includes(branch)) return true;
  return ctx.ui.confirm(`« ${branch} » est une branche protégée et le rebase réécrit son historique. Continuer ?`);
}

async function finishRebase(ctx: CommandContext): Promise<void> {
  if ((await resolveSequence(ctx, "rebase")) !== "completed") return;
  ctx.ui.log("Rebase terminé.", "success");
  await offerForcePush(ctx);
}

/** Après un rebase, une branche déjà poussée a divergé : seul un push forcé peut la mettre à jour. */
async function offerForcePush(ctx: CommandContext): Promise<void> {
  const status = await getStatus(ctx.git);
  if (!status.upstream || status.ahead === 0 || status.behind === 0) return;

  const question = `${status.branch ?? "La branche"} a divergé de ${status.upstream}. Pousser avec --force-with-lease ?`;
  if (!(await ctx.ui.confirm(question))) {
    ctx.ui.log("Non poussé. Le remote garde l'ancien historique.", "warn");
    return;
  }
  await ctx.ui.spinner("Push…", () => ctx.git.run(["push", "--force-with-lease"], { destructiveConfirmed: true }));
  ctx.ui.log("Poussé.", "success");
}
