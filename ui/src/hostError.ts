// Host failure codes a user can act on get their own sentence after the generic one; every other code stays generic.
import { t } from "./i18n";

const ACTIONABLE = ["too_large", "io", "bad_name", "denied", "timeout", "unreadable"];
/** `action` matters for too_large: a save is fixed by deleting old quotes, an export is just too big. */
export function failText(generic: string, code: string, action: "save" | "export" = "save"): string {
  if (!ACTIONABLE.includes(code)) return generic;
  const key = code === "too_large" && action === "export" ? "too_large_export" : code;
  return `${generic} ${t(`host.error.${key}`)}`;
}
