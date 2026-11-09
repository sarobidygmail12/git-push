# 🧭 gitpilot

<img width="788" height="532" alt="demo-commit-switch-branch" src="https://github.com/user-attachments/assets/89b715bd-0392-4691-9678-a2fcc50fdbd2" />

🇬🇧 English | [🇫🇷 Français](README.fr.md)

🌐 [Visit the landing page](https://claude.ai/artifact/X84wVTqr1GgwitrGVLjxmp)

Use Git with simple commands, right in your terminal.

You type `/commit`, gitpilot reads your changes, explains them in the commit message, and your work goes to GitHub. New to Git? This page is for you. 👋

> [!NOTE]
> gitpilot's screens are in English by default. Type `/lang` to switch to French, Chinese or German. Commands stay the same in every language.

## 🤔 Words to know

| Word | In plain English |
| --- | --- |
| **Repository** (repo) | Your project folder, tracked by Git |
| **Commit** | A save of your work, with a short message |
| **Branch** | A copy of the project where you can work without disturbing the rest. The main one is often called `main` |
| **Push** | Send your commits to GitHub |
| **Pull** | Bring what's new on GitHub to your computer |
| **Remote** | The online version of your project, on GitHub |
| **Conflict** | Two people changed the same line, and Git asks you which one to keep |

## 📥 Install

You need [Git](https://git-scm.com/downloads), [Node.js](https://nodejs.org) (version 22.12 or newer) and [Yarn](https://yarnpkg.com/getting-started/install).

**1. Install gitpilot** (Linux or macOS):

```bash
git clone https://github.com/sarobidygmail12/gitkraken-cli.git gitpilot
cd gitpilot
yarn install
yarn build
mkdir -p ~/.local/bin
ln -s "$PWD/bin/gitpilot.js" ~/.local/bin/gitpilot
```

**2. Tell Git who you are.** You only do this once:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

**3. Log in to GitHub.** Install [GitHub CLI](https://cli.github.com), then run this once and choose HTTPS:

```bash
gh auth login
```

gitpilot can't ask you for a password, so you need this step to send your work.

## 🎬 Your first project, step by step

**1. Create an empty repository** at <https://github.com/new>, then copy its address.

**2. Open your project** in the terminal and start gitpilot:

```bash
cd my-project
gitpilot
```

**3. Link your folder to GitHub.** Type `/init`, press Enter to keep the suggested folder, then paste the address you copied.

**4. Save and send your work.** Type `/commit`. If gitpilot says `main` is protected, answer yes. It then suggests a message: choose **Accept**.

That's it, your project is on GitHub! 🎉

> [!IMPORTANT]
> `/commit` takes all your changed files and sends them to GitHub right away.

From then on it's always the same: you work, then you type `/commit`.

## 🖥️ Reading the screen

```text
gitpilot my-project main (+3, -2, +3)
```

You see the project name, your branch, then your files not saved yet, updated every second:

- 🟢 `+3`: 3 files added
- 🔴 `-2`: 2 files deleted
- 🟠 `+3`: 3 files modified

The title of your terminal window also shows your branch, like `🚀 Gitpilot : main`.

The grey lines show the real Git commands run for you. Handy for learning! 👀

**On the keyboard:** type `/` to see the commands, use the arrows to choose, Tab to complete and Enter to confirm.

## ⭐ The essential commands

| Command | What it does |
| --- | --- |
| `/status` | Shows where you are |
| `/commit` | Saves your work and sends it to GitHub |
| `/pull` | Brings what's new from GitHub |
| `/push` | Sends your commits to GitHub |
| `/first-push` | Does your very first send when GitHub already has files |
| `/pr` | Creates a pull request, asking for its title and description |
| `/branch my-idea` | Creates a new branch and moves to it |
| `/switch main` | Moves to another branch |
| `/log` | Opens the project history in your browser |
| `/undo` | Cancels your last commit not sent yet, without losing your work |
| `/config` | Lists your settings and lets you change them |
| `/lang` | Changes the language |
| `/help` | Opens the help |
| `/exit` | Quits gitpilot |

## 🆘 When something goes wrong

**🚫 `rejected` or `fetch first` on your first send**

GitHub already has files, like a README or a LICENSE. Type `/first-push`.

**🚫 `rejected` later on**

GitHub has changes you don't have. Type `/pull`, then `/push`. If `/pull` refuses, run `git pull --rebase` in a normal terminal, then `/push`.

**🔐 Sending fails because of a password**

Run `gh auth login` in a normal terminal.

**⚔️ A conflict**

Open the file gitpilot names. You'll see this:

```text
<<<<<<< 
the text from one side
=======
the text from the other side
>>>>>>> 
```

Keep the right text, delete the `<<<<<<<`, `=======` and `>>>>>>>` lines, save, then choose **Continue**. Nervous? Choose **Cancel everything** and you're back where you started.

**😬 I made a mistake in my commit**

`/undo` only works if the commit isn't on GitHub yet. Since `/commit` sends right away, you can turn off automatic sending to give yourself time to check:

```text
/config set commit.autoPush false
```

You'll then send your work yourself with `/push`.

**🧭 The screen says `detached HEAD`**

You're not on any branch. Go back to the main one with `/switch main`.

**🗂️ The screen says `not a Git repository`**

You're not in a project tracked by Git. Go to the right folder, or type `/init`.

**❓ `gitpilot: command not found`**

Run these two commands, then open a new terminal:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

## 🛟 Don't panic

- gitpilot asks before saving on `main`.
- It warns you before including a secret file, like a `.env`.
- It blocks the Git commands that can erase your work.
- If something fails, it stops and shows the error.

## 🤖 Turn on AI (optional)

With AI, gitpilot reads your changes and writes a title that explains the commit, then a few sentences about what changed and why:

```text
fix(session): discard expired sessions when reading

The session read function now checks if a session's expiration time has passed. If it has, the entry is removed from the store and null is returned.
```

Without AI, gitpilot can only describe the files that changed. To turn on Groq, which is free:

1. Create a key at <https://console.groq.com/keys>.
2. Add this line to your `~/.bashrc`, then open a new terminal:

   ```bash
   export GROQ_API_KEY="your-key"
   ```

   Or type `/config`, open the `ai.groq.apiKeyEnv` line and paste your key there. It is then stored in `~/.gitpilot/config.json`, which only your account can read.

Commit messages are always in English, whatever language gitpilot is in. The suggestion screen shows `(groq)` when the AI wrote the message and `(fallback)` when it didn't.

> [!NOTE]
> Your changes are sent to Groq to write the message. The content of secret files (`.env*`, `*.pem`, `*.key`, `id_rsa*`) is never sent.

## 🌍 Change the language

gitpilot speaks English, French, Chinese and German. English is the default.

```text
/lang       opens the list of languages
/lang fr    French
/lang zh    Chinese
/lang de    German
/lang en    English
```

The change is immediate and saved for next time. The screens, answers and the `/help` and `/log` pages are translated. The commands stay the same (`/commit`, `/fix`…) and errors that come straight from Git stay as Git writes them.

---

## 🚀 Going further

You don't need this part to get started. Click a title to open it.

<details>
<summary>📚 All commands</summary>

| Command | Alias | Purpose |
| --- | --- | --- |
| `/init` | | Creates a Git repository in the chosen folder (current folder by default) and links it to the given remote |
| `/commit ["message"]` | `/cm` | Stages, generates the message, commits, pushes |
| `/amend ["message"]` | | Changes the last unpushed commit |
| `/undo` | | Cancels the last unpushed commit, keeps its changes |
| `/status` | `/s` | Repository status |
| `/diff` | | Summary of changes |
| `/log` | | Commit graph in the browser: author and branch of each commit, current branch, file details |
| `/switch <branch>` | `/sw` | Changes branch, with autocomplete |
| `/branch <name>` | | Creates a branch and moves to it |
| `/hotfix [name]` | | Commits current work, creates `hotfix/<name>` from develop |
| `/fix [name]` | | Commits current work, creates `fix/<name>` from preprod |
| `/cherry-pick <hash...>` | `/cp` | Applies commits, with guided conflict resolution |
| `/rebase [develop\|preprod]` | `/rb` | Rebases on the latest remote version, with guided conflict resolution |
| `/pull` | | `git pull --ff-only` |
| `/push` | | Pushes, sets the upstream if needed, shows the link to the open pull request if there is one |
| `/first-push` | `/fp` | First publish: brings in the commits already on the remote, then pushes and sets the upstream. Never force-pushes |
| `/pr` | `/pull-request` | Asks for the title and description, pushes the branch if needed, then creates the pull request against the default branch. Requires a logged-in `gh` |
| `/fetch` | | `git fetch --all` |
| `/stash [pop\|list]` | | Sets aside, restores or lists |
| `/config [show\|set\|edit] [--repo]` | | Lists the options and lets you edit them |
| `/lang [en\|fr\|zh\|de]` | `/language` | Changes the language of the screens and answers (English by default) |
| `/help` | `/h` | Lists commands, opens the detailed help |
| `/clear` | | Clears the screen |
| `/exit` | `/quit` | Quits |

</details>

<details>
<summary>⚙️ Configuration</summary>

The global file `~/.gitpilot/config.json` is created on first launch. A `.gitpilot.json` at the root of a repository can override part of it.

So that a cloned repository can't hijack your diffs, `apiKeyEnv` and `baseUrl` are only accepted in the global file.

```text
/config                                 lists the options: Enter edits the selected one
/config show                            shows the effective configuration as JSON
/config set commit.autoPush false       changes the global file
/config set --repo branches.develop dev changes .gitpilot.json
/config edit                            opens the file in $VISUAL or $EDITOR
```

The `ignore` option is a list of files Git should ignore, in `.gitignore` syntax, with no `.gitignore` to write: `["dist/","*.log"]`. Edit it from `/config`. gitpilot applies it through `.git/info/exclude`. Like `.gitignore`, it has no effect on a file Git already tracks.

`/fix` starts from `branches.preprod` and `/hotfix` from `branches.develop`. If that branch doesn't exist locally, gitpilot asks which one to use and saves your answer in `.gitpilot.json`, which stays out of Git through `.git/info/exclude`.

The `/help` page documents every option.

</details>

<details>
<summary>🤖 Other AI services</summary>

gitpilot tries `ai.provider`, then the providers in `ai.fallbackOrder`. It moves to the next one after 15 seconds, or if the quota is exceeded or the key is missing. The last resort, `fallback`, describes the changed files without AI, so **Regenerate** gives the same message.

**Gemini (free tier).** Create a key at <https://aistudio.google.com/apikey>, then add to your `~/.bashrc`: `export GEMINI_API_KEY="..."`

**Ollama (local).** Run `ollama pull qwen2.5-coder`. The server must be running on `http://localhost:11434`. With Ollama, your diff never leaves your machine.

The provider receives the list of files and the staged diff, truncated to 12,000 characters. For `.env*`, `*.pem`, `*.key` and `id_rsa*` files, only the name is sent.

`apiKeyEnv` holds the name of an environment variable, which keeps the key out of the file, or the key itself. A key written there stays in plain text in `~/.gitpilot/config.json` and is masked wherever gitpilot shows the configuration.

Default models change quickly. If a provider answers `HTTP 404`, change its model: `/config set ai.groq.model <model>`.

</details>

<details>
<summary>🛟 All the safety checks</summary>

- The Git client blocks `push --force`, `reset --hard` and `clean` unless a call has explicitly confirmed.
- `main` and `preprod` are protected by default: gitpilot asks for confirmation before committing to them.
- `/switch` won't change branch with work in progress without offering to commit it or set it aside.
- `/hotfix` and `/fix` check the name and the base before committing anything.
- If `develop` has diverged from its remote, `/hotfix` saves the local commits in `backup/<branch>-<hash>`, then aligns `develop` with the remote. `/fix` stops in that case.
- If a step fails, the flow stops and shows the raw Git error and the repository state.
- The web server only listens on `127.0.0.1` and refuses requests whose `Host` header isn't local.
- `~/.gitpilot/config.json` can hold an API key: only your account can read it, and gitpilot masks the key wherever it shows the configuration.

</details>

<details>
<summary>🛠️ Add a command</summary>

1. Create `src/commands/myCommand.ts`:

   ```ts
   import { t } from "../lang/index.js";
   import type { Command } from "./types.js";

   export const myCommand: Command = {
     name: "my-command",
     aliases: ["mc"],
     get description() {
       return t("cmd.myCommand");
     },
     usage: "/my-command <argument>",
     examples: ["/my-command value"],
     gitSteps: ["git rev-parse HEAD"],
     run: async (ctx, [argument]) => {
       const { stdout } = await ctx.git.run(["rev-parse", "HEAD"]);
       ctx.ui.log(`${argument}: ${stdout}`, "success");
     },
   };
   ```

2. Add `"cmd.myCommand"` to each file in `src/lang/`.
3. Add it to the array in `src/commands/registry.ts`.

The autocomplete and the `/help` page update themselves. A `<` in `usage` marks a required argument: Enter then completes the command instead of running it.

</details>

<details>
<summary>🌍 Translations</summary>

Every text lives in `src/lang/`, with one file per language: `en.json`, `fr.json`, `zh.json` and `de.json`. To change a text, edit the file of that language. `{name}` marks a value filled in by gitpilot, so keep it as it is.

Each language must have the same keys and the same `{values}` as `en.json`, otherwise `yarn test` fails.

To add a language:

1. Copy `src/lang/en.json` to `src/lang/<code>.json` and translate it.
2. In `src/lang/index.ts`, import the file and add the code to `LANGUAGES`, `LANGUAGE_NAMES` and `MESSAGES`.

</details>

<details>
<summary>🧑‍💻 Development and dependencies</summary>

```bash
yarn build       # compiles to dist/ and copies the web pages
yarn typecheck   # also checks the tests
yarn test        # runs vitest
```

Most tests check the French messages: `tests/helpers/frenchLocale.ts` sets that language for them, and `tests/lang.test.ts` covers the others.

The required stack: `ink`, `ink-text-input`, `execa`, `open`, `zod`, and `vitest` for tests. On top of that:

- `react`, required by `ink`.
- `vite`, required by `vitest`, which Yarn doesn't install automatically.
- `typescript`, `@types/node` and `@types/react`, for compiling and types, in development only.

TypeScript stays on version 6, because Yarn 4.10 applies a patch to it that fails on version 7.

</details>
