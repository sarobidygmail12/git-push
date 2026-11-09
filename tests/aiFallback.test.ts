import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFallbackMessage } from "../src/core/ai/fallback.js";
import { createCommitMessageGenerator, resolveProviderOrder } from "../src/core/ai/generator.js";
import { createGroqProvider } from "../src/core/ai/groq.js";
import { buildPrompt, sanitizeMessage } from "../src/core/ai/prompt.js";
import type { CommitMessageInput, CommitMessageProvider, ProviderName } from "../src/core/ai/provider.js";
import { DEFAULT_CONFIG } from "../src/core/config/schema.js";
import { ProviderError } from "../src/core/errors.js";

const SHORT_TIMEOUT_MS = 5;
const HTTP_TOO_MANY_REQUESTS = 429;
const FILE_COUNT_OVER_DETAIL_LIMIT = 12;

const INPUT: CommitMessageInput = {
  diff: "diff",
  diffTruncated: false,
  files: [{ path: "src/a.ts", status: "M" }],
  branch: "main",
  convention: "conventional",
  rejectedMessages: [],
};

const succeeding = (name: ProviderName, message: string): CommitMessageProvider => ({
  name,
  generate: () => Promise.resolve(message),
});

const failing = (name: ProviderName, error: Error): CommitMessageProvider => ({
  name,
  generate: () => Promise.reject(error),
});

const hanging = (name: ProviderName): CommitMessageProvider => ({
  name,
  generate: (_input, signal) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new ProviderError(name, "timeout")));
    }),
});

describe("chaîne de fallback des providers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("utilise le premier provider qui répond", async () => {
    const generator = createCommitMessageGenerator([succeeding("groq", "feat: a"), succeeding("gemini", "feat: b")]);
    expect(await generator.generate(INPUT)).toEqual({ message: "feat: a", provider: "groq", failures: [] });
  });

  it("passe au suivant et garde la trace des échecs", async () => {
    const generator = createCommitMessageGenerator([
      failing("groq", new ProviderError("groq", "quota")),
      failing("gemini", new ProviderError("gemini", "missing-key")),
      succeeding("fallback", "chore: c"),
    ]);
    const result = await generator.generate(INPUT);
    expect(result.provider).toBe("fallback");
    expect(result.failures.map((failure) => failure.reason)).toEqual(["quota", "missing-key"]);
  });

  it("abandonne un provider trop lent", async () => {
    const generator = createCommitMessageGenerator([hanging("ollama"), succeeding("fallback", "chore: c")], SHORT_TIMEOUT_MS);
    const result = await generator.generate(INPUT);
    expect(result.provider).toBe("fallback");
    expect(result.failures[0]?.reason).toBe("timeout");
  });

  it("continue aussi après une erreur non typée", async () => {
    const generator = createCommitMessageGenerator([failing("groq", new Error("boom")), succeeding("fallback", "chore: c")]);
    const result = await generator.generate(INPUT);
    expect(result.failures[0]).toBeInstanceOf(ProviderError);
  });

  it("considère une réponse vide comme un échec", async () => {
    const generator = createCommitMessageGenerator([succeeding("groq", "\n```\n"), succeeding("fallback", "chore: c")]);
    const result = await generator.generate(INPUT);
    expect(result.provider).toBe("fallback");
    expect(result.failures[0]?.reason).toBe("invalid-response");
  });

  it("met provider en tête, sans doublon, et termine toujours par fallback", () => {
    const ai = { ...DEFAULT_CONFIG.ai, provider: "gemini" as const, fallbackOrder: ["groq" as const, "gemini" as const] };
    expect(resolveProviderOrder(ai)).toEqual(["gemini", "groq", "fallback"]);
  });

  it("signale une clé absente sans appeler le réseau", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const provider = createGroqProvider(DEFAULT_CONFIG.ai.groq, {});
    await expect(provider.generate(INPUT, new AbortController().signal)).rejects.toMatchObject({ reason: "missing-key" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("traduit un HTTP 429 en dépassement de quota", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: HTTP_TOO_MANY_REQUESTS })));
    const provider = createGroqProvider(DEFAULT_CONFIG.ai.groq, { GROQ_API_KEY: "clé" });
    await expect(provider.generate(INPUT, new AbortController().signal)).rejects.toMatchObject({ reason: "quota" });
  });

  it("rejette une réponse au format inattendu", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ choices: [] })));
    const provider = createGroqProvider(DEFAULT_CONFIG.ai.groq, { GROQ_API_KEY: "clé" });
    await expect(provider.generate(INPUT, new AbortController().signal)).rejects.toMatchObject({ reason: "invalid-response" });
  });
});

describe("nettoyage et message sans IA", () => {
  it.each([
    ['"feat: a"', "feat: a"],
    ["<think>je réfléchis\nlongtemps</think>\nfeat: a", "feat: a"],
    ["```\nfeat: a\n```", "feat: a"],
    ["feat: a\n\nExplication inutile", "feat: a"],
    ["feat: a\n\n* src/a.ts : ajoute x\nVoilà le message\n- b.ts : retire y", "feat: a\n\n- src/a.ts : ajoute x\n- b.ts : retire y"],
    ['"feat: a\n\n- a.ts : ajoute x"', "feat: a\n\n- a.ts : ajoute x"],
  ])("nettoie %j", (raw, expected) => {
    expect(sanitizeMessage(raw)).toBe(expected);
  });

  const diffOf = (path: string, ...lines: string[]): string =>
    [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, ...lines].join("\n");

  it("décrit l'action réalisée dans chaque fichier, pas seulement son nom", () => {
    const diff = [
      diffOf("src/a.ts", "@@ -1,2 +1,3 @@ export function total() {", "-export function ancien() {", "+export function valider() {"),
      diffOf("src/b.ts", "@@ -1 +1,2 @@", "+une ligne"),
    ].join("\n");
    const files = [{ path: "src/a.ts", status: "M" }, { path: "src/b.ts", status: "M" }];

    expect(buildFallbackMessage({ ...INPUT, diff, files })).toBe(
      [
        "chore: update a and b",
        "",
        "- Update src/a.ts: add valider, remove ancien, update total",
        "- Update src/b.ts (+1 -0)",
      ].join("\n"),
    );
  });

  it("résume les fichiers touchés dans le titre et en limite le nombre", () => {
    const files = [
      { path: "src/neuf.ts", status: "A" },
      { path: "src/a.ts", status: "M" },
      { path: "src/b.ts", status: "M" },
      { path: "tests/c.test.ts", status: "M" },
    ];
    const [subject] = buildFallbackMessage({ ...INPUT, diff: "", files }).split("\n");
    expect(subject).toBe("chore: add neuf, update a, b and 1 more");
  });

  it("met une majuscule et aucun préfixe en convention libre", () => {
    const [subject] = buildFallbackMessage({ ...INPUT, convention: "free" }).split("\n");
    expect(subject).toBe("Update a");
  });

  it("garde un détail court sur un gros commit", () => {
    const files = Array.from({ length: FILE_COUNT_OVER_DETAIL_LIMIT }, (_unused, index) => ({ path: `src/f${index}.ts`, status: "M" }));
    const lines = buildFallbackMessage({ ...INPUT, diff: "", files }).split("\n");
    expect(lines.at(-1)).toBe("- and 2 more file(s)");
  });

  it("écrit en anglais dans le prompt, quelle que soit la langue du diff", () => {
    expect(buildPrompt(INPUT).system).toContain("Always write in English");
  });

  it("décrit créations, suppressions, renommages et contenus non analysés", () => {
    const files = [
      { path: "neuf.ts", status: "A" },
      { path: "vieux.ts", status: "D" },
      { path: "nouveau.ts", status: "R", originalPath: "ancien.ts" },
      { path: ".env", status: "M" },
    ];
    const details = buildFallbackMessage({ ...INPUT, diff: "", files }).split("\n").slice(1 + 1);
    expect(details).toEqual(["- Add neuf.ts", "- Remove vieux.ts", "- Rename ancien.ts to nouveau.ts", "- Update .env"]);
  });

  it("reconnaît la documentation", () => {
    const files = [{ path: "README.md", status: "A" }];
    expect(buildFallbackMessage({ ...INPUT, files })).toBe("docs: add README\n\n- Add README.md");
  });
});
