export type ParsedInput = { name: string; args: string[] };

type TokenizerState = { tokens: string[]; current: string | undefined; inQuotes: boolean };

const COMMAND_PREFIX = "/";
const QUOTE = '"';

export function parseInput(line: string): ParsedInput | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith(COMMAND_PREFIX)) return undefined;
  const [name, ...args] = tokenize(trimmed.slice(COMMAND_PREFIX.length));
  return name === undefined ? undefined : { name, args };
}

/** Seul `"` délimite : une apostrophe française dans un message ne doit rien ouvrir. */
export function tokenize(text: string): string[] {
  const end = [...text].reduce(consumeCharacter, { tokens: [], current: undefined, inQuotes: false });
  return end.current === undefined ? end.tokens : [...end.tokens, end.current];
}

function consumeCharacter(state: TokenizerState, character: string): TokenizerState {
  if (character === QUOTE) return { ...state, current: state.current ?? "", inQuotes: !state.inQuotes };
  if (isSeparator(character) && !state.inQuotes) return closeToken(state);
  return { ...state, current: `${state.current ?? ""}${character}` };
}

function closeToken(state: TokenizerState): TokenizerState {
  if (state.current === undefined) return state;
  return { ...state, tokens: [...state.tokens, state.current], current: undefined };
}

function isSeparator(character: string): boolean {
  return character === " " || character === "\t";
}
