import { getOperationInProgress, getStatus, isConflict, isStaged, isUnstaged, type FileChange, type RepoStatus } from "../core/git/status.js";
import type { Command } from "./types.js";

const HEAD_LABEL = "HEAD détaché";

export const statusCommand: Command = {
  name: "status",
  aliases: ["s"],
  description: "Affiche l'état du dépôt",
  usage: "/status",
  examples: ["/status"],
  gitSteps: ["git status --porcelain=v2 --branch"],
  run: async (ctx) => {
    const [status, operation] = await Promise.all([getStatus(ctx.git), getOperationInProgress(ctx.git)]);
    ctx.ui.log(`${describeBranch(status)}${operation ? `\n${operation} en cours` : ""}`);
    if (status.files.length === 0) {
      ctx.ui.log("Working tree propre.", "success");
      return;
    }
    const sections = [
      section("En conflit", status.files.filter(isConflict)),
      section("Indexés", status.files.filter(isStaged)),
      section("Non indexés", status.files.filter(isUnstaged)),
    ];
    ctx.ui.log(sections.filter((text) => text !== "").join("\n\n"));
  },
};

function describeBranch(status: RepoStatus): string {
  const branch = status.branch ?? HEAD_LABEL;
  if (!status.upstream) return `${branch} (pas d'upstream)`;
  return `${branch} → ${status.upstream}  en avance : ${status.ahead}, en retard : ${status.behind}`;
}

function section(title: string, files: readonly FileChange[]): string {
  if (files.length === 0) return "";
  return `${title} :\n${files.map((file) => `  ${file.path}`).join("\n")}`;
}
