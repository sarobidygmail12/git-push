import { describe, expect, it } from "vitest";
import { parseInput, tokenize } from "../src/commands/parseInput.js";
import { commands } from "../src/commands/registry.js";
import { findCommand, suggestCommands } from "../src/commands/suggest.js";

describe("saisie", () => {
  it("garde les guillemets comme un seul argument", () => {
    expect(parseInput('/commit "mon message"')).toEqual({ name: "commit", args: ["mon message"] });
  });

  it("ne traite pas l'apostrophe comme un guillemet", () => {
    expect(tokenize("l'ajout d'un test")).toEqual(["l'ajout", "d'un", "test"]);
  });

  it("ignore ce qui ne commence pas par /", () => {
    expect(parseInput("commit")).toBeUndefined();
  });
});

describe("registre et suggestions", () => {
  const labels = (query: string): string[] => suggestCommands(commands, query).items.map((item) => item.label);

  it("n'a ni nom ni alias en double", () => {
    const names = commands.flatMap((command) => [command.name, ...(command.aliases ?? [])]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("filtre sur le préfixe", () => {
    expect(labels("cl")).toEqual(["/clear"]);
    expect(labels("c")).toEqual(expect.arrayContaining(["/commit (/cm)", "/cherry-pick (/cp)", "/config", "/clear"]));
    expect(labels("zzz")).toEqual([]);
  });

  it("place un alias exact en premier", () => {
    expect(labels("s")[0]).toBe("/status (/s)");
  });

  it("trouve une commande par son alias", () => {
    expect(findCommand(commands, "cm")?.name).toBe("commit");
  });

  it("complète au lieu d'exécuter quand un argument est obligatoire", () => {
    expect(suggestCommands(commands, "switch").items[0]?.needsArgs).toBe(true);
    expect(suggestCommands(commands, "status").items[0]?.needsArgs).toBe(false);
  });

  it("documente chaque commande pour /help", () => {
    commands.forEach((command) => {
      expect(command.description).not.toBe("");
      expect(command.usage.startsWith(`/${command.name}`)).toBe(true);
      expect(command.examples.length).toBeGreaterThan(0);
    });
  });
});
