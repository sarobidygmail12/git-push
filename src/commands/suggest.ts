import type { Command, CommandContext } from "./types.js";

export type Suggestion = {
  label: string;
  description: string;
  completion: string;
  needsArgs: boolean;
};

export type SuggestionList = { kind: "none" | "command" | "argument"; items: readonly Suggestion[] };

export const NO_SUGGESTIONS: SuggestionList = { kind: "none", items: [] };

const REQUIRED_ARG_MARKER = "<";

export function findCommand(commands: readonly Command[], name: string): Command | undefined {
  return commands.find((command) => command.name === name || command.aliases?.includes(name));
}

export function suggestCommands(commands: readonly Command[], query: string): SuggestionList {
  const items = commands
    .filter((command) => namesOf(command).some((name) => name.startsWith(query)))
    .sort((left, right) => rank(left, query) - rank(right, query) || left.name.localeCompare(right.name))
    .map(toSuggestion);
  return items.length > 0 ? { kind: "command", items } : NO_SUGGESTIONS;
}

export async function suggestInput(
  commands: readonly Command[],
  input: string,
  createContext: () => Promise<CommandContext>,
): Promise<SuggestionList> {
  if (!input.startsWith("/")) return NO_SUGGESTIONS;
  const body = input.slice(1);
  const nameEnd = body.indexOf(" ");
  if (nameEnd === -1) return suggestCommands(commands, body);

  const command = findCommand(commands, body.slice(0, nameEnd));
  if (!command?.completeArgs) return NO_SUGGESTIONS;
  return suggestArguments(command, input, createContext);
}

async function suggestArguments(
  command: Command,
  input: string,
  createContext: () => Promise<CommandContext>,
): Promise<SuggestionList> {
  const partialStart = input.lastIndexOf(" ") + 1;
  const partial = input.slice(partialStart);
  try {
    const candidates = await command.completeArgs?.(await createContext(), partial);
    const items = (candidates ?? [])
      .filter((candidate) => candidate.startsWith(partial))
      .map((candidate) => ({
        label: candidate,
        description: "",
        completion: `${input.slice(0, partialStart)}${candidate} `,
        needsArgs: false,
      }));
    return items.length > 0 ? { kind: "argument", items } : NO_SUGGESTIONS;
  } catch {
    return NO_SUGGESTIONS;
  }
}

function namesOf(command: Command): string[] {
  return [command.name, ...(command.aliases ?? [])];
}

/** Un alias exact (`/s`) passe avant les commandes qui commencent seulement pareil. */
function rank(command: Command, query: string): number {
  return namesOf(command).includes(query) ? 0 : 1;
}

function toSuggestion(command: Command): Suggestion {
  const aliases = command.aliases?.length ? ` (${command.aliases.map((alias) => `/${alias}`).join(", ")})` : "";
  return {
    label: `/${command.name}${aliases}`,
    description: command.description,
    completion: `/${command.name} `,
    needsArgs: command.usage.includes(REQUIRED_ARG_MARKER),
  };
}
