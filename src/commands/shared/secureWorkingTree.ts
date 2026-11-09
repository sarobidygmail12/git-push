import { getStatus } from "../../core/git/status.js";
import type { CommandContext } from "../types.js";
import { commitFlow } from "./commitFlow.js";
import { t } from "../../lang/index.js";

type DirtyTreeAction = "commit" | "stash";

function dirtyTreeChoices(): ReadonlyArray<{ label: string; value: DirtyTreeAction }> {
  return [
    { label: t("dirty.commit"), value: "commit" },
    { label: t("dirty.stash"), value: "stash" },
  ];
}

/** Renvoie false si l'utilisateur renonce : les modifications en cours restent alors intactes. */
export async function secureWorkingTree(ctx: CommandContext, nextStep: string): Promise<boolean> {
  const { files } = await getStatus(ctx.git);
  if (files.length === 0) return true;

  const action = await ctx.ui.select(t("dirty.question", { count: files.length, next: nextStep }), dirtyTreeChoices());
  if (action === "commit") return (await commitFlow(ctx)) !== "cancelled";
  if (action === "stash") {
    await ctx.git.run(["stash", "push", "-u", "-m", `gitpilot : avant ${nextStep}`]);
    ctx.ui.log(t("dirty.stashed"), "success");
    return true;
  }
  return false;
}
