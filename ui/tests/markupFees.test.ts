// Calculation version 3: markup is profit after channel fees and tax over cost (help text), not a margin on the gross price.
// Quotes saved with versions 1 and 2 keep the numbers they were saved with.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick, type App } from "vue";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({})) }));
import FrozenNote from "../src/components/costs/FrozenNote.vue";
import { CALC_VERSION, computeQuote, type ChannelOk, type QuoteChannel, type QuoteInput } from "../src/engine/quote";
import { setLocale, t } from "../src/i18n";
import { marginOf } from "../src/state/markup";
import { hasOlderCalc, openQuote, saveQuote } from "../src/state/quotes";
import { derived, store } from "../src/state/store";
import { isSavedQuote } from "../src/state/validate";
import { load, mount, txt } from "./priceKit";

const mounted: { app: App; root: HTMLElement }[] = [];
beforeEach(() => setLocale("en"));
afterEach(() => { for (const m of mounted.splice(0)) { m.app.unmount(); m.root.remove(); } });

const tier = (minPriceCents: number, pctBp: number, fixedCents = 0) => ({ minPriceCents, pctBp, fixedCents, shippingCents: 0 });
const channel = (over: Partial<QuoteChannel> = {}): QuoteChannel => ({ id: "c", name: "Shop", taxBp: 0, surchargeCents: 0, tiers: [tier(0, 0)], ...over });
/** Unit cost exactly 10.00: 100 g at 100.00/kg, nothing else. */
const input = (markupBp: number, ch: QuoteChannel, calc: number | undefined = CALC_VERSION): QuoteInput => ({
  ...(calc === undefined ? {} : { calc }),
  plates: [{ index: 0, include: true, copies: 1, seconds: 0, slots: [{ n: 1, key: "m", label: "m", gramsMg: 100_000, pricePerKgMinor: 10_000 }] }],
  quantity: 1, unitsPerSet: 1,
  costs: { machine: { wattsW10: 0, acquisitionCents: 0, lifetimeHours: 0 }, kwhE4: 0, failure: { bp: 0, mode: "markup", includesMachine: false }, depreciationEnabled: false, maintenancePerHourCents: 0, labor: { perHourCents: 0, minutes: 0 }, fixedCostPerPrintHourCents: 0 },
  setup: { ratePerHourMinor: 0, minutes: 0 }, extras: [], shipping: { mode: "customer", minor: 0 }, channels: [ch],
  targetMarginBp: marginOf(markupBp), discountTiers: [], pretty: "none", minOrderMinor: 0,
});
const priced = (i: QuoteInput): ChannelOk => {
  const r = computeQuote(i);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  const c = r.channels[0]!;
  if (!c.ok) throw new Error(c.problem);
  expect(r.unitCostAtQuantity).toBe(1000);
  return c;
};

describe("calc 3: markup over cost after fees and tax", () => {
  test("cost 10.00, 20% fee, 100% markup: 25.00 with 10.00 profit", () => {
    const c = priced(input(10_000, channel({ tiers: [tier(0, 2000)] })));
    expect([c.price, c.fees, c.profit, c.markupBp]).toEqual([2500, 500, 1000, 10_000]);
    expect(c.flags.belowTarget).toBe(false);
  });
  test("tax and a fixed fee: 10% fee + 2.00, 5% tax, 50% markup -> 20.00, profit 5.00", () => {
    const c = priced(input(5000, channel({ taxBp: 500, tiers: [tier(0, 1000, 200)] })));
    expect([c.price, c.profit]).toEqual([2000, 500]);
    expect(priced(input(5000, channel({ taxBp: 500, tiers: [tier(0, 1000, 200)] }))).flags.belowTarget).toBe(false);
  });
  test("tiered channel: the answer is past a tier boundary and outside its dead zone", () => {
    const ch = channel({ tiers: [tier(0, 1000), tier(2000, 3000)] });
    const c = priced(input(10_000, ch));
    expect(c.price).toBe(2857); // 30% of 28.57 rounds to 8.57: net 20.00
    expect(c.profit).toBe(1000);
    expect(c.deadZones[0]!.fromCents).toBe(2000);
    expect(c.price).toBeGreaterThan(c.deadZones[0]!.untilCents);
    expect(c.flags.belowTarget).toBe(false);
  });
  test("markup 0 is break-even", () => {
    const c = priced(input(0, channel({ taxBp: 500, tiers: [tier(0, 1700, 650)] })));
    expect(c.price).toBe(c.breakEven);
    expect(c.profit).toBeGreaterThanOrEqual(0);
  });
  test.each([0, 2500, 5000, 10_000, 30_000])("no fees, no tax: %i bp markup prices like calc 2", (markup) => {
    const now = priced(input(markup, channel()));
    const before = priced(input(markup, channel(), 2));
    expect(now.price).toBe(before.price);
    expect(now.profit * 10_000).toBe(markup * 1000);
  });
  test("pretty rounding keeps the target, so the suggested price is never flagged", () => {
    for (const pretty of ["round", "ending9", "step5"] as const) {
      const c = priced({ ...input(10_000, channel({ tiers: [tier(0, 2000)] })), pretty });
      expect(c.profit).toBeGreaterThanOrEqual(1000);
      expect(c.flags.belowTarget).toBe(false);
    }
  });
  test("a discount below the markup is flagged with the markup reached", () => {
    const i = { ...input(10_000, channel({ tiers: [tier(0, 2000)] })), quantity: 10, discountTiers: [{ minQty: 10, discountBp: 2000 }] };
    const r = computeQuote(i);
    const c = r.ok ? r.channels[0]! : null;
    expect(c?.ok && c.flags.belowTarget).toBe(true);
    expect(c?.ok && c.markupBp).toBe(6000); // 20.00 - 4.00 fee - 10.00 cost = 6.00 over 10.00
  });
});

describe("quotes saved before calc 3 keep their prices", () => {
  test("calc 2 with a 20% fee still prices at 33.32 (margin on the gross price)", () => {
    const c = priced(input(10_000, channel({ tiers: [tier(0, 2000)] }), 2));
    expect([c.price, c.profit]).toEqual([3332, 1666]);
    expect(c.flags.belowTarget).toBe(false);
  });
  test("an unknown version is still refused", () => {
    expect(computeQuote(input(10_000, channel(), 4))).toMatchObject({ ok: false, problems: [{ code: "invalid_option", path: "calc" }] });
  });
  test("a saved calc 2 quote with a fee channel reopens at its saved price and offers the reprice", async () => {
    load("ok");
    store.quotes = [];
    const fresh = (await saveQuote())!;
    expect(fresh.input.calc).toBe(3);
    const fee: QuoteChannel = { ...fresh.input.channels.find((c) => c.id === fresh.channelId)!, tiers: [tier(0, 2000)] };
    const v2Input: QuoteInput = { ...fresh.input, calc: 2, channels: fresh.input.channels.map((c) => (c.id === fee.id ? fee : c)) };
    const v2 = computeQuote(v2Input);
    const sel = v2.ok ? v2.channels.find((c) => c.id === fresh.channelId) : undefined;
    if (!sel?.ok) throw new Error("fixture does not price");
    const saved = { ...fresh, id: "q-v2", no: 70, input: v2Input, summary: { ...fresh.summary, price: sel.price, grandTotal: sel.grandTotal, marginBp: sel.marginBp } };
    expect(isSavedQuote(saved)).toBe(true);
    store.quotes = [saved];
    openQuote("q-v2");
    const now = derived.value.selected;
    expect(now?.ok && [now.price, now.grandTotal, now.marginBp]).toEqual([saved.summary.price, saved.summary.grandTotal, saved.summary.marginBp]);
    expect(derived.value.quoteInput.calc).toBe(2);
    expect(hasOlderCalc()).toBe(true);
    const m = mount(FrozenNote); mounted.push(m); await nextTick();
    expect(txt(m.root)).toContain(t("quote.olderCalcMarkup"));
    expect(txt(m.root)).not.toContain(t("quote.olderCalc"));
  });
});
