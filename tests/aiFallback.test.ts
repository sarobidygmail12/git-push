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

  it("utilise directement une clé placée dans apiKeyEnv", async () => {
    const fetchSpy = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(Response.json({ choices: [{ message: { content: "feat: a" } }] })),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const provider = createGroqProvider({ ...DEFAULT_CONFIG.ai.groq, apiKeyEnv: "gsk_AbCd123" }, {});

    await provider.generate(INPUT, new AbortController().signal);

    expect(fetchSpy.mock.calls[0]?.[1].headers).toMatchObject({ authorization: "Bearer gsk_AbCd123" });
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
    ["feat: a\n\nAdds a helper. It keeps the code simple.", "feat: a\n\nAdds a helper. It keeps the code simple."],
    ["feat: a\n\n* src/a.ts : ajoute x\n- b.ts : retire y", "feat: a\n\n- src/a.ts : ajoute x\n- b.ts : retire y"],
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
        "chore: update 2 files across a and b",
        "",
        "- Changes src/a.ts: it adds valider, removes ancien, updates total.",
        "- Edits src/b.ts, adding 1 line.",
      ].join("\n"),
    );
  });

  it("décrit les zones touchées dans le titre, sans liste de fichiers", () => {
    const files = [
      { path: "src/ai/neuf.ts", status: "A" },
      { path: "src/ai/a.ts", status: "M" },
      { path: "src/ui/b.ts", status: "M" },
      { path: "tests/c.test.ts", status: "M" },
    ];
    const [subject] = buildFallbackMessage({ ...INPUT, diff: "", files }).split("\n");
    expect(subject).toBe("chore: update 4 files across ai, ui and tests");
  });

  it("nomme le changement dans le titre quand un seul fichier est touché", () => {
    const diff = diffOf("src/a.ts", "@@ -1 +1,2 @@", "+export function valider() {");
    const [subject] = buildFallbackMessage({ ...INPUT, diff }).split("\n");
    expect(subject).toBe("chore: add valider in a.ts");
  });

  it("met une majuscule et aucun préfixe en convention libre", () => {
    const [subject] = buildFallbackMessage({ ...INPUT, convention: "free" }).split("\n");
    expect(subject).toBe("Update a.ts");
  });

  it("place d'abord les fichiers dont le changement est décrit", () => {
    const diff = diffOf("src/b.ts", "@@ -1 +1,2 @@", "+export function valider() {");
    const files = [{ path: "src/a.ts", status: "M" }, { path: "src/b.ts", status: "M" }];
    const details = buildFallbackMessage({ ...INPUT, diff, files }).split("\n").slice(1 + 1);
    expect(details).toEqual(["- Changes src/b.ts: it adds valider.", "- Updates src/a.ts."]);
  });

  it("garde un détail court sur un gros commit", () => {
    const files = Array.from({ length: FILE_COUNT_OVER_DETAIL_LIMIT }, (_unused, index) => ({ path: `src/f${index}.ts`, status: "M" }));
    const lines = buildFallbackMessage({ ...INPUT, diff: "", files }).split("\n");
    expect(lines.at(-1)).toBe("- Also touches 2 more files.");
  });

  it("écrit en anglais dans le prompt, quelle que soit la langue du diff", () => {
    expect(buildPrompt(INPUT).system).toContain("Always write in English");
  });

  it("demande un titre qui explique le commit, sans décompte de fichiers", () => {
    const { system } = buildPrompt(INPUT);
    expect(system).toContain("explains the purpose of this commit");
    expect(system).toContain("never contains a count or a list of files");
  });

  it("demande un paragraphe de phrases complètes, sans puces", () => {
    const { system } = buildPrompt(INPUT);
    expect(system).toContain("complete sentences");
    expect(system).toContain("Do not use bullets");
  });

  it("décrit créations, suppressions, renommages et contenus non analysés", () => {
    const files = [
      { path: "neuf.ts", status: "A" },
      { path: "vieux.ts", status: "D" },
      { path: "nouveau.ts", status: "R", originalPath: "ancien.ts" },
      { path: ".env", status: "M" },
    ];
    const details = buildFallbackMessage({ ...INPUT, diff: "", files }).split("\n").slice(1 + 1);
    expect(details).toEqual(["- Adds neuf.ts.", "- Removes vieux.ts.", "- Renames ancien.ts to nouveau.ts.", "- Updates .env."]);
  });

  it("reconnaît la documentation", () => {
    const files = [{ path: "README.md", status: "A" }];
    expect(buildFallbackMessage({ ...INPUT, files })).toBe("docs: add README.md\n\n- Adds README.md.");
  });
});
