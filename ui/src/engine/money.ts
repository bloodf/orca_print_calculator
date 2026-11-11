// Money helpers: integer minor units, BigInt/string math, no float drift.

export function currencyDigits(currency: string): number {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

const THOUSANDS = (sep: string) => new RegExp(`^\\d{1,3}(?:\\${sep}\\d{3})+$`);

/** Split cleaned text into [integerDigits, fractionDigits], or null when the separators make no sense. */
function splitDecimal(s: string, digits: number): [string, string] | null {
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const decimalAt = Math.max(lastDot, lastComma);
  if (decimalAt === -1) return /^\d+$/.test(s) ? [s, ""] : null;
  const sep = s[decimalAt] as string;
  const other = sep === "." ? "," : ".";
  const hasBoth = lastDot !== -1 && lastComma !== -1;
  const sepCount = s.split(sep).length - 1;
  // One separator kind, repeated: all thousands. A single one is the decimal mark.
  if (!hasBoth && sepCount > 1) return THOUSANDS(sep).test(s) ? [s.split(sep).join(""), ""] : null;
  if (sepCount > 1) return null;
  // Zero-digit currency has no fraction, so "1,234" / "1.234" is a thousands group.
  if (!hasBoth && digits === 0 && /^[1-9]\d{0,2}[.,]\d{3}$/.test(s)) return [s.replace(sep, ""), ""];
  const whole = s.slice(0, decimalAt);
  const fraction = s.slice(decimalAt + 1);
  // Empty whole part (".5") reads as 0.
  const wholeOk = hasBoth ? THOUSANDS(other).test(whole) : /^\d*$/.test(whole);
  if (!wholeOk || !/^\d+$/.test(fraction)) return null;
  return [whole.split(other).join("") || "0", fraction];
}

/** Decimal and group marks of a locale, e.g. pt-BR -> {",", "."}, fr-FR -> {",", NNBSP}. */
export function separators(locale: string): { decimal: string; group: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  return {
    decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
    group: parts.find((p) => p.type === "group")?.value ?? ",",
  };
}

const GROUP_CHARS = /[ \u00a0\u202f'\u2019]/;

/** Locale-authoritative split: the locale's decimal mark wins; other marks only as valid 3-digit grouping. */
function splitLocale(s: string, locale: string): [string, string] | null {
  const { decimal, group } = separators(locale);
  const isGroup = (c: string) => c === group || c === "." || c === "," || GROUP_CHARS.test(c);
  const grouped = (t: string) => {
    if (/^\d+$/.test(t)) return t;
    const g = t.match(/^[1-9]\d{0,2}(\D)\d{3}/)?.[1];
    if (!g || decimal === g || !isGroup(g)) return null;
    return new RegExp(`^[1-9]\\d{0,2}(?:\\${g === " " ? "s" : g}\\d{3})+$`).test(t.replace(/[\u00a0\u202f]/g, g === " " ? " " : g)) ? t.split(g).join("") : null;
  };
  const at = s.indexOf(decimal);
  if (at !== -1) {
    const whole = at === 0 ? "0" : grouped(s.slice(0, at)); // ",5" reads as 0,5
    const fraction = s.slice(at + 1);
    return whole !== null && /^\d+$/.test(fraction) ? [whole, fraction] : null;
  }
  const whole = grouped(s);
  if (whole !== null) return [whole, ""];
  // Lone "." in a comma-decimal locale is a decimal mark when it cannot be a thousands group.
  const lone = decimal === "," ? s.match(/^(\d+)\.(\d+)$/) : null;
  return lone && !/^[1-9]\d{0,2}\.\d{3}$/.test(s) ? [lone[1] as string, lone[2] as string] : null;
}

/** Digits of `text` as [whole, fraction], or null on garbage / negatives. */
function split(text: string, digits: number, locale?: string): [string, string] | null {
  if (/[-(]/.test(text)) return null;
  const s = text.trim().replace(/^[^\d.,]+|[^\d.,]+$/g, "");
  return locale ? splitLocale(s, locale) : splitDecimal(s, digits);
}

/** round(whole.fraction * scale), half-up, BigInt; null when unsafe. */
function scaleHalfUp([whole, fraction]: [string, string], scale: number): number | null {
  const den = 10n ** BigInt(fraction.length);
  const value = (BigInt(whole + fraction) * BigInt(scale) * 2n + den) / (den * 2n);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

/**
 * Parse "1,5" / "1.234,56" / "$1,234.56" to minor units. null on garbage, negatives, unsafe results,
 * and on more fraction digits than the currency has ("1.234" at 2 digits): that is ambiguous between a
 * thousands group and a typo, and silently rounding it turns normal input into a value 1000x off.
 */
export function parseMoney(text: string, digits: number, locale?: string): number | null {
  const parts = split(text, digits, locale);
  return parts && parts[1].length <= digits ? scaleHalfUp(parts, 10 ** digits) : null;
}

/** Parse a non-money number to an integer at `scale` (percent->bp 100, hours->s 3600, W->W10 10, g->mg 1000, qty->E3 1000). */
export function parseScaled(text: string, scale: number, locale?: string): number | null {
  const parts = split(text, 2, locale);
  return parts && scaleHalfUp(parts, scale);
}

export function formatMoney(minor: number, currency: string, locale: string): string {
  const digits = currencyDigits(currency);
  const abs = String(Math.abs(minor)).padStart(digits + 1, "0");
  const decimal = digits ? `${abs.slice(0, -digits)}.${abs.slice(-digits)}` : abs;
  // Decimal string input: exact on engines with Intl.NumberFormat v3; older ones (Safari < 15.4) convert it
  // to a Number first, still exact below ~1e15 minor units. Typed as number for the ES2020 lib.
  const value = (minor < 0 ? `-${decimal}` : decimal) as unknown as number;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}

/** Engine energy rate: round(pricePerKwh * 10^(digits+2)), half-up; extra fraction digits are rounded, not refused. */
export function kwhE4(pricePerKwhText: string, digits: number, locale?: string): number | null {
  const parts = split(pricePerKwhText, digits + 2, locale);
  return parts && scaleHalfUp(parts, 10 ** (digits + 2));
}
