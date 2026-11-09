import open from "open";
import type { CommandContext } from "../types.js";
import { t } from "../../lang/index.js";

export async function openPage(ctx: CommandContext, path: string): Promise<void> {
  const url = `${await ctx.web.ensureStarted()}${path}`;
  ctx.ui.log(url);
  try {
    const child = await open(url);
    child.once("error", () => ctx.ui.log(t("browser.notFound"), "warn"));
  } catch {
    ctx.ui.log(t("browser.notFound"), "warn");
  }
}
