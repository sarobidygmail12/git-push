import { amendCommand } from "./amend.js";
import { branchCommand } from "./branch.js";
import { cherryPickCommand } from "./cherryPick.js";
import { clearCommand } from "./clear.js";
import { commitCommand } from "./commit.js";
import { configCommand } from "./config.js";
import { deleteBranchCommand } from "./deleteBranch.js";
import { langCommand } from "./lang.js";
import { diffCommand } from "./diff.js";
import { exitCommand } from "./exit.js";
import { fetchCommand } from "./fetch.js";
import { firstPushCommand } from "./firstPush.js";
import { fixCommand } from "./fix.js";
import { helpCommand } from "./help.js";
import { hotfixCommand } from "./hotfix.js";
import { initCommand } from "./init.js";
import { logCommand } from "./log.js";
import { loginCommand } from "./login.js";
import { pullCommand } from "./pull.js";
import { pullRequestCommand } from "./pullRequest.js";
import { pushCommand } from "./push.js";
import { rebaseCommand } from "./rebase.js";
import { stashCommand } from "./stash.js";
import { statusCommand } from "./status.js";
import { switchCommand } from "./switch.js";
import { undoCommand } from "./undo.js";
import type { Command } from "./types.js";

export const commands: readonly Command[] = [
  initCommand,
  loginCommand,
  commitCommand,
  amendCommand,
  undoCommand,
  statusCommand,
  diffCommand,
  logCommand,
  switchCommand,
  branchCommand,
  deleteBranchCommand,
  hotfixCommand,
  fixCommand,
  cherryPickCommand,
  rebaseCommand,
  pullCommand,
  pushCommand,
  firstPushCommand,
  pullRequestCommand,
  fetchCommand,
  stashCommand,
  configCommand,
  langCommand,
  helpCommand,
  clearCommand,
  exitCommand,
];
