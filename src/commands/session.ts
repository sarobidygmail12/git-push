import { createGeneratorFromConfig } from "../core/ai/generator.js";
import { DEFAULT_CONFIG, type Config } from "../core/config/schema.js";
import { loadConfig, repoConfigPath } from "../core/config/loadConfig.js";
import { ConfigError, GitError, GitPilotError } from "../core/errors.js";
import { createGitClient, type GitClient } from "../core/git/gitClient.js";
import { countChanges, describeBranch, describeRepoState, getRepoRoot, getStatus, type ChangeCounts } from "../core/git/status.js";
import { createWebServer } from "../web/server.js";
import { parseInput } from "./parseInput.js";
import { findCommand, suggestInput, type SuggestionList } from "./suggest.js";
import type { Command, CommandContext, CommandUi, ConfigPaths } from "./types.js";

export type HeaderState = {
  branch: string;
  changes: ChangeCounts;
};

export interface ReplSession {
  execute(line: string): Promise<void>;
  suggest(input: string): Promise<SuggestionList>;
  readHeader(): Promise<HeaderState | undefined>;
}

export type SessionOptions = {
  cwd: string;
  globalConfigPath: string;
  commands: readonly Command[];
  ui: CommandUi;
  onGitCommand: (commandLine: string) => void;
  exit: () => void;
};

export function createSession(options: SessionOptions): ReplSession {
  const { cwd, commands, ui, exit } = options;
  const git = createGitClient({ cwd, onCommand: options.onGitCommand });
  const silentGit = createGitClient({ cwd });

  // Relu à chaque commande : /init peut créer le dépôt en cours de session.
  const resolvePaths = async (): Promise<ConfigPaths> => {
    const repoRoot = await getRepoRoot(silentGit);
    return { global: options.globalConfigPath, repo: repoRoot ? repoConfigPath(repoRoot) : undefined };
  };
  const readConfig = async (): Promise<Config> => {
    const paths = await resolvePaths();
    return loadConfig({ globalPath: paths.global, repoPath: paths.repo });
  };
  const web = createWebServer({ git: silentGit, commands, readConfig });

  const buildContext = (client: GitClient, config: Config, paths: ConfigPaths): CommandContext => ({
    git: client,
    config,
    ui,
    ai: createGeneratorFromConfig(config.ai, process.env),
    commands,
    web,
    paths,
    exit,
  });

  const runCommand = async (command: Command, args: string[]): Promise<void> => {
    const config = await resolveConfig(command, readConfig, ui);
    await command.run(buildContext(git, config, await resolvePaths()), args);
  };

  return {
    async execute(line) {
      const parsed = parseInput(line);
      if (!parsed) {
        ui.log("Les commandes commencent par /. Tape /help pour la liste.", "warn");
        return;
      }
      const command = findCommand(commands, parsed.name);
      if (!command) {
        ui.log(`Commande inconnue : /${parsed.name}. Tape /help pour la liste.`, "error");
        return;
      }
      try {
        await runCommand(command, parsed.args);
      } catch (error) {
        await reportError(error, ui, silentGit);
      }
    },
    suggest: (input) => suggestInput(commands, input, async () => buildContext(silentGit, await readConfig(), await resolvePaths())),
    readHeader: () => readHeaderState(silentGit),
  };
}

async function resolveConfig(command: Command, readConfig: () => Promise<Config>, ui: CommandUi): Promise<Config> {
  try {
    return await readConfig();
  } catch (error) {
    if (!(error instanceof ConfigError) || !command.allowsInvalidConfig) throw error;
    ui.log(error.message, "error");
    return DEFAULT_CONFIG;
  }
}

async function reportError(error: unknown, ui: CommandUi, silentGit: GitClient): Promise<void> {
  if (!(error instanceof GitPilotError)) {
    ui.log(`Erreur inattendue : ${error instanceof Error ? error.message : String(error)}`, "error");
    return;
  }
  ui.log(error.message, "error");
  if (error instanceof GitError) await reportRepoState(ui, silentGit);
}

async function reportRepoState(ui: CommandUi, silentGit: GitClient): Promise<void> {
  try {
    const state = await describeRepoState(silentGit);
    if (state) ui.log(`État du dépôt : ${state}`, "warn");
  } catch {
    ui.log("État du dépôt indisponible.", "warn");
  }
}

async function readHeaderState(silentGit: GitClient): Promise<HeaderState | undefined> {
  try {
    const status = await getStatus(silentGit, { listEachUntrackedFile: true });
    return { branch: describeBranch(status), changes: countChanges(status.files) };
  } catch {
    return undefined;
  }
}
