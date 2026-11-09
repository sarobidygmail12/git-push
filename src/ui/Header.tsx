import { Box, Text } from "ink";
import type { ReactElement } from "react";
import type { HeaderState } from "../commands/session.js";
import { t } from "../lang/index.js";

const ORANGE = "#ffa500";

export function Header({ state, folder }: { state: HeaderState | undefined; folder: string }): ReactElement {
  return (
    <Box columnGap={1}>
      <Text bold color="cyan">
        gitpilot
      </Text>
      <Text dimColor>{folder}</Text>
      {state ? <RepoSummary state={state} /> : <Text color="yellow">{t("ui.notRepo")}</Text>}
    </Box>
  );
}

function RepoSummary({ state: { branch, changes } }: { state: HeaderState }): ReactElement {
  return (
    <>
      <Text bold>{branch}</Text>
      <Text>
        (<Text color="green">+{changes.added}</Text>, <Text color="red">-{changes.deleted}</Text>,{" "}
        <Text color={ORANGE}>+{changes.modified}</Text>)
      </Text>
    </>
  );
}
