// t(key, params) over flat dictionaries, one per language (docs/ux.md §8). Reactive on `lang`.
// Plurals: when params.n is a number and `${key}_one` / `${key}_other` exist, Intl.PluralRules picks one.
// A key missing in a language falls back to en; missing in en renders the key (warns once in dev).
import { reactive } from "vue";
import { de } from "./i18n/de";
import { es } from "./i18n/es";
import { column } from "./i18n/messages";
import { zhCN } from "./i18n/zh-CN";

const en = column(0);

export const LOCALES = ["en", "pt-BR", "es", "de", "zh-CN"] as const;
export type Locale = (typeof LOCALES)[number];
export type Lang = "auto" | Locale;
export type Params = Record<string, string | number>;

const dicts: Record<Locale, Record<string, string>> = { en, "pt-BR": column(1), es, de, "zh-CN": zhCN };
/** BCP 47 tag each language formats numbers, money and dates with. */
const INTL: Record<Locale, string> = { en: "en-US", "pt-BR": "pt-BR", es: "es", de: "de-DE", "zh-CN": "zh-CN" };
/** Language part of an OrcaSlicer code ("zh_CN", "pt_BR", "de") or a browser tag ("es-MX"). Traditional Chinese reads the Simplified text. */
const BY_LANGUAGE = new Map<string, Locale>([["pt", "pt-BR"], ["es", "es"], ["de", "de"], ["zh", "zh-CN"]]);
const state = reactive({ locale: "en" as Locale });
const warned = new Set<string>();

export const isLocale = (v: unknown): v is Locale => (LOCALES as readonly unknown[]).includes(v);

/** saved setting -> host locale -> en. */
export function resolveLocale(pref: Lang | null | undefined, hostLocale?: string): Locale {
  if (isLocale(pref)) return pref;
  return BY_LANGUAGE.get((hostLocale ?? "").trim().toLowerCase().split(/[-_]/)[0]!) ?? "en";
}

export function hostLocale(): string {
  return typeof navigator === "undefined" ? "en" : navigator.language || "en";
}

export function setLocale(pref: Lang | null | undefined, appLanguage?: string | null): Locale {
  const language = typeof appLanguage === "string" ? appLanguage.trim() : "";
  state.locale = resolveLocale(pref, language || hostLocale());
  if (typeof document !== "undefined") document.documentElement.lang = state.locale;
  return state.locale;
}

export const currentLocale = (): Locale => state.locale;
/** BCP 47 tag for Intl formatting. */
export const intlLocale = (): string => INTL[state.locale];

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
