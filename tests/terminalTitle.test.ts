import { describe, expect, it } from "vitest";
import { formatTerminalTitle } from "../src/ui/useTerminalTitle.js";

describe("titre du terminal", () => {
  it("affiche le nom de la branche", () => {
    expect(formatTerminalTitle("main")).toBe("\u001B]0;🚀 Git-push : main\u0007");
  });

  it("n'affiche que le nom de l'application hors d'un dépôt", () => {
    expect(formatTerminalTitle(undefined)).toBe("\u001B]0;🚀 Git-push\u0007");
  });
});
