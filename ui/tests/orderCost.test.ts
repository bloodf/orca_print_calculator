// F03/H03: the cost of a run is conserved before it is divided into pieces, and quotes saved with the earlier calculation
// keep their numbers until the user reprices them on purpose.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick, type App } from "vue";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({})) }));
import FrozenNote from "../src/components/costs/FrozenNote.vue";
import { computeRunsCost, computeCost, type EngineInput } from "../src/engine/costs";
import { CALC_VERSION, computeQuote, type QuoteInput, type QuoteOk } from "../src/engine/quote";
import { setLocale, t } from "../src/i18n";
import { isDirty } from "../src/quoteFlow";
import { hasOlderCalc, openQuote, repriceWithCurrentCalc, saveQuote } from "../src/state/quotes";
import { derived, store } from "../src/state/store";
import { isSavedQuote } from "../src/state/validate";
import { load, mount, txt } from "./priceKit";

const mounted: { app: App; root: HTMLElement }[] = [];
beforeEach(() => setLocale("en"));
afterEach(() => { for (const m of mounted.splice(0)) { m.app.unmount(); m.root.remove(); } });

const CH = { id: "d", name: "Direct", taxBp: 0, surchargeCents: 0, tiers: [{ minPriceCents: 0, pctBp: 0, fixedCents: 0, shippingCents: 0 }] };
/** Material only: every other cost is zero, so the order cost is exactly the filament. */
const base = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  plates: [{ index: 0, include: true, copies: 1, seconds: 0, slots: [{ n: 1, key: "m", label: "m", gramsMg: 14_900, pricePerKgMinor: 10_000 }] }],
  quantity: 100, unitsPerSet: 100,
  costs: { machine: { wattsW10: 0, acquisitionCents: 0, lifetimeHours: 0 }, kwhE4: 0, failure: { bp: 0, mode: "markup", includesMachine: false }, depreciationEnabled: false, maintenancePerHourCents: 0, labor: { perHourCents: 0, minutes: 0 }, fixedCostPerPrintHourCents: 0 },
  setup: { ratePerHourMinor: 0, minutes: 0 }, extras: [], shipping: { mode: "customer", minor: 0 }, channels: [CH], targetMarginBp: 0, discountTiers: [], pretty: "none", minOrderMinor: 0,
  ...over,
});
const ok = (i: QuoteInput): QuoteOk => { const r = computeQuote(i); if (!r.ok) throw new Error(JSON.stringify(r.problems)); return r; };
const sum = (r: QuoteOk) => r.lines.reduce((s, l) => s + l.perOrder, 0);

describe("F03: the round's cost is kept before it is divided", () => {
  test("14.9 g at R$100/kg for 100 pieces in one run costs 149 centavos, not 100", () => {
    const r = ok(base({ calc: CALC_VERSION }));
    expect(r.orderCost).toBe(149);
    expect(sum(r)).toBe(149); // the lines add up to the order
    expect(r.unitCostAtQuantity).toBe(2); // ceil(149 / 100): pricing never loses money
  });
  test("several runs round once on the whole order: 3 runs of 14.9 g", () => {
    // 100 pieces per set, quantity 250 -> 3 runs x 1.49 = 447 (per-piece rounding gave 1 x 300 = 300)
    const r = ok(base({ calc: CALC_VERSION, quantity: 250 }));
    expect([r.runs, r.piecesPrinted, r.sparePieces]).toEqual([3, 300, 50]);
    expect(r.orderCost).toBe(447);
    expect(sum(r)).toBe(447);
  });
  test("spare pieces are paid for: the order carries the whole production", () => {
    const r = ok(base({ calc: CALC_VERSION, quantity: 101 }));
    expect(r.runs).toBe(2);
    expect(r.orderCost).toBe(298); // 2 x 149, though only 101 pieces are sold
  });
  test("two materials, energy, wear, failure, labor and fixed cost all conserve their exact total", () => {
    const i = base({
      calc: CALC_VERSION, quantity: 7, unitsPerSet: 3,
      plates: [{ index: 0, include: true, copies: 2, seconds: 5_431, slots: [{ n: 1, key: "a", label: "a", gramsMg: 1_234, pricePerKgMinor: 8_990 }, { n: 2, key: "b", label: "b", gramsMg: 777, pricePerKgMinor: 12_345 }] }],
    });
    i.costs = { machine: { wattsW10: 2_500, acquisitionCents: 345_000, lifetimeHours: 4_000 }, kwhE4: 9_500, failure: { bp: 700, mode: "markup", includesMachine: true }, depreciationEnabled: true, maintenancePerHourCents: 33, labor: { perHourCents: 2_500, minutes: 7 }, fixedCostPerPrintHourCents: 11 };
    const r = ok(i);
    // exact production cost of 3 runs, rounded once per line (the engine's own fractions, no piece in between)
    const eng: EngineInput = { ...i.costs, materials: r.materials, printSeconds: r.printSeconds, unitsPerPrint: 3, extras: [], quantity: 1 };
    const exact = computeRunsCost(eng, 3);
    expect(r.orderCost).toBe(exact.totalCents);
    expect(sum(r)).toBe(r.orderCost);
    // and it is within a few centavos of the per-run cost x runs, never the per-piece rounded product
    const perRun = computeRunsCost(eng, 1).totalCents;
    expect(Math.abs(r.orderCost - perRun * 3)).toBeLessThanOrEqual(8);
  });
  test("extras by scope: per piece for every printed piece, per plate once per run, per order once", () => {
    const i = base({
      calc: CALC_VERSION, quantity: 5, unitsPerSet: 2, // 3 runs, 6 pieces, 2 plate copies per run
      plates: [{ index: 0, include: true, copies: 2, seconds: 0, slots: [] }],
      extras: [
        { key: "p", label: "piece", unitMinor: 10, qtyE3: 1_500, per: "piece" }, // 15 x 6 pieces = 90
        { key: "l", label: "plate", unitMinor: 7, qtyE3: 1_000, per: "plate" }, //  7 x 2 copies x 3 runs = 42
        { key: "o", label: "order", unitMinor: 100, qtyE3: 1_000, per: "order" }, // 100 once
      ],
    });
    const r = ok(i);
    expect(r.orderCost).toBe(90 + 42 + 100);
    expect(r.lines.find((l) => l.id === "extras")!.perOrder).toBe(132);
    expect(r.lines.find((l) => l.id === "orderExtras")!.perOrder).toBe(100);
  });
  test("a fractional per-plate extra is rounded once on the order, not per piece", () => {
    const i = base({ calc: CALC_VERSION, quantity: 100, unitsPerSet: 100, plates: [{ index: 0, include: true, copies: 1, seconds: 0, slots: [] }], extras: [{ key: "l", label: "plate", unitMinor: 149, qtyE3: 1_000, per: "plate" }] });
    expect(ok(i).orderCost).toBe(149); // per-piece rounding gave 1 x 100
  });
  test("setup, absorbed shipping and the channel economics use the conserved cost", () => {
    const i = base({ calc: CALC_VERSION, setup: { ratePerHourMinor: 6_000, minutes: 30 }, shipping: { mode: "absorbed", minor: 500 } });
    const r = ok(i);
    expect(r.orderFixed).toBe(3_500);
    expect(r.orderCost).toBe(149 + 3_500);
    const d = r.channels[0]!;
    if (!d.ok) throw new Error("channel");
    expect(d.orderProfit).toBe(d.net * 100 - r.orderCost);
  });
  test("every quantity row of the batch table conserves its own order cost", () => {
    const r = ok(base({ calc: CALC_VERSION, discountTiers: [{ minQty: 250, discountBp: 500 }] }));
    const row250 = r.batchTable.find((b) => b.quantity === 250)!;
    expect(row250.unitCostAtQuantity).toBe(2); // ceil(447 / 250)
  });
  test("currencies: the same minor-unit exactness at 0 and 3 digits (the engine is currency-agnostic)", () => {
    const yen = ok(base({ calc: CALC_VERSION, plates: [{ index: 0, include: true, copies: 1, seconds: 0, slots: [{ n: 1, key: "m", label: "m", gramsMg: 14_900, pricePerKgMinor: 1_000 }] }] }));
    expect(yen.orderCost).toBe(15); // 14.9 g x 1000/kg = 14.9, rounded once (per-piece rounding gave 0)
    const kwd = ok(base({ calc: CALC_VERSION, plates: [{ index: 0, include: true, copies: 1, seconds: 0, slots: [{ n: 1, key: "m", label: "m", gramsMg: 14_900, pricePerKgMinor: 100_000 }] }] }));
    expect(kwd.orderCost).toBe(1_490);
  });
  test("one piece per run changes nothing: the engine agrees with itself", () => {
    const i = base({ calc: CALC_VERSION, quantity: 1, unitsPerSet: 1 });
    expect(ok(i).orderCost).toBe(ok({ ...i, calc: 1 }).orderCost);
    expect(computeCost({ ...i.costs, materials: [], printSeconds: 0, unitsPerPrint: 1, extras: [], quantity: 1 }).unitCostCents).toBe(0);
  });
});

describe("H03: older quotes keep their numbers", () => {
  test("no calc field (every quote saved so far) prices exactly as before: 100 centavos", () => {
    const r = ok(base());
    expect(r.orderCost).toBe(100);
    expect(ok(base({ calc: 1 })).orderCost).toBe(100);
  });
  test("an unknown calculation version is refused, not guessed", () => {
    const r = computeQuote(base({ calc: 3 }));
    expect(r).toMatchObject({ ok: false, problems: [{ code: "invalid_option", path: "calc" }] });
  });
  test("new quotes are stamped; reopening an old one and saving it does not stamp it", async () => {
    load("ok");
    store.quotes = [];
    const fresh = (await saveQuote())!;
    expect(fresh.input.calc).toBe(CALC_VERSION);

    const legacyInput = { ...fresh.input } as Partial<QuoteInput>;
    delete legacyInput.calc;
    const legacy = { ...fresh, id: "q-old", no: 77, input: legacyInput as QuoteInput };
    expect(isSavedQuote(legacy)).toBe(true);
    store.quotes = [legacy];
    openQuote("q-old");
    expect(derived.value.quoteInput.calc).toBeUndefined();
    expect(hasOlderCalc()).toBe(true);
    const again = (await saveQuote())!;
    expect(again.input.calc).toBeUndefined();
    expect(again.no).toBe(77);
  });
  test("reprice is explicit: the button moves only the version, and the quote becomes edited", async () => {
    load("ok", { draft: (d) => ({ ...d, quantity: 100, unitsPerSet: 100 }) });
    store.quotes = [];
    const fresh = (await saveQuote())!;
    const legacyInput = { ...fresh.input, calc: undefined } as QuoteInput;
    delete legacyInput.calc;
    store.quotes = [{ ...fresh, id: "q-old", input: legacyInput }];
    openQuote("q-old");
    const before = (derived.value.result as QuoteOk).orderCost;

    const m = mount(FrozenNote); mounted.push(m); await nextTick();
    expect(txt(m.root)).toContain(t("quote.olderCalc"));
    [...m.root.querySelectorAll("button")].find((b) => txt(b) === t("quote.repriceCalc"))!.click();
    await nextTick();

    expect(store.draft.frozenInput!.calc).toBe(CALC_VERSION);
    expect(hasOlderCalc()).toBe(false);
    const after = derived.value.result as QuoteOk;
    expect(after.orderCost).not.toBe(before); // the old per-piece rounding moved the cost; today's number is the exact one
    expect(Math.abs(after.orderCost - before)).toBeLessThan(400); // by rounding only: under half a centavo x 100 pieces x 8 lines
    expect(isDirty()).toBe(true); // the repriced quote must be saved on purpose
    expect(JSON.stringify({ ...store.draft.frozenInput, calc: 0 })).toBe(JSON.stringify({ ...legacyInput, calc: 0 })); // nothing else moved
    repriceWithCurrentCalc(); // idempotent
    expect(store.draft.frozenInput!.calc).toBe(CALC_VERSION);
  });
  test("the list summary and a legacy quote's recomputation are untouched by the new engine", async () => {
    load("ok");
    store.quotes = [];
    const fresh = (await saveQuote())!;
    const legacyInput = { ...fresh.input } as Partial<QuoteInput>;
    delete legacyInput.calc;
    const legacy = { ...fresh, input: legacyInput as QuoteInput };
    const r = ok(legacy.input);
    const ch = r.channels.find((c) => c.id === legacy.channelId)!;
    if (!ch.ok) throw new Error("channel");
    expect(ch.price).toBe(legacy.summary.price);
  });
});
