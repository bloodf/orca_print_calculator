// Shape checks for data read from disk: a hand-edited or older file must never crash a view, only lose the bad row.
import { PRETTY_MODES } from "../engine/quotePricing";
import { computeQuote, type QuoteInput } from "../engine/quote";
import type { SavedQuote } from "./types";

type Rec = Record<string, unknown>;
export const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): boolean => typeof v === "string";
const num = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v);
const arr = (v: unknown): v is unknown[] => Array.isArray(v);

function isPlate(p: unknown): boolean {
  return isRec(p) && num(p.index) && num(p.seconds) && arr(p.slots) && p.slots.every((s) => isRec(s) && num(s.n) && num(s.gramsMg) && num(s.pricePerKgMinor) && str(s.label) && str(s.key));
}

const strs = (...vs: unknown[]): boolean => vs.every(str);
const nums = (...vs: unknown[]): boolean => vs.every(num);
const each = (v: unknown, f: (x: Rec) => boolean): boolean => arr(v) && v.every((x) => isRec(x) && f(x));

/** Everything `computeQuote` and the reopening code read from a frozen engine input, checked for shape. */
function isEngineInput(i: Rec): boolean {
  const c = i.costs;
  if (!isRec(c) || !isRec(c.machine) || !isRec(c.failure) || !isRec(c.labor)) return false;
  if (!nums(c.machine.wattsW10, c.machine.acquisitionCents, c.machine.lifetimeHours, c.kwhE4, c.failure.bp, c.maintenancePerHourCents, c.labor.perHourCents, c.labor.minutes, c.fixedCostPerPrintHourCents)) return false;
  if (!str(c.failure.mode) || typeof c.failure.includesMachine !== "boolean" || typeof c.depreciationEnabled !== "boolean") return false;
  if (!isRec(i.setup) || !nums(i.setup.ratePerHourMinor, i.setup.minutes) || !isRec(i.shipping) || !str(i.shipping.mode) || !num(i.shipping.minor)) return false;
  if (!nums(i.targetMarginBp, i.minOrderMinor) || !(PRETTY_MODES as readonly unknown[]).includes(i.pretty) || (i.unitsPerSet !== undefined && !num(i.unitsPerSet))) return false;
  return each(i.extras, (e) => strs(e.key, e.label, e.per) && nums(e.unitMinor, e.qtyE3))
    && each(i.discountTiers, (t) => nums(t.minQty, t.discountBp))
    && each(i.channels, (ch) => strs(ch.id, ch.name) && nums(ch.taxBp, ch.surchargeCents) && each(ch.tiers, (t) => nums(t.minPriceCents, t.pctBp, t.fixedCents, t.shippingCents)));
}

export function isSavedQuote(q: unknown): q is SavedQuote {
  if (!isRec(q) || !str(q.id) || !Number.isInteger(q.no) || !str(q.createdAt) || !str(q.updatedAt)) return false;
  if (!str(q.title) || !str(q.customer) || !str(q.note) || !str(q.currency) || !str(q.channelId)) return false;
  if (!arr(q.plates) || !q.plates.every(isPlate)) return false;
  const i = q.input;
  if (!isRec(i) || !arr(i.plates) || !i.plates.every(isPlate) || !num(i.quantity) || !isEngineInput(i)) return false;
  const s = q.summary;
  if (!(isRec(s) && str(s.channelName) && num(s.price) && num(s.grandTotal) && num(s.marginBp) && num(s.quantity))) return false;
  // A dry run is the real test: a quote the engine cannot price (or whose channel is gone) would open half-broken.
  try {
    const r = computeQuote(i as unknown as QuoteInput);
    return r.ok && r.channels.some((c) => c.id === q.channelId && c.ok);
  } catch {
    return false;
  }
}

/** Good rows stay; anything else is returned in `bad` so it can be kept on disk and counted, never silently dropped. */
export function parseQuotes(raw: unknown): { quotes: SavedQuote[]; bad: unknown[] } {
  if (!arr(raw)) return { quotes: [], bad: [] };
  return { quotes: raw.filter(isSavedQuote), bad: raw.filter((q) => !isSavedQuote(q)) };
}
