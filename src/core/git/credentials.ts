import { GitError } from "../errors.js";
import type { GitClient } from "./gitClient.js";
import { toRepositoryWebUrl } from "./pullRequest.js";
import { t } from "../../lang/index.js";

// GitHub et GitLab ignorent le nom d'utilisateur d'un token, mais Git exige qu'il y en ait un.
const TOKEN_USERNAME = "git-push";
const DEFAULT_CREDENTIAL_HELPER = "store";
const WHITESPACE = /\s/;

export type OriginRemote = { host: string; usesHttps: boolean };

export async function readOrigin(git: GitClient): Promise<OriginRemote | undefined> {
  const { stdout, exitCode } = await git.run(["remote", "get-url", "origin"], { allowFailure: true });
  const remoteUrl = stdout.trim();
  const webUrl = exitCode === 0 ? toRepositoryWebUrl(remoteUrl) : undefined;
  return webUrl ? { host: new URL(webUrl).host, usesHttps: remoteUrl.startsWith("https://") } : undefined;
}

/** Une ligne de plus dans ces valeurs ajouterait un champ au protocole de `git credential`. */
export function assertCredentialValue(value: string): void {
  if (value === "" || WHITESPACE.test(value)) throw new GitError(t("login.invalid"));
}

/**
 * Le token est envoyé d'emblée, par l'environnement pour rester hors de la liste des processus :
 * les identifiants enregistrés ne servent qu'après un refus du serveur, jamais sur un dépôt public.
 */
export async function verifyToken(git: GitClient, host: string, token: string): Promise<void> {
  const credentials = Buffer.from(`${TOKEN_USERNAME}:${token}`).toString("base64");
  await git.run(["ls-remote", "origin", "HEAD"], {
    env: {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `http.https://${host}/.extraHeader`,
      GIT_CONFIG_VALUE_0: `Authorization: Basic ${credentials}`,
    },
  });
}

/** Sans gestionnaire configuré, `git credential approve` réussit sans rien enregistrer. */
export async function ensureCredentialHelper(git: GitClient): Promise<boolean> {
  const { stdout } = await git.run(["config", "--get-all", "credential.helper"], { allowFailure: true });
  if (stdout.trim() !== "") return false;
  await git.run(["config", "--global", "credential.helper", DEFAULT_CREDENTIAL_HELPER]);
  return true;
}

export async function storeToken(git: GitClient, host: string, token: string): Promise<void> {
  const input = `protocol=https\nhost=${host}\nusername=${TOKEN_USERNAME}\npassword=${token}\n\n`;
  await git.run(["credential", "approve"], { input });
}
