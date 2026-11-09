import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Command, WebServer } from "../commands/types.js";
import { describeConfigOptions, type Config } from "../core/config/schema.js";
import { GitPilotError } from "../core/errors.js";
import type { GitClient } from "../core/git/gitClient.js";
import { getCommitDetails, getLogPage, getRepoOverview, type LogQuery, type LogSearchField } from "../core/git/log.js";

const LOOPBACK_ADDRESS = "127.0.0.1";
const ALLOWED_HOSTNAMES = ["localhost", LOOPBACK_ADDRESS];
const PORT_ATTEMPTS = 10;
const SEARCH_FIELDS: readonly LogSearchField[] = ["message", "author", "hash"];
const CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_INTERNAL_ERROR = 500;

export type WebServerDependencies = {
  git: GitClient;
  commands: readonly Command[];
  readConfig: () => Promise<Config>;
};

type RouteResult = { status: number; contentType: string; body: string };
type Route = (url: URL) => Promise<RouteResult>;

export function createWebServer(dependencies: WebServerDependencies): WebServer {
  let startedUrl: string | undefined;
  return {
    async ensureStarted() {
      startedUrl ??= await start(dependencies);
      return startedUrl;
    },
  };
}

async function start(dependencies: WebServerDependencies): Promise<string> {
  const { web } = await dependencies.readConfig();
  const routes = createRoutes(dependencies);
  const server = createServer((request, response) => void handleRequest(routes, request, response));
  const port = await listenOnFirstFreePort(server, web.port, PORT_ATTEMPTS);
  server.unref();
  return `http://localhost:${port}`;
}

/** Deux gitpilot ouverts sur deux dépôts doivent chacun servir le leur. */
async function listenOnFirstFreePort(server: Server, port: number, attemptsLeft: number): Promise<number> {
  if (attemptsLeft === 0) throw new GitPilotError(`Aucun port libre à partir de ${port - PORT_ATTEMPTS}.`);
  try {
    await listen(server, port);
    return port;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EADDRINUSE") {
      return listenOnFirstFreePort(server, port + 1, attemptsLeft - 1);
    }
    throw error;
  }
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once("error", onError);
    server.listen(port, LOOPBACK_ADDRESS, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function createRoutes({ git, commands, readConfig }: WebServerDependencies): Map<string, Route> {
  return new Map<string, Route>([
    ["/", () => servePage("log.html")],
    ["/log", () => servePage("log.html")],
    ["/help", () => servePage("help.html")],
    ["/api/log", async (url) => jsonResult(await getLogPage(git, parseLogQuery(url)))],
    ["/api/repo", async () => jsonResult(await getRepoOverview(git))],
    ["/api/commit", async (url) => jsonResult(await getCommitDetails(git, url.searchParams.get("hash") ?? ""))],
    ["/api/help", async () => jsonResult(await buildHelpData(commands, readConfig))],
  ]);
}

async function handleRequest(routes: Map<string, Route>, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const result = await resolveRequest(routes, request);
  response.writeHead(result.status, {
    "content-type": result.contentType,
    "content-security-policy": CONTENT_SECURITY_POLICY,
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
  });
  response.end(result.body);
}

async function resolveRequest(routes: Map<string, Route>, request: IncomingMessage): Promise<RouteResult> {
  if (!isLocalHostHeader(request.headers.host)) return textResult(HTTP_FORBIDDEN, "Hôte refusé");
  if (request.method !== "GET") return textResult(HTTP_METHOD_NOT_ALLOWED, "Méthode refusée");
  const url = new URL(request.url ?? "/", "http://localhost");
  const route = routes.get(url.pathname);
  if (!route) return textResult(HTTP_NOT_FOUND, "Page introuvable");
  try {
    return await route(url);
  } catch (error) {
    return jsonResult({ error: error instanceof Error ? error.message : String(error) }, HTTP_INTERNAL_ERROR);
  }
}

/** Bloque le DNS rebinding : un site tiers ne peut pas lire l'historique via un domaine pointant sur 127.0.0.1. */
function isLocalHostHeader(host: string | undefined): boolean {
  return ALLOWED_HOSTNAMES.includes((host ?? "").split(":")[0] ?? "");
}

async function servePage(fileName: string): Promise<RouteResult> {
  const body = await readFile(new URL(`./pages/${fileName}`, import.meta.url), "utf8");
  return { status: HTTP_OK, contentType: "text/html; charset=utf-8", body };
}

function jsonResult(data: unknown, status: number = HTTP_OK): RouteResult {
  return { status, contentType: "application/json; charset=utf-8", body: JSON.stringify(data) };
}

function textResult(status: number, body: string): RouteResult {
  return { status, contentType: "text/plain; charset=utf-8", body };
}

export function parseLogQuery(url: URL): LogQuery {
  const page = Number(url.searchParams.get("page") ?? "0");
  const field = SEARCH_FIELDS.find((candidate) => candidate === url.searchParams.get("field")) ?? "message";
  return {
    page: Number.isInteger(page) && page >= 0 ? page : 0,
    search: url.searchParams.get("search")?.trim() ?? "",
    field,
    branch: url.searchParams.get("branch") ?? "",
  };
}

async function buildHelpData(commands: readonly Command[], readConfig: () => Promise<Config>): Promise<object> {
  return {
    commands: commands.map(({ name, aliases, usage, description, examples, gitSteps }) => ({
      name,
      aliases: aliases ?? [],
      usage,
      description,
      examples,
      gitSteps,
    })),
    configOptions: describeConfigOptions(),
    effectiveConfig: await readEffectiveConfig(readConfig),
  };
}

async function readEffectiveConfig(readConfig: () => Promise<Config>): Promise<Config | null> {
  try {
    return await readConfig();
  } catch {
    return null;
  }
}
