import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands } from "../src/commands/registry.js";
import { createSession, type ReplSession } from "../src/commands/session.js";
import { validateConfig } from "../src/core/config/loadConfig.js";
import { DEFAULT_CONFIG } from "../src/core/config/schema.js";
import { ConfigError } from "../src/core/errors.js";
import { createGitClient } from "../src/core/git/gitClient.js";
import { addLocalExclude, syncIgnoredPatterns } from "../src/core/git/localExclude.js";
import { commitFlow } from "../src/commands/shared/commitFlow.js";
import { createFakeContext, createFakeUi } from "./helpers/fakeContext.js";
import { createTempRepo, type TempRepo } from "./helpers/tempRepo.js";

describe("option ignore", () => {
  let repo: TempRepo;

  beforeEach(() => {
    repo = createTempRepo();
  });
  afterEach(() => repo.cleanup());

  const sync = (patterns: string[]): Promise<void> => syncIgnoredPatterns(createGitClient({ cwd: repo.work }), patterns);
  const excludeFile = (): string => readFileSync(join(repo.work, ".git", "info", "exclude"), "utf8");
  const untracked = (): string => repo.git("status", "--porcelain");

  it("masque à Git les fichiers listés, sans créer de .gitignore", async () => {
    repo.write("build.log", "x\n");
    repo.write("garde.txt", "x\n");
    await sync(["*.log"]);

    expect(untracked()).not.toContain("build.log");
    expect(untracked()).toContain("garde.txt");
    expect(untracked()).not.toContain(".gitignore");
  });

  it("ne committe pas un fichier ignoré", async () => {
    repo.git("switch", "--quiet", "-c", "feature/ignore");
    repo.write("build.log", "x\n");
    repo.write("garde.txt", "x\n");
    await sync(["*.log"]);

    await commitFlow(createFakeContext(repo.work, { select: "accept" }));

    const committed = repo.git("show", "--name-only", "--format=", "HEAD");
    expect(committed).toContain("garde.txt");
    expect(committed).not.toContain("build.log");
  });

  it("remplace les motifs quand la liste change", async () => {
    repo.write("build.log", "x\n");
    await sync(["*.log"]);
    await sync(["dist/"]);

    expect(excludeFile()).toContain("dist/");
    expect(excludeFile()).not.toContain("*.log");
    expect(untracked()).toContain("build.log");
  });

  it("retire le bloc quand la liste est vide et garde les autres lignes", async () => {
    await addLocalExclude(createGitClient({ cwd: repo.work }), "/.gitpilot.json");
    await sync(["*.log"]);
    await sync([]);

    expect(excludeFile()).toContain("/.gitpilot.json");
    expect(excludeFile()).not.toContain("gitpilot : option ignore");
  });

  it("ne duplique pas le bloc quand la liste ne change pas", async () => {
    await sync(["*.log"]);
    const first = excludeFile();
    await sync(["*.log"]);
    expect(excludeFile()).toBe(first);
  });

  it("refuse un motif sur plusieurs lignes", () => {
    expect(() => validateConfig({ ...DEFAULT_CONFIG, ignore: ["a\n!b"] }, "config.json")).toThrow(ConfigError);
  });

  describe("dans une session", () => {
    const startSession = (): ReplSession => {
      const globalConfigPath = join(repo.root, "config.json");
      writeFileSync(globalConfigPath, "{}\n");
      return createSession({
        cwd: repo.work,
        globalConfigPath,
        commands,
        ui: createFakeUi({}),
        onGitCommand: () => undefined,
        exit: () => undefined,
      });
    };

    it("applique /config set dès la fin de la commande, puis retire le motif", async () => {
      repo.write("build.log", "x\n");
      const session = startSession();

      await session.execute('/config set ignore ["*.log", "dist/"]');
      expect(untracked()).not.toContain("build.log");
      expect(excludeFile()).toContain("dist/");

      await session.execute("/config set ignore []");
      expect(untracked()).toContain("build.log");
    });
  });
});
