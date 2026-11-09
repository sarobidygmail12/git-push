import { assertCredentialValue, ensureCredentialHelper, readOrigin, storeToken, verifyToken } from "../core/git/credentials.js";
import type { Command, CommandContext } from "./types.js";
import { t } from "../lang/index.js";

const DEFAULT_HOST = "github.com";

export const loginCommand: Command = {
  name: "login",
  get description() {
    return t("cmd.login");
  },
  usage: "/login",
  examples: ["/login"],
  gitSteps: ["git ls-remote origin HEAD", "git credential approve"],
  run: async (ctx) => {
    const origin = await readOrigin(ctx.git);
    const host = origin?.host ?? (await askHost(ctx));
    if (host === undefined) return cancel(ctx);

    // Jamais en argument de /login : la ligne de commande est réaffichée dans le journal.
    const token = (await ctx.ui.ask(t("login.tokenPrompt", { host }), { secret: true }))?.trim();
    if (!token) return cancel(ctx);
    assertCredentialValue(host);
    assertCredentialValue(token);

    const canVerify = origin?.usesHttps === true;
    if (canVerify) await ctx.ui.spinner(t("spinner.checkToken"), () => verifyToken(ctx.git, host, token));
    if (await ensureCredentialHelper(ctx.git)) ctx.ui.log(t("login.helperSet"), "warn");
    await storeToken(ctx.git, host, token);

    ctx.ui.log(t(canVerify ? "login.connected" : "login.saved", { host }), "success");
    if (origin && !origin.usesHttps) ctx.ui.log(t("login.sshRemote"), "warn");
  },
};

async function askHost(ctx: CommandContext): Promise<string | undefined> {
  const answer = (await ctx.ui.ask(t("login.hostPrompt"), { initial: DEFAULT_HOST }))?.trim();
  return answer ? answer.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : undefined;
}

function cancel(ctx: CommandContext): void {
  ctx.ui.log(t("login.cancelled"), "warn");
}
