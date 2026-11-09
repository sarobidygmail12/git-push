import { useEffect } from "react";

const APP_NAME = "🚀 Gitpilot";
const SAVE_TITLE = "\u001B[22;0t";
const RESTORE_TITLE = "\u001B[23;0t";

export function formatTerminalTitle(branch: string | undefined): string {
  return `\u001B]0;${branch ? `${APP_NAME} : ${branch}` : APP_NAME}\u0007`;
}

/** Écrit directement sur le flux : ces séquences sont invisibles et n'ont pas besoin d'un redessin d'Ink. */
function writeToTerminal(sequence: string): void {
  if (process.stdout.isTTY) process.stdout.write(sequence);
}

export function useTerminalTitle(branch: string | undefined): void {
  useEffect(() => {
    writeToTerminal(SAVE_TITLE);
    return () => writeToTerminal(RESTORE_TITLE);
  }, []);

  useEffect(() => {
    writeToTerminal(formatTerminalTitle(branch));
  }, [branch]);
}
