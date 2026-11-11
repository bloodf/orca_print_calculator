// Per-channel pricing on top of the vendored engine. Integer minor units only.
import { breakEven, deadZones, feeFor, mulDivRound, suggestPrice, type ChannelInput } from "./costs";

export type PrettyMode = "none" | "round" | "ending9" | "step5";
export const PRETTY_MODES: readonly PrettyMode[] = ["none", "round", "ending9", "step5"];
export type DiscountTier = { minQty: number; discountBp: number };
export type QuoteChannel = ChannelInput & { id: string; name: string };
export type ChannelProblem = "margin_impossible" | "search_bound_exceeded" | "channel_invalid" | "overflow";
type Zones = { fromCents: number; untilCents: number }[];

/**
 * Per-piece economics plus order totals for one channel at one quantity.
 * discountBp is the nominal volume tier; effectiveDiscountBp is what the customer actually gets after
 * pretty rounding (vs the undiscounted pretty price). belowBreakEven judges the per-piece price;
 * orderBelowBreakEven judges the whole order (includes order-level costs).
 */
export type ChannelOk = {
  id: string; name: string; ok: true;
  price: number; fees: number; net: number; profit: number; marginBp: number;
  breakEven: number; deadZones: Zones;
  discountBp: number; effectiveDiscountBp: number; orderTotal: number; shippingCharged: number; grandTotal: number;
  orderProfit: number; profitPerPrintHour: number | null;
  flags: { discounted: boolean; belowTarget: boolean; belowBreakEven: boolean; orderBelowBreakEven: boolean; deadZoneJumped: boolean; minimumApplied: boolean };
};
export type ChannelQuote = ChannelOk | { id: string; name: string; ok: false; problem: ChannelProblem };

/** What the order looks like for pricing: per-piece cost at q plus exact order cost. */
export type PricingContext = {
  quantity: number; unitCostAtQuantity: number; orderCost: number; orderPrintSeconds: number;
  targetMarginBp: number; discountTiers: DiscountTier[]; pretty: PrettyMode;
  minOrderMinor: number; customerShippingMinor: number;
};

const ceilTo = (p: number, step: number) => Math.ceil(p / step) * step;
/** 10^k: the unit of the n-th significant digit of p (at least 1 minor unit). Integer-only. */
const sigUnit = (p: number, n: number) => 10 ** Math.max(0, String(p).length - n);

/**
 * Round a price UP to a "nice" price. Works on minor units and on significant digits, so the same rule
 * scales with any currency (0, 2 or 3 digits) and any magnitude. Prices under 100 minor units (1000 for
 * round) are left as they are.
 *
 * | mode    | rule                                          | R$ 21,87 | ¥2187 | ¥218700 | KWD 0.989 | KWD 4.687 | max rise |
 * |---------|-----------------------------------------------|----------|-------|---------|-----------|-----------|----------|
 * | none    | unchanged                                     | 21,87    | 2187  | 218700  | 0.989     | 4.687     | 0        |
 * | round   | multiple of the 3rd significant digit's unit  | 21,90    | 2190  | 219000  | 0.989     | 4.690     | < 1%     |
 * | step5   | multiple of 5 at the 2nd significant digit    | 22,00    | 2200  | 220000  | 0.990     | 4.700     | < 5%     |
 * | ending9 | next 2nd-significant-digit step, minus 1 unit | 21,99    | 2199  | 219999  | 0.989     | 4.699     | < 10%    |
 *
 * "max rise" bounds prettyUp alone. The final quoted price can rise more: a pretty candidate inside a
 * dead zone jumps past the zone and is rounded again (e.g. tiered fixture, cost 2748, step5: 7995 -> 9500).
 */
export function prettyUp(p: number, mode: PrettyMode): number {
  if (mode === "round") return ceilTo(p, sigUnit(p, 3));
  if (mode === "step5") return ceilTo(p, Math.max(1, sigUnit(p, 2) / 2));
  if (mode === "ending9") { const u = sigUnit(p, 2); return u === 1 ? p : ceilTo(p + 1, u) - 1; }
  return p;
}

// ponytail: step-count bounds; the engine scans
// prices linearly. Zone scans cost one feeFor per minor unit of zone width (~3 scans per channel per
// quantity, since suggestPrice/breakEven recompute zones), repeated for every channel × batch row.
// 50k keeps the worst case well under a second on the UI thread (500k measured 5+ s).
// Upgrade path: bound channels × rows × zone width as a product, or memoize deadZones per channel and
// move to a bisection search in the engine, then drop these guards.
const ZONE_LIMIT = 50_000;
const SEARCH_LIMIT = 20_000;
const SETTLE_LIMIT = 20_000;
function boundedSearch(c: ChannelInput, cost: number, target: number): boolean {
  let zoneSteps = 0;
  for (let k = 1; k < c.tiers.length; k++) {
    const t = c.tiers[k]!, lo = t.minPriceCents;
    const ref = lo - 1 - feeFor(c, lo - 1).totalCents;
    if (lo - feeFor(c, lo).totalCents >= ref) continue;
    const fixed = t.fixedCents + t.shippingCents + c.surchargeCents;
    const recoveredBy = Math.ceil(((ref + fixed + 1) * 10000) / (10000 - t.pctBp - c.taxBp));
    zoneSteps += Math.max(0, Math.min(c.tiers[k + 1]?.minPriceCents ?? Infinity, recoveredBy) - lo);
  }
  let steps = 0;
  for (const margin of [target, 0]) for (const t of c.tiers) {
    const denom = 10000 - t.pctBp - c.taxBp - margin;
    const fixed = cost + t.fixedCents + t.shippingCents + c.surchargeCents;
    steps += denom > 0 ? Math.ceil(20000 / denom) + 3 : fixed <= 1 ? 10001 : 0;
  }
  return zoneSteps <= ZONE_LIMIT && steps <= SEARCH_LIMIT;
}

const discountFor = (tiers: DiscountTier[], q: number) =>
  tiers.reduce((best, t) => (t.minQty <= q && t.minQty >= best.minQty ? t : best), { minQty: 0, discountBp: 0 }).discountBp;
const zoneAt = (zones: Zones, p: number) => zones.find((z) => p >= z.fromCents && p <= z.untilCents);
const meets = (profit: number, price: number, targetBp: number) => BigInt(profit) * 10000n >= BigInt(targetBp) * BigInt(price);

/**
 * Round `raw` up to a pretty price, stepping to the next pretty price while the candidate sits in a dead
 * zone, earns less than `raw`, or (when raw met the target) misses the target. null = step limit hit.
 */
function settle(c: ChannelInput, zones: Zones, cost: number, raw: number, target: number, mode: PrettyMode) {
  const profit = (p: number) => p - feeFor(c, p).totalCents - cost;
  const rawProfit = profit(raw), needTarget = meets(rawProfit, raw, target);
  let p = prettyUp(raw, mode), jumped = false;
  for (let n = 0; n < SETTLE_LIMIT; n++) {
    const zone = zoneAt(zones, p);
    if (zone) { jumped = true; p = prettyUp(zone.untilCents + 1, mode); continue; }
    const pr = profit(p);
    if (pr >= rawProfit && (!needTarget || meets(pr, p, target))) return { price: p, jumped };
    p = prettyUp(p + 1, mode);
  }
  return null;
}

/** Pretty-round p, then while it sits in a dead zone jump past the zone and round again. */
const prettyOutside = (zones: Zones, p: number, mode: PrettyMode): number => {
  const q = prettyUp(p, mode), z = zoneAt(zones, q);
  return z ? prettyOutside(zones, z.untilCents + 1, mode) : q;
};
const ceilDiv = (a: number, b: number) => Number((BigInt(a) + BigInt(b) - 1n) / BigInt(b));
/** round(profit * 10000 / price) half-up toward +inf, same rounding as the engine's marginAt. */
const marginBpOf = (profit: number, price: number) => {
  const n = 2n * BigInt(profit) * 10000n + BigInt(price), d = 2n * BigInt(price);
  return Number(n / d - (n % d < 0n ? 1n : 0n));
};
const signedMulDiv = (a: number, b: number, c: number) => Math.sign(a) * mulDivRound(Math.abs(a), b, c);

/** Discounted, settled price, raised to the minimum-order per-piece price when the order is too small. */
function choosePrice(ch: QuoteChannel, zones: Zones, x: PricingContext, suggested: number) {
  const cost = x.unitCostAtQuantity;
  const discountBp = discountFor(x.discountTiers, x.quantity);
  const list = settle(ch, zones, cost, suggested, x.targetMarginBp, x.pretty);
  const discounted = Math.max(1, suggested - mulDivRound(suggested, discountBp, 10000));
  const settled = discountBp ? settle(ch, zones, cost, discounted, x.targetMarginBp, x.pretty) : list;
  if (!list || !settled) return null;
  // Minimum order re-prices per piece through the channel's fees: ceil(min / q), pretty-rounded up,
  // dead zones re-checked (tier may change).
  const minPrice = x.minOrderMinor > 0 ? ceilDiv(x.minOrderMinor, x.quantity) : 0;
  const minimumApplied = settled.price < minPrice;
  const price = minimumApplied ? prettyOutside(zones, minPrice, x.pretty) : settled.price;
  const effectiveDiscountBp = Math.max(0, signedMulDiv(list.price - price, 10000, list.price));
  const jumped = minimumApplied ? price !== prettyUp(minPrice, x.pretty) : settled.jumped;
  return { price, discountBp, effectiveDiscountBp, jumped, minimumApplied };
}

export function priceChannel(ch: QuoteChannel, x: PricingContext): ChannelQuote {
  const { id, name } = ch, cost = x.unitCostAtQuantity;
  const fail = (problem: ChannelProblem): ChannelQuote => ({ id, name, ok: false, problem });
  try {
    if (!boundedSearch(ch, cost, x.targetMarginBp)) return fail("search_bound_exceeded");
    const suggested = suggestPrice(ch, cost, x.targetMarginBp);
    const floor = breakEven(ch, cost);
    if (suggested === null || floor === null) return fail("margin_impossible");
    const zones = deadZones(ch);
    const pick = choosePrice(ch, zones, x, suggested);
    if (!pick) return fail("search_bound_exceeded");
    const { price } = pick, fees = feeFor(ch, price).totalCents, net = price - fees, profit = net - cost;
    const orderTotal = price * x.quantity, orderProfit = net * x.quantity - x.orderCost;
    const grandTotal = orderTotal + x.customerShippingMinor;
    if (![orderTotal, orderProfit, grandTotal].every(Number.isSafeInteger)) return fail("overflow");
    return {
      id, name, ok: true, price, fees, net, profit, marginBp: marginBpOf(profit, price),
      breakEven: floor, deadZones: zones, discountBp: pick.discountBp, effectiveDiscountBp: pick.effectiveDiscountBp, orderTotal,
      shippingCharged: x.customerShippingMinor, grandTotal, orderProfit,
      profitPerPrintHour: x.orderPrintSeconds > 0 ? signedMulDiv(orderProfit, 3600, x.orderPrintSeconds) : null,
      flags: {
        discounted: pick.effectiveDiscountBp > 0, belowTarget: !meets(profit, price, x.targetMarginBp), belowBreakEven: profit < 0,
        orderBelowBreakEven: orderProfit < 0, deadZoneJumped: pick.jumped, minimumApplied: pick.minimumApplied,
      },
    };
  } catch (e) {
    if (e instanceof RangeError) return fail("channel_invalid");
    throw e;
  }
}
