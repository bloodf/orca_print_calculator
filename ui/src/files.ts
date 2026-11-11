// "settings and quotes" in the current language: names of saved files for banners and toasts.
import { t } from "./i18n";

export function filesText(files: readonly string[]): string {
  const names = files.map((f) => t(f === "quotes" ? "nav.quotes" : "nav.settings").toLowerCase());
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} ${t("list.and")} ${names[names.length - 1]}` : (names[0] ?? "");
}
