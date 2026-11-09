import { basename } from "node:path";
import { splitDiffByFile, summarizeActivity, type FileActivity } from "./diffActions.js";
import type { CommitMessageInput, CommitMessageProvider } from "./provider.js";

const MAX_NAMES_PER_ACTION = 3;
const MAX_NAMES_WHEN_SEVERAL_ACTIONS = 2;
const MAX_DETAIL_LINES = 10;
const DOC_SUFFIXES = [".md", ".mdx", ".txt"];
const TEST_MARKERS = [".test.", ".spec.", "tests/", "__tests__/"];

type StagedEntry = CommitMessageInput["files"][number] & { originalPath?: string };

type FileAction = { entry: StagedEntry; activity: FileActivity | undefined };

export const fallbackProvider: CommitMessageProvider = {
  name: "fallback",
  generate: (input) => Promise.resolve(buildFallbackMessage(input)),
};

/** Sans IA, résume les fichiers touchés dans le titre et ce que le diff montre de chacun dans le détail. */
export function buildFallbackMessage(input: CommitMessageInput): string {
  const sections = splitDiffByFile(input.diff);
  const actions = input.files.map((entry): FileAction => {
    const lines = sections.get(entry.path);
    return { entry, activity: lines ? summarizeActivity(lines) : undefined };
  });

  const summary = describeOverall(actions);
  const subject = input.convention === "conventional" ? `${guessType(input)}: ${summary}` : capitalize(summary);
  return `${subject}\n\n${describeDetails(actions).join("\n")}`;
}

function describeOverall(actions: readonly FileAction[]): string {
  const groups = [
    { verb: "add", entries: entriesWithStatus(actions, ["A"]) },
    { verb: "remove", entries: entriesWithStatus(actions, ["D"]) },
    { verb: "rename", entries: entriesWithStatus(actions, ["R"]) },
    { verb: "update", entries: actions.map((action) => action.entry).filter((entry) => !["A", "D", "R"].includes(entry.status)) },
  ].filter((group) => group.entries.length > 0);
  const limit = groups.length > 1 ? MAX_NAMES_WHEN_SEVERAL_ACTIONS : MAX_NAMES_PER_ACTION;
  return groups.map((group) => `${group.verb} ${listNames(group.entries.map((entry) => shortLabel(entry.path)), limit)}`).join(", ");
}

function entriesWithStatus(actions: readonly FileAction[], statuses: readonly string[]): StagedEntry[] {
  return actions.map((action) => action.entry).filter((entry) => statuses.includes(entry.status));
}

function listNames(names: readonly string[], limit: number): string {
  const unique = [...new Set(names)];
  const shown = unique.slice(0, limit);
  const hiddenCount = unique.length - shown.length;
  if (hiddenCount > 0) return `${shown.join(", ")} and ${hiddenCount} more`;
  const last = shown.at(-1) ?? "";
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${last}` : last;
}

/** `src/commands/config.test.ts` devient « config tests » : le chemin complet reste dans le détail. */
function shortLabel(path: string): string {
  const fileName = basename(path);
  const name = fileName.split(".")[0] || fileName;
  return TEST_MARKERS.some((marker) => path.includes(marker)) ? `${name} tests` : name;
}

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function describeDetails(actions: readonly FileAction[]): string[] {
  const shown = actions.slice(0, MAX_DETAIL_LINES).map((action) => `- ${describeFile(action)}`);
  const hiddenCount = actions.length - shown.length;
  return hiddenCount > 0 ? [...shown, `- and ${hiddenCount} more file(s)`] : shown;
}

function describeFile({ entry, activity }: FileAction): string {
  if (entry.status === "D") return `Remove ${entry.path}`;
  return `${describeFileAction(entry)}${describeChanges(activity)}`;
}

function describeFileAction(entry: StagedEntry): string {
  if (entry.status === "A") return `Add ${entry.path}`;
  if (entry.status === "R") return `Rename ${entry.originalPath ?? "?"} to ${entry.path}`;
  return `Update ${entry.path}`;
}

function describeChanges(activity: FileActivity | undefined): string {
  if (!activity) return "";
  const named = describeNamedChanges(activity);
  if (named) return `: ${named}`;
  return activity.addedLines + activity.removedLines > 0 ? ` (+${activity.addedLines} -${activity.removedLines})` : "";
}

function describeNamedChanges(activity: FileActivity): string {
  return [formatNames("add", activity.added), formatNames("remove", activity.removed), formatNames("update", activity.modified)]
    .filter((part) => part !== "")
    .join(", ");
}

function formatNames(verb: string, names: readonly string[]): string {
  return names.length === 0 ? "" : `${verb} ${listNames(names, MAX_NAMES_PER_ACTION)}`;
}

function guessType(input: CommitMessageInput): string {
  const paths = input.files.map((file) => file.path);
  if (paths.every((path) => DOC_SUFFIXES.some((suffix) => path.endsWith(suffix)))) return "docs";
  if (paths.every((path) => TEST_MARKERS.some((marker) => path.includes(marker)))) return "test";
  return input.files.every((file) => file.status === "A") ? "feat" : "chore";
}
