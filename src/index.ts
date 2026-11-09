import { render } from "ink";
import { createElement } from "react";
import { commands } from "./commands/registry.js";
import { createSession } from "./commands/session.js";
import { ensureGlobalConfig, globalConfigPath } from "./core/config/loadConfig.js";
import { createGitClient } from "./core/git/gitClient.js";
import { getRepoRoot } from "./core/git/status.js";
import { App, type SessionFactory } from "./ui/App.js";

async function main(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error("gitpilot doit être lancé dans un terminal interactif.");
    process.exitCode = 1;
    return;
  }
  const launchDirectory = process.cwd();
  const repoRoot = await getRepoRoot(createGitClient({ cwd: launchDirectory }));
  const cwd = repoRoot ?? launchDirectory;
  const configPath = globalConfigPath();
  await ensureGlobalConfig(configPath);

  const startSession: SessionFactory = (ui, onGitCommand, exit) =>
    createSession({ cwd, globalConfigPath: configPath, commands, ui, onGitCommand, exit });

  const app = render(createElement(App, { createSession: startSession, cwd }));
  await app.waitUntilExit();
}

await main();
