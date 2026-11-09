import { Box, Text } from "ink";
import type { ReactElement } from "react";
import type { Suggestion } from "../commands/suggest.js";

const VISIBLE_SUGGESTIONS = 8;
const LABEL_COLUMN_WIDTH = 26;

type Props = { items: readonly Suggestion[]; selected: number };

export function CommandSuggestions({ items, selected }: Props): ReactElement {
  const firstVisible = Math.max(0, Math.min(selected - VISIBLE_SUGGESTIONS + 1, items.length - VISIBLE_SUGGESTIONS));
  const visibleItems = items.slice(firstVisible, firstVisible + VISIBLE_SUGGESTIONS);
  return (
    <Box flexDirection="column" paddingLeft={1}>
      {visibleItems.map((item, offset) => {
        const isSelected = firstVisible + offset === selected;
        return (
          <Box key={item.completion}>
            <Box width={LABEL_COLUMN_WIDTH}>
              <Text wrap="truncate" {...(isSelected ? { color: "cyan", bold: true } : {})}>
                {item.label}
              </Text>
            </Box>
            <Text wrap="truncate" dimColor>
              {item.description}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
