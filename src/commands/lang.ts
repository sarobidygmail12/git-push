import { setConfigValue } from "../core/config/saveConfig.js";
import { getLanguage, isLanguage, LANGUAGE_NAMES, LANGUAGES, setLanguage, t, type Language } from "../lang/index.js";
import type { Command, CommandContext } from "./types.js";

export const langCommand: Command = {
  name: "lang",
  aliases: ["language"],
  get description() {
    return t("cmd.lang");
  },
  usage: "/lang [en|fr|zh|de]",
  examples: ["/lang", "/lang fr"],
  gitSteps: [],
  allowsInvalidConfig: true,
  completeArgs: () => Promise.resolve([...LANGUAGES]),
  run: async (ctx, [requested]) => {
    const language = requested ?? (await chooseLanguage(ctx));
    if (language === undefined) return;
    if (!isLanguage(language)) {
      ctx.ui.log(t("lang.unknown", { language, choices: LANGUAGES.join(", ") }), "warn");
      return;
    }
    await setConfigValue({ scope: "global", path: ctx.paths.global }, "language", JSON.stringify(language));
    setLanguage(language);
    ctx.ui.log(t("lang.changed", { language: LANGUAGE_NAMES[language] }), "success");
  },
};

function chooseLanguage(ctx: CommandContext): Promise<Language | undefined> {
  const choices = LANGUAGES.map((language) => ({ label: LANGUAGE_NAMES[language], value: language }));
  return ctx.ui.select(t("lang.select"), choices, { initial: getLanguage() });
}
