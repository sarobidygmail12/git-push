import { splitDiffByFile, summarizeActivity, type FileActivity } from "./diffActions.js";
import type { CommitMessageInput, CommitMessageProvider } from "./provider.js";

const MAX_NAMES_PER_ACTION = 3;
const DOC_SUFFIXES = [".md", ".mdx", ".txt"];
const TEST_MARKERS = [".test.", ".spec.", "tests/", "__tests__/"];

type Wording = {
  add: string;
  remove: string;
  update: string;
  createFile: string;
  deleteFile: string;
  renamedFrom: (path: string) => string;
  lines: (added: number, removed: number) => string;
  notAnalyzed: string;
  files: (verb: string, count: number) => string;
};

const FRENCH: Wording = {
  add: "ajoute",
  remove: "supprime",
  update: "modifie",
  createFile: "crée le fichier",
  deleteFile: "supprime le fichier",
  renamedFrom: (path) => `renommé depuis ${path}`,
  lines: (added, removed) => `ajoute ${added} ligne(s), retire ${removed} ligne(s)`,
  notAnalyzed: "modifié (contenu non analysé)",
  files: (verb, count) => `${verb} ${count} fichier(s)`,
};

const ENGLISH: Wording = {
  add: "add",
  remove: "remove",
  update: "update",
  createFile: "create file",
  deleteFile: "delete file",
  renamedFrom: (path) => `renamed from ${path}`,
  lines: (added, removed) => `add ${added} line(s), remove ${removed} line(s)`,
  notAnalyzed: "changed (content not analyzed)",
  files: (verb, count) => `${verb} ${count} file(s)`,
};

type StagedEntry = CommitMessageInput["files"][number] & { originalPath?: string };

type FileAction = { entry: StagedEntry; activity: FileActivity | undefined };

export const fallbackProvider: CommitMessageProvider = {
  name: "fallback",
  generate: (input) => Promise.resolve(buildFallbackMessage(input)),
};

/** Sans IA, décrit ce que le diff montre : déclarations ajoutées, retirées ou touchées dans chaque fichier. */
export function buildFallbackMessage(input: CommitMessageInput): string {
  const wording = input.language.startsWith("fr") ? FRENCH : ENGLISH;
  const sections = splitDiffByFile(input.diff);
  const actions = input.files.map((entry): FileAction => {
    const lines = sections.get(entry.path);
    return { entry, activity: lines ? summarizeActivity(lines) : undefined };
  });

  const summary = describeOverall(actions, wording);
  const subject = input.convention === "conventional" ? `${guessType(input)}: ${summary}` : summary;
  const details = actions.map((action) => `- ${action.entry.path} : ${describeFile(action, wording)}`);
  return `${subject}\n\n${details.join("\n")}`;
}

function describeOverall(actions: readonly FileAction[], wording: Wording): string {
  const activities = actions.flatMap((action) => action.activity ?? []);
  const named = describeNamedChanges(
    {
      added: activities.flatMap((activity) => activity.added),
      removed: activities.flatMap((activity) => activity.removed),
      modified: activities.flatMap((activity) => activity.modified),
      addedLines: 0,
      removedLines: 0,
    },
    wording,
  );
  return named || wording.files(chooseVerb(actions, wording), actions.length);
}

function chooseVerb(actions: readonly FileAction[], wording: Wording): string {
  if (actions.every((action) => action.entry.status === "A")) return wording.add;
  if (actions.every((action) => action.entry.status === "D")) return wording.remove;
  return wording.update;
}

function describeFile({ entry, activity }: FileAction, wording: Wording): string {
  if (entry.status === "D") return wording.deleteFile;
  const changes = activity ? describeChanges(activity, wording) : "";
  if (entry.status === "A") return changes ? `${wording.createFile}, ${changes}` : wording.createFile;
  if (entry.status === "R") {
    const renamed = wording.renamedFrom(entry.originalPath ?? "?");
    return activity && changes ? `${renamed}, ${changes}` : renamed;
  }
  return changes || wording.notAnalyzed;
}

function describeChanges(activity: FileActivity, wording: Wording): string {
  const named = describeNamedChanges(activity, wording);
  if (named) return named;
  return activity.addedLines + activity.removedLines > 0 ? wording.lines(activity.addedLines, activity.removedLines) : "";
}

function describeNamedChanges(activity: FileActivity, wording: Wording): string {
  return [
    formatNames(wording.add, activity.added),
    formatNames(wording.remove, activity.removed),
    formatNames(wording.update, activity.modified),
  ]
    .filter((part) => part !== "")
    .join(", ");
}

function formatNames(verb: string, names: readonly string[]): string {
  if (names.length === 0) return "";
  const unique = [...new Set(names)];
  const listed = unique.slice(0, MAX_NAMES_PER_ACTION).join(", ");
  return `${verb} ${listed}${unique.length > MAX_NAMES_PER_ACTION ? "…" : ""}`;
}

function guessType(input: CommitMessageInput): string {
  const paths = input.files.map((file) => file.path);
  if (paths.every((path) => DOC_SUFFIXES.some((suffix) => path.endsWith(suffix)))) return "docs";
  if (paths.every((path) => TEST_MARKERS.some((marker) => path.includes(marker)))) return "test";
  return input.files.every((file) => file.status === "A") ? "feat" : "chore";
}
