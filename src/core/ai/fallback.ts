import { basename } from "node:path";
import { splitDiffByFile, summarizeActivity, type FileActivity } from "./diffActions.js";
import type { CommitMessageInput, CommitMessageProvider } from "./provider.js";

const MAX_NAMES_PER_ACTION = 3;
const MAX_AREAS_IN_SUBJECT = 4;
const MAX_DETAIL_LINES = 10;
const DOC_SUFFIXES = [".md", ".mdx", ".txt"];
const TEST_MARKERS = [".test.", ".spec.", "tests/", "__tests__/"];
const SOURCE_ROOTS = ["src", "lib", "app"];

type ChangeVerbs = { add: string; remove: string; update: string };

const IMPERATIVE: ChangeVerbs = { add: "add", remove: "remove", update: "update" };
const THIRD_PERSON: ChangeVerbs = { add: "adds", remove: "removes", update: "updates" };

type StagedEntry = CommitMessageInput["files"][number] & { originalPath?: string };

type FileAction = { entry: StagedEntry; activity: FileActivity | undefined };

export const fallbackProvider: CommitMessageProvider = {
  name: "fallback",
  generate: (input) => Promise.resolve(buildFallbackMessage(input)),
};

/** Sans IA, écrit des phrases à partir de ce que le diff montre : il décrit le quoi, jamais un pourquoi inventé. */
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
  const [onlyAction] = actions;
  return actions.length === 1 && onlyAction ? describeSingleFile(onlyAction) : describeSeveralFiles(actions);
}

function describeSingleFile({ entry, activity }: FileAction): string {
  const fileName = basename(entry.path);
  if (entry.status === "D") return `remove ${fileName}`;
  if (entry.status === "R") return `rename ${basename(entry.originalPath ?? "?")} to ${fileName}`;
  if (entry.status === "A") return `add ${fileName}`;
  const named = activity ? describeNamedChanges(activity, IMPERATIVE) : "";
  return named ? `${named} in ${fileName}` : `update ${fileName}`;
}

function describeSeveralFiles(actions: readonly FileAction[]): string {
  const areas = [...new Set(actions.map((action) => describeArea(action.entry.path)))];
  const place = areas.length > 1 ? "across" : "in";
  return `${chooseVerb(actions)} ${actions.length} files ${place} ${listNames(areas, MAX_AREAS_IN_SUBJECT)}`;
}

function chooseVerb(actions: readonly FileAction[]): string {
  if (actions.every((action) => action.entry.status === "A")) return "add";
  if (actions.every((action) => action.entry.status === "D")) return "remove";
  return "update";
}

function describeArea(path: string): string {
  if (isDocumentation(path)) return "docs";
  if (isTest(path)) return "tests";
  const folders = path.split("/").slice(0, -1).filter((folder) => !SOURCE_ROOTS.includes(folder));
  return folders.at(-1) ?? (basename(path).split(".")[0] || basename(path));
}

function isDocumentation(path: string): boolean {
  return DOC_SUFFIXES.some((suffix) => path.endsWith(suffix));
}

function isTest(path: string): boolean {
  return TEST_MARKERS.some((marker) => path.includes(marker));
}

function listNames(names: readonly string[], limit: number): string {
  const unique = [...new Set(names)];
  const shown = unique.slice(0, limit);
  const hiddenCount = unique.length - shown.length;
  if (hiddenCount > 0) return `${shown.join(", ")} and ${hiddenCount} more`;
  const last = shown.at(-1) ?? "";
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${last}` : last;
}

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function describeDetails(actions: readonly FileAction[]): string[] {
  const mostInformativeFirst = [...actions].sort((first, second) => Number(hasNamedChanges(second)) - Number(hasNamedChanges(first)));
  const shown = mostInformativeFirst.slice(0, MAX_DETAIL_LINES).map((action) => `- ${describeFile(action)}`);
  const hiddenCount = actions.length - shown.length;
  return hiddenCount > 0 ? [...shown, `- Also touches ${countOf(hiddenCount, "more file")}.`] : shown;
}

function hasNamedChanges({ activity }: FileAction): boolean {
  return activity !== undefined && describeNamedChanges(activity, THIRD_PERSON) !== "";
}

function describeFile({ entry, activity }: FileAction): string {
  if (entry.status === "D") return `Removes ${entry.path}.`;
  if (entry.status === "A") return describeAddedFile(entry.path, activity);
  const named = activity ? describeNamedChanges(activity, THIRD_PERSON) : "";
  if (entry.status === "R") return `Renames ${entry.originalPath ?? "?"} to ${entry.path}${named ? ` and ${named}` : ""}.`;
  if (named) return `Changes ${entry.path}: it ${named}.`;
  return activity ? describeEditedLines(entry.path, activity) : `Updates ${entry.path}.`;
}

function describeAddedFile(path: string, activity: FileActivity | undefined): string {
  if (activity && activity.added.length > 0) return `Adds ${path}, which defines ${listNames(activity.added, MAX_NAMES_PER_ACTION)}.`;
  return activity && activity.addedLines > 0 ? `Adds ${path} with ${countOf(activity.addedLines, "line")}.` : `Adds ${path}.`;
}

function describeEditedLines(path: string, { addedLines, removedLines }: FileActivity): string {
  const parts = [
    addedLines > 0 ? `adding ${countOf(addedLines, "line")}` : "",
    removedLines > 0 ? `removing ${countOf(removedLines, "line")}` : "",
  ].filter((part) => part !== "");
  return parts.length > 0 ? `Edits ${path}, ${parts.join(" and ")}.` : `Updates ${path}.`;
}

function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count > 1 ? "s" : ""}`;
}

function describeNamedChanges(activity: FileActivity, verbs: ChangeVerbs): string {
  return [formatNames(verbs.add, activity.added), formatNames(verbs.remove, activity.removed), formatNames(verbs.update, activity.modified)]
    .filter((part) => part !== "")
    .join(", ");
}

function formatNames(verb: string, names: readonly string[]): string {
  return names.length === 0 ? "" : `${verb} ${listNames(names, MAX_NAMES_PER_ACTION)}`;
}

function guessType(input: CommitMessageInput): string {
  const paths = input.files.map((file) => file.path);
  if (paths.every(isDocumentation)) return "docs";
  if (paths.every(isTest)) return "test";
  return input.files.every((file) => file.status === "A") ? "feat" : "chore";
}
