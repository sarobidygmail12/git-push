import { basename } from "node:path";
import { Box, Static, Text, useApp, useInput, useStdout } from "ink";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import type { HeaderState, ReplSession } from "../commands/session.js";
import type { CommandUi } from "../commands/types.js";
import { createCommandUi, type DisplayLevel, type PromptRequest, type UiBridge } from "./createCommandUi.js";
import { Header } from "./Header.js";
import { PromptInput } from "./PromptInput.js";
import { PromptView, Spinner } from "./Prompts.js";

const HEADER_REFRESH_MS = 1_000;
const CLEAR_SCREEN_AND_SCROLLBACK = "\u001B[2J\u001B[3J\u001B[H";

type LogEntry = { id: number; text: string; level: DisplayLevel };

type ExternalTask = { run: () => Promise<void>; resolve: () => void; reject: (reason: unknown) => void };

export type SessionFactory = (ui: CommandUi, onGitCommand: (line: string) => void, exit: () => void) => ReplSession;

type Props = { createSession: SessionFactory; cwd: string };

export function App({ createSession, cwd }: Props): ReactElement {
  const { exit } = useApp();
  const { write } = useStdout();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [clearCount, setClearCount] = useState(0);
  const [prompt, setPrompt] = useState<PromptRequest | undefined>(undefined);
  const [spinner, setSpinner] = useState<string | undefined>(undefined);
  const [isRunning, setIsRunning] = useState(false);
  const [header, setHeader] = useState<HeaderState | undefined>(undefined);
  const [history, setHistory] = useState<string[]>([]);
  const [externalTask, setExternalTask] = useState<ExternalTask | undefined>(undefined);
  const nextLogId = useRef(0);

  const appendLog = useCallback((text: string, level: DisplayLevel): void => {
    const id = nextLogId.current;
    nextLogId.current += 1;
    setLogs((entries) => [...entries, { id, text, level }]);
  }, []);

  const [session] = useState(() => {
    const bridge: UiBridge = {
      appendLog,
      showPrompt: setPrompt,
      setSpinner,
      clear: () => {
        setLogs([]);
        setClearCount((count) => count + 1);
        write(CLEAR_SCREEN_AND_SCROLLBACK);
      },
      runExternal: (run) =>
        new Promise<void>((resolve, reject) => {
          setExternalTask({ run, resolve, reject });
        }),
    };
    return createSession(createCommandUi(bridge), (line) => appendLog(`$ ${line}`, "git"), exit);
  });

  // Sur un gros dépôt, `git status` peut dépasser l'intervalle : les appels ne doivent pas s'empiler.
  const isRefreshingHeader = useRef(false);
  const refreshHeader = useCallback(async (): Promise<void> => {
    if (isRefreshingHeader.current) return;
    isRefreshingHeader.current = true;
    try {
      setHeader(await session.readHeader());
    } finally {
      isRefreshingHeader.current = false;
    }
  }, [session]);

  // Les effets de nettoyage ont déjà rendu le clavier : l'éditeur lancé ici a le terminal pour lui seul.
  useEffect(() => {
    if (!externalTask) return;
    const runTask = async (): Promise<void> => {
      try {
        await externalTask.run();
        externalTask.resolve();
      } catch (error) {
        externalTask.reject(error);
      } finally {
        setExternalTask(undefined);
      }
    };
    void runTask();
  }, [externalTask]);

  useEffect(() => {
    void refreshHeader();
    if (isRunning) return;
    const timer = setInterval(() => void refreshHeader(), HEADER_REFRESH_MS);
    return () => clearInterval(timer);
  }, [isRunning, refreshHeader]);

  // Garde le mode brut pendant les commandes, sinon les touches frappées s'affichent par-dessus l'interface.
  useInput(() => undefined, { isActive: !externalTask });

  const runLine = useCallback(
    async (line: string): Promise<void> => {
      const trimmed = line.trim();
      if (trimmed === "") return;
      setHistory((entries) => (entries.at(-1) === trimmed ? entries : [...entries, trimmed]));
      appendLog(`> ${trimmed}`, "info");
      setIsRunning(true);
      try {
        await session.execute(trimmed);
      } finally {
        setIsRunning(false);
      }
    },
    [appendLog, session],
  );

  const handleSubmit = useCallback((line: string): void => void runLine(line), [runLine]);
  const suggest = useCallback((input: string) => session.suggest(input), [session]);

  return (
    <>
      <Static key={clearCount} items={logs}>
        {(entry) => <LogLine key={entry.id} entry={entry} />}
      </Static>
      {externalTask ? null : (
        <Box flexDirection="column" marginTop={1}>
          <Header state={header} folder={basename(cwd)} />
          {spinner ? <Spinner label={spinner} /> : null}
          {prompt ? <PromptView key={prompt.question} request={prompt} /> : null}
          {!prompt && !isRunning ? <PromptInput history={history} suggest={suggest} onSubmit={handleSubmit} /> : null}
        </Box>
      )}
    </>
  );
}

const LEVEL_STYLES: Record<DisplayLevel, { color?: string; dimColor?: boolean }> = {
  info: {},
  success: { color: "green" },
  warn: { color: "yellow" },
  error: { color: "red" },
  git: { dimColor: true },
};

function LogLine({ entry }: { entry: LogEntry }): ReactElement {
  return <Text {...LEVEL_STYLES[entry.level]}>{entry.text}</Text>;
}
