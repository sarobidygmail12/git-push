import { getStatus } from "../core/git/status.js";
import type { Command, CommandContext } from "./types.js";
import { t } from "../lang/index.js";

const SUBCOMMANDS = ["pop", "list"];

export const stashCommand: Command = {
  name: "stash",
  get description() {
    return t("cmd.stash");
  },
  usage: "/stash [pop|list]",
  examples: ["/stash", "/stash pop", "/stash list"],
  gitSteps: ["git stash push -u", "git stash pop", "git stash list"],
  completeArgs: () => Promise.resolve(SUBCOMMANDS),
  run: async (ctx, [subcommand]) => {
    if (subcommand === undefined) return pushStash(ctx);
    if (subcommand === "pop") return popStash(ctx);
    if (subcommand === "list") return listStashes(ctx);
    ctx.ui.log(t("msg.usage", { usage: stashCommand.usage }), "warn");
  },
};

async function pushStash(ctx: CommandContext): Promise<void> {
  const { files } = await getStatus(ctx.git);
  if (files.length === 0) {
    ctx.ui.log(t("stash.nothing"));
    return;
  }
  await ctx.git.run(["stash", "push", "-u"]);
  ctx.ui.log(t("stash.done"), "success");
}

async function popStash(ctx: CommandContext): Promise<void> {
  const { stdout } = await ctx.git.run(["stash", "pop"]);
  ctx.ui.log(stdout, "success");
}

async function listStashes(ctx: CommandContext): Promise<void> {
  const { stdout } = await ctx.git.run(["stash", "list"]);
  ctx.ui.log(stdout === "" ? t("stash.none") : stdout);
}
