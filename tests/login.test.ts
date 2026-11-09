import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loginCommand } from "../src/commands/login.js";
import type { CommandContext } from "../src/commands/types.js";
import { GitError } from "../src/core/errors.js";
import type { GitRunOptions } from "../src/core/git/gitClient.js";
import { createFakeContext, type FakeAnswers } from "./helpers/fakeContext.js";
import { createTempRepo, type TempRepo } from "./helpers/tempRepo.js";

const TOKEN = "glpat-Secret123";
const HTTPS_ORIGIN = "https://gitlab.com/acme/app.git";
const ISOLATED_VARIABLES = ["HOME", "XDG_CONFIG_HOME", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM"] as const;

describe("/login", () => {
  let repo: TempRepo;
  let home: string;
  let credentialsFile: string;
  let savedEnvironment: Record<string, string | undefined>;
  let verifyOptions: GitRunOptions | undefined;

  // Le HOME est remplacé : le test ne doit jamais écrire dans les vrais identifiants de la machine.
  beforeEach(() => {
    repo = createTempRepo();
    home = mkdtempSync(join(tmpdir(), "git-push-login-"));
    credentialsFile = join(home, "credentials");
    savedEnvironment = Object.fromEntries(ISOLATED_VARIABLES.map((name) => [name, process.env[name]]));
    process.env.HOME = home;
    process.env.XDG_CONFIG_HOME = join(home, "xdg");
    process.env.GIT_CONFIG_GLOBAL = join(home, ".gitconfig");
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    writeFileSync(join(home, ".gitconfig"), `[credential]\n\thelper = store --file ${credentialsFile}\n`);
    verifyOptions = undefined;
  });
  afterEach(() => {
    ISOLATED_VARIABLES.forEach((name) => {
      const value = savedEnvironment[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    });
    rmSync(home, { recursive: true, force: true });
    repo.cleanup();
  });

  const contextWithOrigin = (answers: FakeAnswers, originUrl: string, rejectToken = false): CommandContext => {
    const ctx = createFakeContext(repo.work, answers);
    const realRun = ctx.git.run.bind(ctx.git);
    vi.spyOn(ctx.git, "run").mockImplementation(async (args, options) => {
      const command = args.join(" ");
      if (command === "remote get-url origin") return { stdout: originUrl, stderr: "", exitCode: 0 };
      if (command !== "ls-remote origin HEAD") return realRun(args, options);
      verifyOptions = options;
      if (rejectToken) throw new GitError("fatal: Authentication failed", { args });
      return { stdout: "", stderr: "", exitCode: 0 };
    });
    return ctx;
  };

  const logsOf = (ctx: CommandContext): string[] => vi.mocked(ctx.ui.log).mock.calls.map(([message]) => message);

  it("vérifie le token sur origin puis le confie à Git", async () => {
    const ctx = contextWithOrigin({ ask: [TOKEN] }, HTTPS_ORIGIN);

    await loginCommand.run(ctx, []);

    const expectedHeader = `Authorization: Basic ${Buffer.from(`git-push:${TOKEN}`).toString("base64")}`;
    expect(verifyOptions?.env?.["GIT_CONFIG_KEY_0"]).toBe("http.https://gitlab.com/.extraHeader");
    expect(verifyOptions?.env?.["GIT_CONFIG_VALUE_0"]).toBe(expectedHeader);
    expect(readFileSync(credentialsFile, "utf8")).toContain(`git-push:${TOKEN}@gitlab.com`);
    expect(logsOf(ctx)).toEqual(["Connecté à gitlab.com."]);
  });

  it("n'enregistre pas un token refusé par le serveur", async () => {
    const ctx = contextWithOrigin({ ask: [TOKEN] }, HTTPS_ORIGIN, true);

    await expect(loginCommand.run(ctx, [])).rejects.toThrow("Authentication failed");
    expect(existsSync(credentialsFile)).toBe(false);
  });

  it("demande le serveur quand il n'y a pas de remote et accepte un serveur quelconque", async () => {
    repo.git("remote", "remove", "origin");
    const ctx = createFakeContext(repo.work, { ask: ["https://git.acme.io/", TOKEN] });

    await loginCommand.run(ctx, []);

    expect(readFileSync(credentialsFile, "utf8")).toContain(`git-push:${TOKEN}@git.acme.io`);
    expect(logsOf(ctx)).toEqual(["Token enregistré pour git.acme.io. Il sera vérifié à ton premier envoi."]);
  });

  it("prévient qu'un remote SSH n'utilise pas le token", async () => {
    const ctx = contextWithOrigin({ ask: [TOKEN] }, "git@gitlab.com:acme/app.git");

    await loginCommand.run(ctx, []);

    expect(verifyOptions).toBeUndefined();
    expect(logsOf(ctx).at(-1)).toContain("SSH");
  });

  it("configure un gestionnaire d'identifiants quand il n'y en a aucun", async () => {
    writeFileSync(join(home, ".gitconfig"), "");
    const ctx = contextWithOrigin({ ask: [TOKEN] }, HTTPS_ORIGIN);

    await loginCommand.run(ctx, []);

    expect(readFileSync(join(home, ".git-credentials"), "utf8")).toContain(TOKEN);
  });

  it.each([[[undefined]], [["  "]]])("n'enregistre rien si on annule (%j)", async (ask) => {
    const answers = { ask: ask as string[] };
    const ctx = contextWithOrigin(answers, HTTPS_ORIGIN);

    await loginCommand.run(ctx, []);

    expect(logsOf(ctx)).toEqual(["Connexion annulée, rien n'a été enregistré."]);
    expect(existsSync(credentialsFile)).toBe(false);
  });

  it("refuse un token qui ajouterait un champ au protocole de git credential", async () => {
    const ctx = contextWithOrigin({ ask: ["abc\nhost=evil.example"] }, HTTPS_ORIGIN);

    await expect(loginCommand.run(ctx, [])).rejects.toThrow("Valeur invalide");
    expect(existsSync(credentialsFile)).toBe(false);
  });

  it("n'affiche jamais le token", async () => {
    const ctx = contextWithOrigin({ ask: [TOKEN] }, HTTPS_ORIGIN);

    await loginCommand.run(ctx, []);

    expect(logsOf(ctx).join("\n")).not.toContain(TOKEN);
  });
});
