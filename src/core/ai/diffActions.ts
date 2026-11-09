const DIFF_HEADER = "diff --git ";
const NEW_PATH_PREFIX = "+++ b/";
const OLD_PATH_PREFIX = "--- a/";
const HUNK_MARKER = "@@";
const IDENTIFIER_SYMBOLS = "_$0123456789";

const DECLARATION_KEYWORDS = new Set(["function", "class", "def", "func", "fn", "interface", "type", "enum", "struct"]);
const DECLARATION_MODIFIERS = new Set(["export", "default", "async", "public", "private", "protected", "static", "abstract", "pub"]);
const VARIABLE_KEYWORD = "const";

export type FileActivity = {
  added: readonly string[];
  removed: readonly string[];
  modified: readonly string[];
  addedLines: number;
  removedLines: number;
};

/** Découpe un diff unifié par fichier ; un diff tronqué donne simplement moins de sections. */
export function splitDiffByFile(diff: string): Map<string, readonly string[]> {
  const entries = diff.split(`\n${DIFF_HEADER}`).flatMap((section): Array<[string, readonly string[]]> => {
    const lines = section.split("\n");
    const path = readSectionPath(lines);
    return path === undefined ? [] : [[path, lines]];
  });
  return new Map(entries);
}

function readSectionPath(lines: readonly string[]): string | undefined {
  const newPath = lines.find((line) => line.startsWith(NEW_PATH_PREFIX))?.slice(NEW_PATH_PREFIX.length);
  const oldPath = lines.find((line) => line.startsWith(OLD_PATH_PREFIX))?.slice(OLD_PATH_PREFIX.length);
  return (newPath ?? oldPath)?.trimEnd();
}

export function summarizeActivity(lines: readonly string[]): FileActivity {
  const additions = lines.filter((line) => line.startsWith("+") && !line.startsWith("+++"));
  const removals = lines.filter((line) => line.startsWith("-") && !line.startsWith("---"));
  const addedNames = declaredNames(additions.map((line) => line.slice(1)));
  const removedNames = declaredNames(removals.map((line) => line.slice(1)));
  const contextNames = declaredNames(lines.filter((line) => line.startsWith(HUNK_MARKER)).map(hunkContext));

  const rewritten = addedNames.filter((name) => removedNames.includes(name));
  const touched = contextNames.filter((name) => !addedNames.includes(name) && !removedNames.includes(name));
  return {
    added: addedNames.filter((name) => !removedNames.includes(name)),
    removed: removedNames.filter((name) => !addedNames.includes(name)),
    modified: [...new Set([...rewritten, ...touched])],
    addedLines: additions.length,
    removedLines: removals.length,
  };
}

function hunkContext(line: string): string {
  return line.slice(line.indexOf(HUNK_MARKER, HUNK_MARKER.length) + HUNK_MARKER.length);
}

function declaredNames(lines: readonly string[]): string[] {
  return [...new Set(lines.flatMap((line) => declaredName(line) ?? []))];
}

/** Repère `export async function total(` ou `export const total =`, sans dépendre d'un langage précis. */
function declaredName(line: string): string | undefined {
  const tokens = line.trim().split(" ").filter((token) => token !== "");
  const keywordIndex = tokens.findIndex((token) => !DECLARATION_MODIFIERS.has(token));
  const keyword = tokens[keywordIndex];
  const isExportedVariable = keyword === VARIABLE_KEYWORD && keywordIndex > 0;
  if (keyword === undefined || (!DECLARATION_KEYWORDS.has(keyword) && !isExportedVariable)) return undefined;
  const name = readIdentifier(tokens[keywordIndex + 1] ?? "");
  return name === "" ? undefined : name;
}

function readIdentifier(token: string): string {
  const characters = [...token];
  const end = characters.findIndex((character) => !isIdentifierCharacter(character));
  return (end === -1 ? characters : characters.slice(0, end)).join("");
}

function isIdentifierCharacter(character: string): boolean {
  return character.toLowerCase() !== character.toUpperCase() || IDENTIFIER_SYMBOLS.includes(character);
}
