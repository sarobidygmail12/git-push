import { vi } from "vitest";
import type { CommandContext, CommandUi, SelectChoice } from "../../src/commands/types.js";
import { DEFAULT_CONFIG, type Config } from "../../src/core/config/schema.js";
import { createGitClient } from "../../src/core/git/gitClient.js";

export type FakeAnswers = { confirm?: boolean; select?: string | string[]; ask?: string | string[] };

export function createFakeUi(answers: FakeAnswers): CommandUi {
  const nextSelection = (): string | undefined =>
    Array.isArray(answers.select) ? answers.select.shift() : answers.select;
  return {
    log: vi.fn(),
    ask: () => Promise.resolve(Array.isArray(answers.ask) ? answers.ask.shift() : answers.ask),
    confirm: () => Promise.resolve(answers.confirm ?? false),
    select: <T>(_question: string, choices: readonly SelectChoice<T>[]) => {
      const selection = nextSelection();
      return Promise.resolve(choices.find((choice) => choice.value === selection)?.value);
    },
    spinner: (_label, task) => task(),
    clear: vi.fn(),
    runExternal: (task) => task(),
  };
}

export function createFakeContext(cwd: string, answers: FakeAnswers, config: Config = DEFAULT_CONFIG): CommandContext {
  return {
    git: createGitClient({ cwd }),
    config,
    ui: createFakeUi(answers),
    ai: { generate: () => Promise.resolve({ message: "feat: généré", provider: "fallback", failures: [] }) },
    commands: [],
    web: { ensureStarted: () => Promise.resolve("http://localhost") },
    paths: { global: "", repo: undefined },
    exit: vi.fn(),
  };
}
