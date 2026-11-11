// Pure number-entry rules shared by NumberField, MoneyField, PercentField and Stepper (docs/ux.md §7.4).
import { parseMoney, parseScaled } from "../../engine/money";
import { decimalString, moneyError } from "../../format";

export type NumSpec = {
  /** Model units per displayed unit: 100 for bp -> %, 10^digits for money, 1 for integers. */
  scale: number;
  /** Money mode: parse with parseMoney, reject extra decimals. */
  money?: { digits: number; currency?: string };
};
export type NumBounds = { min?: number; max?: number; required?: boolean; nullable?: boolean };
export type FieldError = { key: string; params?: Record<string, string | number> };
export type TextResult = { value: number | null | undefined; error?: FieldError };

const isPow10 = (n: number): boolean => n >= 1 && Number.isInteger(Math.log10(n)) && 10 ** Math.log10(n) === n;

export function fractionDigits(spec: NumSpec): number {
  if (spec.money) return spec.money.digits;
  return spec.scale <= 1 ? 0 : Math.ceil(Math.log10(spec.scale));
}

/** Model integer -> field text in the locale ("1.234,50", "29,7"). */
export function formatNum(model: number, spec: NumSpec, locale: string): string {
  const fd = fractionDigits(spec);
  const o = { minimumFractionDigits: spec.money ? fd : 0, maximumFractionDigits: fd };
  const nf = new Intl.NumberFormat(locale, o);
  if (!isPow10(spec.scale)) return nf.format(model / spec.scale);
  return nf.format(decimalString(model, Math.round(Math.log10(spec.scale))) as unknown as number);
}

export const parseNum = (text: string, spec: NumSpec, locale: string): number | null =>
  spec.money ? parseMoney(text, spec.money.digits, locale) : parseScaled(text, spec.scale, locale);

/** Example number in the locale, for "Enter a number, like 1.234,50." */
export const exampleNum = (locale: string): string => new Intl.NumberFormat(locale, { minimumFractionDigits: 2 }).format(1234.5);

export function checkText(text: string, spec: NumSpec, b: NumBounds, locale: string): TextResult {
  if (text.trim() === "") return b.nullable ? { value: null } : { value: undefined, error: { key: "field.error.required" } };
  const v = parseNum(text, spec, locale);
  if (v === null) return { value: undefined, error: parseError(text, spec, locale) };
  if (b.min !== undefined && v < b.min) return { value: undefined, error: { key: "field.error.min", params: { min: formatNum(b.min, spec, locale) } } };
  if (b.max !== undefined && v > b.max) return { value: undefined, error: { key: "field.error.max", params: { max: formatNum(b.max, spec, locale) } } };
  return { value: v };
}

function parseError(text: string, spec: NumSpec, locale: string): FieldError {
  const m = spec.money;
  if (m && moneyError(text, m.digits, locale) === "decimals") {
    return m.digits === 0
      ? { key: "field.error.noDecimals", params: { currency: m.currency ?? "" } }
      : { key: "field.error.decimals", params: { n: m.digits } };
  }
  return { key: "field.error.number", params: { example: exampleNum(locale) } };
}

export const clamp = (v: number, min?: number, max?: number): number => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));

/** Arrow/Page keys: Shift x10, Alt x0.1 (money and percent only), Page x10. Returns the model delta, or null. */
export function keyDelta(e: { key: string; shiftKey: boolean; altKey: boolean }, step: number, allowAlt: boolean): number | null {
  const dir = e.key === "ArrowUp" || e.key === "PageUp" ? 1 : e.key === "ArrowDown" || e.key === "PageDown" ? -1 : 0;
  if (!dir) return null;
  let mult = e.key.startsWith("Page") ? 10 : 1;
  if (e.shiftKey) mult *= 10;
  const raw = e.altKey && allowAlt ? step * mult * 0.1 : step * mult;
  return dir * Math.max(1, Math.round(raw));
}
