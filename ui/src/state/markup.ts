// Markup over cost <-> margin on price, both in basis points. The engine prices by margin; people think in markup
// (100% markup = sells for 2x the cost = 50% margin). Cost here already includes channel fees and tax.
export const MAX_MARKUP_BP = 100_000; // 1000%
export const MAX_MARGIN_BP = 9091; // marginOf(MAX_MARKUP_BP)

export const marginOf = (markupBp: number): number => Math.round((markupBp * 10000) / (10000 + markupBp));

/** The roundest markup that maps back to exactly this margin (5000 -> 10000, never 10001). */
export function markupOf(marginBp: number): number {
  if (marginBp >= 10000) return MAX_MARKUP_BP;
  const exact = (marginBp * 10000) / (10000 - marginBp);
  for (const step of [100, 10]) {
    const c = Math.round(exact / step) * step;
    if (marginOf(c) === marginBp) return c;
  }
  return Math.round(exact);
}

/** Built-in starting values for the currencies we know typical numbers for; null for any other currency. */
export type CurrencyPreset = { energyPerKwh: string; laborPerHourMinor: number; printerMinor: number; lifetimeHours: number };
const PRESETS: Record<string, CurrencyPreset> = {
  BRL: { energyPerKwh: "0.95", laborPerHourMinor: 3000, printerMinor: 500000, lifetimeHours: 5000 },
  USD: { energyPerKwh: "0.16", laborPerHourMinor: 2000, printerMinor: 80000, lifetimeHours: 5000 },
  EUR: { energyPerKwh: "0.30", laborPerHourMinor: 2000, printerMinor: 80000, lifetimeHours: 5000 },
};
export const presetFor = (currency: string | null | undefined): CurrencyPreset | null =>
  (currency && Object.prototype.hasOwnProperty.call(PRESETS, currency) ? PRESETS[currency]! : null);
