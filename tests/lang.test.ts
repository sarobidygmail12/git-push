import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { langCommand } from "../src/commands/lang.js";
import { commands } from "../src/commands/registry.js";
import type { CommandContext } from "../src/commands/types.js";
import { DEFAULT_CONFIG } from "../src/core/config/schema.js";
import { getLanguage, LANGUAGES, messagesOf, setLanguage, t, translatePage } from "../src/lang/index.js";
import { createFakeContext, type FakeAnswers } from "./helpers/fakeContext.js";

const placeholdersOf = (text: string): string[] =>
  text
    .split("{")
    .slice(1)
    .map((part) => part.split("}")[0] ?? "")
    .sort();

describe("traductions", () => {
  afterEach(() => setLanguage("fr"));

  it("utilise l'anglais par défaut", () => {
    expect(DEFAULT_CONFIG.language).toBe("en");
  });

  it.each(LANGUAGES)("%s contient exactement les clés de l'anglais", (language) => {
    expect(Object.keys(messagesOf(language)).sort()).toEqual(Object.keys(messagesOf("en")).sort());
  });

  it.each(LANGUAGES)("%s n'a aucun texte vide", (language) => {
    expect(Object.values(messagesOf(language)).filter((text) => text.trim() === "")).toEqual([]);
  });

  it.each(LANGUAGES)("%s garde les mêmes paramètres que l'anglais", (language) => {
    const english = messagesOf("en");
    const different = Object.entries(messagesOf(language)).filter(
      ([key, text]) => placeholdersOf(text).join() !== placeholdersOf(english[key as keyof typeof english]).join(),
    );
    expect(different).toEqual([]);
  });

  it("remplace les paramètres dans la langue active", () => {
    setLanguage("de");
    expect(t("switch.on", { branch: "main" })).toBe("Auf main.");
    setLanguage("zh");
    expect(t("switch.on", { branch: "main" })).toBe("当前在 main。");
  });

  it("ne garde aucun marqueur dans une page traduite", () => {
    setLanguage("en");
    expect(translatePage('<html lang="{{web.htmlLang}}">{{web.theme}}</html>')).toBe('<html lang="en">Theme</html>');
  });

  it("garde les mêmes noms de commandes dans chaque langue, et traduit leur description", () => {
    const describeIn = (language: (typeof LANGUAGES)[number]): { names: string[]; descriptions: string[] } => {
      setLanguage(language);
      return { names: commands.map((command) => command.name), descriptions: commands.map((command) => command.description) };
    };
    const english = describeIn("en");
    const chinese = describeIn("zh");
    expect(chinese.names).toEqual(english.names);
    expect(chinese.descriptions).not.toEqual(english.descriptions);
  });
});

describe("/lang", () => {
  let directory: string;
  let globalPath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "git-push-lang-"));
    globalPath = join(directory, "config.json");
    writeFileSync(globalPath, "{}\n");
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    setLanguage("fr");
  });

  const contextWith = (answers: FakeAnswers): CommandContext => {
    const ctx = createFakeContext(directory, answers);
    ctx.paths = { global: globalPath, repo: undefined };
    return ctx;
  };
  const savedLanguage = (): unknown => (JSON.parse(readFileSync(globalPath, "utf8")) as { language?: unknown }).language;

  it("change la langue tout de suite et l'enregistre", async () => {
    await langCommand.run(contextWith({}), ["de"]);
    expect(getLanguage()).toBe("de");
    expect(savedLanguage()).toBe("de");
  });

  it("propose la liste sans argument", async () => {
    await langCommand.run(contextWith({ select: "zh" }), []);
    expect(getLanguage()).toBe("zh");
    expect(savedLanguage()).toBe("zh");
  });

  it("refuse une langue inconnue sans rien écrire", async () => {
    const ctx = contextWith({});
    await langCommand.run(ctx, ["klingon"]);
    expect(ctx.ui.log).toHaveBeenCalledWith(expect.stringContaining("klingon"), "warn");
    expect(savedLanguage()).toBeUndefined();
  });

  it("ne change rien si la liste est fermée", async () => {
    await langCommand.run(contextWith({ select: [] }), []);
    expect(savedLanguage()).toBeUndefined();
  });
});
