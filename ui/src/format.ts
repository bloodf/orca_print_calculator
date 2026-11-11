// Locale formatting helpers (docs/ux.md §8.1). `locale` is the Intl tag ("en-US" | "pt-BR").
import { currencyDigits, formatMoney, parseMoney } from "./engine/money";

const nf = (locale: string, o: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, o);

/** "R$ 1.234,50" */
export const money = (minor: number, currency: string, locale: string): string => formatMoney(minor, currency, locale);

/** Decimal string of integer minor units at `digits` fraction digits, exact (no float). */
export function decimalString(minor: number, digits: number): string {
  const abs = String(Math.abs(minor)).padStart(digits + 1, "0");
  const d = digits ? `${abs.slice(0, -digits)}.${abs.slice(-digits)}` : abs;
  return minor < 0 ? `-${d}` : d;
}

/** Field text: "1.234,50" (no symbol). */
export const moneyPlain = (minor: number, digits: number, locale: string): string =>
  nf(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(decimalString(minor, digits) as unknown as number);

/** Currency symbol only ("R$", "$", "¥"). */
export function currencySymbol(currency: string, locale: string): string {
  const parts = nf(locale, { style: "currency", currency }).formatToParts(0);
  return parts.find((p) => p.type === "currency")?.value ?? currency;
}

/** Per-unit money, e.g. perUnit(95, "BRL", "pt-BR", "kWh") -> "R$ 0,95/kWh". */
export const perUnit = (minor: number, currency: string, locale: string, unit: string): string => `${money(minor, currency, locale)}/${unit}`;

/** Energy price: value in minor×100 units (kwhE4), trailing zeros trimmed down to the currency digits. */
export function perKwh(e4: number, currency: string, locale: string): string {
  const digits = currencyDigits(currency);
  const s = decimalString(e4, digits + 2);
  return `${nf(locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits + 2 }).format(s as unknown as number)}/kWh`;
}

/** Basis points to "29,7%" (max 1 decimal). */
/** Typographic minus for losses, like `signed` money. */
export const percent = (bp: number, locale: string): string => nf(locale, { style: "percent", maximumFractionDigits: 1 }).format(bp / 10000).replace("-", "\u2212");

/** Largest two units: "2h 14m", "1d 3h", "45m", "30s". pt-BR minutes read "min". */
export function duration(seconds: number, locale: string): string {
  const s = Math.max(0, Math.round(seconds));
  const min = locale === "pt-BR" ? "min" : "m";
  if (s < 60) return `${s}s`;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}${min}` : `${h}h`;
  return `${m}${min}`;
}

/** Grams: "41 g", "4.6 g" (< 10 g), "1.24 kg" (>= 1000 g). */
export function grams(g: number, locale: string): string {
  if (g >= 1000) return `${nf(locale, { maximumFractionDigits: 2 }).format(g / 1000)} kg`;
  if (g < 10) return `${nf(locale, { maximumFractionDigits: 1 }).format(g)} g`;
  return `${nf(locale, { maximumFractionDigits: 0 }).format(g)} g`;
}

export const watts = (w: number, locale: string): string => `${nf(locale, { maximumFractionDigits: 0 }).format(w)} W`;
export const count = (n: number, locale: string): string => nf(locale, { maximumFractionDigits: 0 }).format(n);
export const bytes = (n: number, locale: string): string =>
  n >= 1_048_576 ? `${nf(locale, { maximumFractionDigits: 1 }).format(n / 1_048_576)} MB` : `${nf(locale, { maximumFractionDigits: 0 }).format(Math.max(1, n / 1024))} KB`;

/** "#0042" (en) / "nº 0042" (pt-BR). */
export const quoteNo = (no: number, locale: string): string => `${locale === "pt-BR" ? "nº " : "#"}${String(no).padStart(4, "0")}`;

export function date(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d);
}

/** Short time today, date + time on other days. */
export function slicedTime(iso: string, locale: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameDay = d.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(locale, sameDay ? { timeStyle: "short" } : { dateStyle: "short", timeStyle: "short" }).format(d);
}

/** Why a money text does not parse: null = fine, "decimals" = too many fraction digits, "number" = garbage. */
export function moneyError(text: string, digits: number, locale: string): "decimals" | "number" | null {
  if (parseMoney(text, digits, locale) !== null) return null;
  return parseMoney(text, 9, locale) !== null ? "decimals" : "number";
}

/** A data-derived colour is painted only as #RRGGBB; anything else (url(), named colours, extra CSS) is null. */
export const safeColor = (c: string | null | undefined): string | null => (typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null);
