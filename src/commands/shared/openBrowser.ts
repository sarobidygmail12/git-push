import open from "open";
import type { CommandContext } from "../types.js";
import { t } from "../../lang/index.js";

export async function openPage(ctx: CommandContext, path: string): Promise<void> {
  await openUrl(ctx, `${await ctx.web.ensureStarted()}${path}`);
}

export async function openUrl(ctx: CommandContext, url: string): Promise<void> {
  ctx.ui.log(url);
  try {
    const child = await open(url);
    child.once("error", () => ctx.ui.log(t("browser.notFound"), "warn"));
  } catch {
    ctx.ui.log(t("browser.notFound"), "warn");
  }
}
