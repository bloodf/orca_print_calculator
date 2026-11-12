// t(key, params) over flat en / pt-BR dictionaries (docs/ux.md §8). Reactive on `lang`.
// Plurals: when params.n is a number and `${key}_one` / `${key}_other` exist, Intl.PluralRules picks one.
// Missing in pt-BR falls back to en; missing in en renders the key (warns once in dev).
import { reactive } from "vue";
import { column } from "./i18n/messages";

const en = column(0);

export type Lang = "auto" | "en" | "pt-BR";
export type Locale = "en" | "pt-BR";
export type Params = Record<string, string | number>;

const dicts: Record<Locale, Record<string, string>> = { en, "pt-BR": column(1) };
const state = reactive({ locale: "en" as Locale });
const warned = new Set<string>();

/** saved setting -> host locale -> en. */
export function resolveLocale(pref: Lang | null | undefined, hostLocale?: string): Locale {
  if (pref === "en" || pref === "pt-BR") return pref;
  return (hostLocale ?? "").toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}

export function hostLocale(): string {
  return typeof navigator === "undefined" ? "en" : navigator.language || "en";
}

export function setLocale(pref: Lang | null | undefined, appLanguage?: string | null): Locale {
  const language = typeof appLanguage === "string" ? appLanguage.trim() : "";
  state.locale = resolveLocale(pref, language || hostLocale());
  if (typeof document !== "undefined") document.documentElement.lang = state.locale === "pt-BR" ? "pt-BR" : "en";
  return state.locale;
}

export const currentLocale = (): Locale => state.locale;
/** BCP 47 tag for Intl formatting. */
export const intlLocale = (): string => (state.locale === "pt-BR" ? "pt-BR" : "en-US");

const fill = (s: string, params?: Params): string =>
  params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;

function pick(key: string, params: Params | undefined, dict: Record<string, string>): string | undefined {
  const n = params?.n;
  if (typeof n === "number" && `${key}_other` in dict) {
    const form = new Intl.PluralRules(intlLocale()).select(n) === "one" ? "one" : "other";
    return dict[`${key}_${form}`] ?? dict[`${key}_other`];
  }
  return dict[key];
}

export function t(key: string, params?: Params): string {
  const hit = pick(key, params, dicts[state.locale]) ?? pick(key, params, en);
  if (hit === undefined) {
    if (import.meta.env?.DEV && !warned.has(key)) {
      warned.add(key);
      console.warn(`i18n: missing key ${key}`);
    }
    return key;
  }
  return fill(hit, params);
}
