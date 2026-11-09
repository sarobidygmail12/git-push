import de from "./de.json" with { type: "json" };
import en from "./en.json" with { type: "json" };
import fr from "./fr.json" with { type: "json" };
import zh from "./zh.json" with { type: "json" };

export const LANGUAGES = ["en", "fr", "zh", "de"] as const;

export type Language = (typeof LANGUAGES)[number];
export type MessageKey = keyof typeof en;

export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", fr: "Français", zh: "中文", de: "Deutsch" };

const MESSAGES: Record<Language, Record<MessageKey, string>> = { en, fr, zh, de };
const MESSAGE_KEYS = new Set<string>(Object.keys(en));
const WEB_KEY_PREFIX = "web.";

let currentLanguage: Language = "en";

export function setLanguage(language: Language): void {
  currentLanguage = language;
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function isLanguage(value: string): value is Language {
  return LANGUAGES.some((language) => language === value);
}

export function isMessageKey(value: string): value is MessageKey {
  return MESSAGE_KEYS.has(value);
}

export function messagesOf(language: Language): Readonly<Record<MessageKey, string>> {
  return MESSAGES[language];
}

/** Traduit une clé et remplace ses `{paramètres}`. */
export function t(key: MessageKey, params: Readonly<Record<string, string | number>> = {}): string {
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, () => String(value)),
    MESSAGES[currentLanguage][key],
  );
}

/** Remplace les `{{web.clé}}` d'une page servie par le serveur local. */
export function translatePage(html: string): string {
  return Object.entries(MESSAGES[currentLanguage])
    .filter(([key]) => key.startsWith(WEB_KEY_PREFIX))
    .reduce((page, [key, text]) => page.replaceAll(`{{${key}}}`, () => text), html);
}
