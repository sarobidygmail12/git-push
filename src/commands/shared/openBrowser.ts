import open from "open";
import type { CommandContext } from "../types.js";

export async function openPage(ctx: CommandContext, path: string): Promise<void> {
  const url = `${await ctx.web.ensureStarted()}${path}`;
  ctx.ui.log(url);
  try {
    const child = await open(url);
    child.once("error", () => ctx.ui.log("Navigateur introuvable : ouvre l'URL ci-dessus.", "warn"));
  } catch {
    ctx.ui.log("Navigateur introuvable : ouvre l'URL ci-dessus.", "warn");
  }
}
