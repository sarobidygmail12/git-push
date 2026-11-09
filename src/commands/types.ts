import type { CommitMessageGenerator } from "../core/ai/provider.js";
import type { Config } from "../core/config/schema.js";
import type { GitClient } from "../core/git/gitClient.js";

export type LogLevel = "info" | "success" | "warn" | "error";

export type SelectChoice<T> = { label: string; value: T };

export interface CommandUi {
  log(message: string, level?: LogLevel): void;
  ask(question: string, options?: { initial?: string; secret?: boolean }): Promise<string | undefined>;
  confirm(question: string): Promise<boolean>;
  select<T>(question: string, choices: readonly SelectChoice<T>[], options?: { initial?: T }): Promise<T | undefined>;
  spinner<T>(label: string, task: () => Promise<T>): Promise<T>;
  clear(): void;
  /** Rend le terminal à un programme externe, comme `$EDITOR`. */
  runExternal(task: () => Promise<void>): Promise<void>;
}

export interface WebServer {
  /** Démarre le serveur si besoin et renvoie son URL de base. */
  ensureStarted(): Promise<string>;
}

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  /** Un `<` signale un argument obligatoire : Entrée complète au lieu d'exécuter. */
  usage: string;
  examples: string[];
  gitSteps: string[];
  /** La commande reste utilisable pour réparer une configuration cassée. */
  allowsInvalidConfig?: boolean;
  completeArgs?(ctx: CommandContext, partial: string): Promise<string[]>;
  run(ctx: CommandContext, args: string[]): Promise<void>;
}

export interface CommandContext {
  git: GitClient;
  config: Config;
  ui: CommandUi;
  ai: CommitMessageGenerator;
  commands: readonly Command[];
  web: WebServer;
  paths: ConfigPaths;
  exit(): void;
}

export type ConfigPaths = { global: string; repo: string | undefined };
