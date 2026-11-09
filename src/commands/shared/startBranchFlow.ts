import { assertCanStartBranch, startBranchFrom } from "../../core/git/branches.js";
import { getStatus } from "../../core/git/status.js";
import type { CommandContext } from "../types.js";
import { commitFlow } from "./commitFlow.js";

export type StartBranchRequest = {
  base: string;
  prefix: string;
  name: string | undefined;
  forceDivergedBase?: boolean;
};

export async function startBranchFlow(ctx: CommandContext, request: StartBranchRequest): Promise<void> {
  const name = request.name ?? (await ctx.ui.ask(`Nom de la branche (${request.prefix}…)`))?.trim();
  if (!name) {
    ctx.ui.log("Annulé, aucun nom de branche.", "warn");
    return;
  }

  // Vérifié avant le commit : un nom refusé ne doit pas laisser un commit poussé pour rien.
  await assertCanStartBranch(ctx.git, request.base, `${request.prefix}${name}`);

  const { files } = await getStatus(ctx.git);
  const hadChanges = files.length > 0;
  if (hadChanges && (await commitFlow(ctx)) === "cancelled") {
    ctx.ui.log("Arrêt : les modifications n'ont pas été committées, aucun changement de branche.", "warn");
    return;
  }

  const started = await startBranchFrom(ctx.git, request.base, request.prefix, name, {
    forceDivergedBase: request.forceDivergedBase ?? false,
  });
  const steps = [...(hadChanges ? ["commit des modifications en cours"] : []), ...started.steps];
  if (started.backupBranch) {
    ctx.ui.log(`${request.base} avait divergé : aligné sur le remote. Tes anciens commits locaux sont dans ${started.backupBranch}.`, "warn");
  }
  ctx.ui.log(`Branche ${started.branch} créée depuis ${request.base} :\n${steps.map((step) => `  ✓ ${step}`).join("\n")}`, "success");
}
