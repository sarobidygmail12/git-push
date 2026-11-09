import { getOperationInProgress, getStatus, isConflict, isStaged, isUnstaged, type FileChange, type RepoStatus } from "../core/git/status.js";
import type { Command } from "./types.js";
import { t } from "../lang/index.js";

const headLabel = (): string => t("head.detached");

export const statusCommand: Command = {
  name: "status",
  aliases: ["s"],
  get description() {
    return t("cmd.status");
  },
  usage: "/status",
  examples: ["/status"],
  gitSteps: ["git status --porcelain=v2 --branch"],
  run: async (ctx) => {
    const [status, operation] = await Promise.all([getStatus(ctx.git), getOperationInProgress(ctx.git)]);
    ctx.ui.log(`${describeBranch(status)}${operation ? `\n${t("status.inProgress", { operation })}` : ""}`);
    if (status.files.length === 0) {
      ctx.ui.log(t("status.clean"), "success");
      return;
    }
    const sections = [
      section("En conflit", status.files.filter(isConflict)),
      section(t("status.staged"), status.files.filter(isStaged)),
      section(t("status.unstaged"), status.files.filter(isUnstaged)),
    ];
    ctx.ui.log(sections.filter((text) => text !== "").join("\n\n"));
  },
};

function describeBranch(status: RepoStatus): string {
  const branch = status.branch ?? headLabel();
  if (!status.upstream) return `${branch} (pas d'upstream)`;
  return `${branch} → ${status.upstream}  en avance : ${status.ahead}, en retard : ${status.behind}`;
}

function section(title: string, files: readonly FileChange[]): string {
  if (files.length === 0) return "";
  return `${title} :\n${files.map((file) => `  ${file.path}`).join("\n")}`;
}
