import type { CommandUi, LogLevel } from "../commands/types.js";

export type DisplayLevel = LogLevel | "git";

export type PromptRequest =
  | { kind: "ask"; question: string; initial: string; resolve: (answer: string | undefined) => void }
  | { kind: "confirm"; question: string; resolve: (answer: boolean) => void }
  | { kind: "select"; question: string; labels: readonly string[]; initialIndex: number; resolve: (index: number | undefined) => void };

export interface UiBridge {
  appendLog(text: string, level: DisplayLevel): void;
  showPrompt(request: PromptRequest | undefined): void;
  setSpinner(label: string | undefined): void;
  clear(): void;
  runExternal(task: () => Promise<void>): Promise<void>;
}

export function createCommandUi(bridge: UiBridge): CommandUi {
  const closingPrompt = <T,>(resolve: (value: T) => void) => (value: T): void => {
    bridge.showPrompt(undefined);
    resolve(value);
  };

  return {
    log: (message, level = "info") => bridge.appendLog(message, level),
    ask: (question, options) =>
      new Promise((resolve) => {
        bridge.showPrompt({ kind: "ask", question, initial: options?.initial ?? "", resolve: closingPrompt(resolve) });
      }),
    confirm: (question) =>
      new Promise((resolve) => {
        bridge.showPrompt({ kind: "confirm", question, resolve: closingPrompt(resolve) });
      }),
    select: (question, choices, options) =>
      new Promise((resolve) => {
        bridge.showPrompt({
          kind: "select",
          question,
          labels: choices.map((choice) => choice.label),
          initialIndex: Math.max(0, choices.findIndex((choice) => choice.value === options?.initial)),
          resolve: closingPrompt((index: number | undefined) => {
            resolve(index === undefined ? undefined : choices[index]?.value);
          }),
        });
      }),
    spinner: async (label, task) => {
      bridge.setSpinner(label);
      try {
        return await task();
      } finally {
        bridge.setSpinner(undefined);
      }
    },
    clear: () => bridge.clear(),
    runExternal: (task) => bridge.runExternal(task),
  };
}
