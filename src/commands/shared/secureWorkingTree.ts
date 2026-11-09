import { getStatus } from "../../core/git/status.js";
import type { CommandContext } from "../types.js";
import { commitFlow } from "./commitFlow.js";

type DirtyTreeAction = "commit" | "stash";

const DIRTY_TREE_CHOICES = [
  { label: "Committer (flux /commit)", value: "commit" },
  { label: "Mettre de côté (git stash)", value: "stash" },
] as const satisfies ReadonlyArray<{ label: string; value: DirtyTreeAction }>;

/** Renvoie false si l'utilisateur renonce : les modifications en cours restent alors intactes. */
export async function secureWorkingTree(ctx: CommandContext, nextStep: string): Promise<boolean> {
  const { files } = await getStatus(ctx.git);
  if (files.length === 0) return true;

  const action = await ctx.ui.select(`${files.length} fichier(s) modifié(s). Que faire avant ${nextStep} ?`, DIRTY_TREE_CHOICES);
  if (action === "commit") return (await commitFlow(ctx)) !== "cancelled";
  if (action === "stash") {
    await ctx.git.run(["stash", "push", "-u", "-m", `gitpilot : avant ${nextStep}`]);
    ctx.ui.log("Modifications mises de côté. Récupère-les avec /stash pop.", "success");
    return true;
  }
  return false;
}
