// Host Spoolman error codes -> copy (docs/ux.md §8.7). Unknown codes keep their text in {detail}.
import { t } from "../../i18n";

const HOST_SIDE = ["host_error", "no_host", "unknown_command", "bad_args"];
const KNOWN = ["scheme", "bad_url", "timeout", "unreachable", "bad_json", "denied", "redirected", "too_large"] as const;

export function spoolmanErrorMessage(code: string): string {
  const http = /^http_(\d{3})$/.exec(code);
  if (http) return t("spoolman.error.http", { status: http[1]! });
  if (HOST_SIDE.includes(code)) return t("spoolman.error.host"); // not about Spoolman: never show these codes raw
  return (KNOWN as readonly string[]).includes(code) ? t(`spoolman.error.${code}`) : t("spoolman.error.unknown", { detail: code });
}

/** Local check before any request: empty is fine (means "not set"). */
export function urlProblem(raw: string): "scheme" | "bad_url" | null {
  const v = raw.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) return "scheme";
  try {
    return new URL(v).host ? null : "bad_url";
  } catch {
    return "bad_url";
  }
}

export const urlHost = (raw: string): string => {
  try {
    return new URL(raw.trim()).host;
  } catch {
    return raw.trim();
  }
};
