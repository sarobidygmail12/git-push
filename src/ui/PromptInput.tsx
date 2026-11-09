import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useEffect, useState, type ReactElement } from "react";
import { NO_SUGGESTIONS, type Suggestion, type SuggestionList } from "../commands/suggest.js";
import { CommandSuggestions } from "./CommandSuggestions.js";

type Props = {
  history: readonly string[];
  suggest: (input: string) => Promise<SuggestionList>;
  onSubmit: (line: string) => void;
};

export function PromptInput({ history, suggest, onSubmit }: Props): ReactElement {
  const [value, setValue] = useState("");
  // ink-text-input ne replace pas son curseur quand la valeur change de l'extérieur : on le remonte.
  const [inputRevision, setInputRevision] = useState(0);
  const [suggestions, setSuggestions] = useState<SuggestionList>(NO_SUGGESTIONS);
  const [selected, setSelected] = useState(0);
  const [hasNavigated, setHasNavigated] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number | undefined>(undefined);

  useEffect(() => {
    let isCurrent = true;
    const loadSuggestions = async (): Promise<void> => {
      const list = await suggest(value);
      if (isCurrent) setSuggestions(list);
    };
    void loadSuggestions();
    return () => {
      isCurrent = false;
    };
  }, [suggest, value]);

  const isOpen = !isDismissed && suggestions.items.length > 0;
  const count = suggestions.items.length;

  const resetSelection = (): void => {
    setSelected(0);
    setHasNavigated(false);
  };

  const replaceValue = (next: string): void => {
    setValue(next);
    setInputRevision((revision) => revision + 1);
    resetSelection();
  };

  const moveSelection = (delta: number): void => {
    setSelected((index) => (index + delta + count) % count);
    setHasNavigated(true);
  };

  const recallHistory = (nextIndex: number | undefined): void => {
    setHistoryIndex(nextIndex);
    setIsDismissed(true);
    replaceValue(nextIndex === undefined ? "" : (history[nextIndex] ?? ""));
  };

  const browseHistory = (delta: number): void => {
    if (history.length === 0) return;
    const current = historyIndex ?? history.length;
    const next = Math.max(0, current + delta);
    recallHistory(next >= history.length ? undefined : next);
  };

  const completeWith = (item: Suggestion | undefined): void => {
    if (item) replaceValue(item.completion);
  };

  useInput((_input, key) => {
    if (key.upArrow) isOpen ? moveSelection(-1) : browseHistory(-1);
    if (key.downArrow) isOpen ? moveSelection(1) : browseHistory(1);
    if (key.tab && isOpen) completeWith(suggestions.items[selected]);
    if (key.escape && isOpen) setIsDismissed(true);
  });

  const handleChange = (next: string): void => {
    setValue(next);
    setIsDismissed(false);
    setHistoryIndex(undefined);
    resetSelection();
  };

  const submit = (line: string): void => {
    replaceValue("");
    setHistoryIndex(undefined);
    onSubmit(line);
  };

  const handleSubmit = (typed: string): void => {
    const usesSelection = isOpen && (suggestions.kind === "command" || hasNavigated);
    const item = usesSelection ? suggestions.items[selected] : undefined;
    if (!item) return submit(typed);
    if (item.needsArgs) return completeWith(item);
    submit(item.completion);
  };

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="cyan">{"> "}</Text>
        <TextInput
          key={inputRevision}
          value={value}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder="Tape / pour voir les commandes"
        />
      </Box>
      {isOpen ? <CommandSuggestions items={suggestions.items} selected={selected} /> : null}
    </Box>
  );
}
