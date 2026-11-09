import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useEffect, useState, type ReactElement } from "react";
import type { PromptRequest } from "./createCommandUi.js";
import { t } from "../lang/index.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;
const YES_KEYS = ["o", "O", "y", "Y", "j", "J"];

export function PromptView({ request }: { request: PromptRequest }): ReactElement {
  if (request.kind === "ask") return <AskPrompt request={request} />;
  if (request.kind === "confirm") return <ConfirmPrompt request={request} />;
  return <SelectPrompt request={request} />;
}

function AskPrompt({ request }: { request: Extract<PromptRequest, { kind: "ask" }> }): ReactElement {
  const [value, setValue] = useState(request.initial);
  useInput((_input, key) => {
    if (key.escape) request.resolve(undefined);
  });
  return (
    <Box flexDirection="column">
      <Text bold>{request.question}</Text>
      <Box>
        <Text color="cyan">{"> "}</Text>
        <TextInput value={value} onChange={setValue} onSubmit={request.resolve} {...(request.secret ? { mask: "*" } : {})} />
      </Box>
      <Text dimColor>{t("ui.askHint")}</Text>
    </Box>
  );
}

function ConfirmPrompt({ request }: { request: Extract<PromptRequest, { kind: "confirm" }> }): ReactElement {
  useInput((input, key) => {
    if (YES_KEYS.includes(input)) request.resolve(true);
    else if (input !== "" || key.return || key.escape) request.resolve(false);
  });
  return (
    <Text>
      <Text bold>{request.question}</Text> <Text dimColor>{t("ui.confirmHint")}</Text>
    </Text>
  );
}

function SelectPrompt({ request }: { request: Extract<PromptRequest, { kind: "select" }> }): ReactElement {
  const [selected, setSelected] = useState(request.initialIndex);
  const count = request.labels.length;
  useInput((_input, key) => {
    if (key.upArrow) setSelected((index) => (index - 1 + count) % count);
    if (key.downArrow) setSelected((index) => (index + 1) % count);
    if (key.return) request.resolve(selected);
    if (key.escape) request.resolve(undefined);
  });
  return (
    <Box flexDirection="column">
      <Text bold>{request.question}</Text>
      {request.labels.map((label, index) => (
        <Text key={label} {...(index === selected ? { color: "cyan" } : {})}>
          {index === selected ? "❯ " : "  "}
          {label}
        </Text>
      ))}
    </Box>
  );
}

export function Spinner({ label }: { label: string }): ReactElement {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((current) => (current + 1) % SPINNER_FRAMES.length), SPINNER_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <Text color="cyan">
      {SPINNER_FRAMES[frame]} {label}
    </Text>
  );
}
