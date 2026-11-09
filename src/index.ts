import { render } from "ink";
import { createElement } from "react";
import { commands } from "./commands/registry.js";
import { createSession } from "./commands/session.js";
import { ensureGlobalConfig, globalConfigPath, loadConfig } from "./core/config/loadConfig.js";
import { ConfigError } from "./core/errors.js";
import { setLanguage, t } from "./lang/index.js";
import { createGitClient } from "./core/git/gitClient.js";
import { getRepoRoot } from "./core/git/status.js";
import { App, type SessionFactory } from "./ui/App.js";

async function main(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error(t("app.needsTerminal"));
    process.exitCode = 1;
    return;
  }
  const launchDirectory = process.cwd();
  const repoRoot = await getRepoRoot(createGitClient({ cwd: launchDirectory }));
  const cwd = repoRoot ?? launchDirectory;
  const configPath = globalConfigPath();
  await ensureGlobalConfig(configPath);
  await applySavedLanguage(configPath);

  const startSession: SessionFactory = (ui, onGitCommand, exit) =>
    createSession({ cwd, globalConfigPath: configPath, commands, ui, onGitCommand, exit });

  const app = render(createElement(App, { createSession: startSession, cwd }));
  await app.waitUntilExit();
}

/** Avant le premier rendu : l'en-tête doit déjà être dans la bonne langue. Une config invalide est signalée par la session. */
async function applySavedLanguage(configPath: string): Promise<void> {
  try {
    setLanguage((await loadConfig({ globalPath: configPath })).language);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
  }
}

await main();
