import { basename } from "node:path";

const SENSITIVE_PREFIXES = [".env", "id_rsa"];
const SENSITIVE_SUFFIXES = [".pem", ".key"];

export function isSensitivePath(path: string): boolean {
  const name = basename(path);
  return SENSITIVE_PREFIXES.some((prefix) => name.startsWith(prefix))
    || SENSITIVE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}
