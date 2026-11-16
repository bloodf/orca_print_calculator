// "settings and quotes" in the current language: names of saved files for banners and toasts.
import { currentLocale, t } from "./i18n";

export function filesText(files: readonly string[]): string {
  const keepCase = currentLocale() === "de"; // German nouns keep their capital mid-sentence
  const names = files.map((f) => t(f === "quotes" ? "nav.quotes" : "nav.settings")).map((n) => (keepCase ? n : n.toLowerCase()));
  return names.length ? names.reduce((a, b) => t("list.pair", { a, b })) : "";
}
