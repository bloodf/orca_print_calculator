// The cost lines of one piece add up to "Cost per piece", to the minor unit, at any quantity and in every calc version.
import { describe, expect, test } from "vitest";
import { CALC_VERSION, computeQuote, LEGACY_CALC, perPieceShares, type QuoteInput, type QuoteLine, type QuoteOk } from "../src/engine/quote";

const costs: QuoteInput["costs"] = {
  machine: { wattsW10: 1100, acquisitionCents: 250000, lifetimeHours: 4000 }, kwhE4: 10241,
  failure: { bp: 700, mode: "markup", includesMachine: true }, depreciationEnabled: true,
  maintenancePerHourCents: 37, labor: { perHourCents: 2500, minutes: 7 }, fixedCostPerPrintHourCents: 11,
};
const input = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  calc: CALC_VERSION,
  plates: [
    { index: 1, seconds: 3 * 3600 + 17, include: true, copies: 2, slots: [{ n: 1, gramsMg: 50_333, pricePerKgMinor: 12_990, label: "PLA", key: "pla" }] },
    { index: 2, seconds: 4111, include: true, copies: 1, slots: [{ n: 1, gramsMg: 7_777, pricePerKgMinor: 21_500, label: "PETG", key: "petg" }] },
  ],
  unitsPerSet: 3, quantity: 7, costs,
  setup: { ratePerHourMinor: 2500, minutes: 13 },
  extras: [
    { key: "magnet", label: "Magnet", unitMinor: 33, qtyE3: 2000, per: "piece" },
    { key: "bag", label: "Bag", unitMinor: 17, qtyE3: 1000, per: "plate" },
    { key: "box", label: "Box", unitMinor: 455, qtyE3: 1000, per: "order" },
  ],
  shipping: { mode: "absorbed", minor: 1990 },
  channels: [{ id: "direct", name: "Direct", tiers: [{ minPriceCents: 0, pctBp: 1200, fixedCents: 100, shippingCents: 0 }], taxBp: 600, surchargeCents: 0 }],
  targetMarginBp: 4000, discountTiers: [{ minQty: 20, discountBp: 500 }], pretty: "none", minOrderMinor: 0,
  ...over,
});
const ok = (i: QuoteInput): QuoteOk => { const r = computeQuote(i); if (!r.ok) throw new Error(JSON.stringify(r.problems)); return r; };
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe("cost lines reconcile with the cost per piece", () => {
  test.each([1, 2, 3, 7, 10, 13, 100, 999])("calc 3, %i pieces: the lines add up to the cost per piece and to the order cost", (quantity) => {
    const r = ok(input({ quantity }));
    expect(sum(r.lines.map((l) => l.perOrder))).toBe(r.orderCost);
    expect(sum(r.lines.map((l) => l.perPiece))).toBe(r.unitCostAtQuantity);
    expect(r.unitCostAtQuantity).toBe(Math.ceil(r.orderCost / quantity));
  });
  test.each([1, 4, 7, 50])("quotes saved before calc versions (calc 1), %i pieces: the same holds", (quantity) => {
    const { calc: _c, ...legacy } = input({ quantity });
    const r = ok(legacy);
    expect((legacy as QuoteInput).calc ?? LEGACY_CALC).toBe(LEGACY_CALC);
    expect(sum(r.lines.map((l) => l.perOrder))).toBe(r.orderCost);
    expect(sum(r.lines.map((l) => l.perPiece))).toBe(r.unitCostAtQuantity);
  });
  test("every batch-table quantity reconciles too, and no share is further than one minor unit from its exact value", () => {
    const r = ok(input({ quantity: 7 }));
    for (const l of r.lines) expect(Math.abs(l.perPiece - l.perOrder / 7)).toBeLessThan(1);
    expect(r.batchTable.map((b) => b.quantity)).toEqual([7, 20]);
  });
  test("one piece: each line is its order amount, untouched", () => {
    const r = ok(input({ quantity: 1, unitsPerSet: 1 }));
    for (const l of r.lines) expect(l.perPiece).toBe(l.perOrder);
  });
  test("the price is not moved by how the lines are shared out", () => {
    const r = ok(input({ quantity: 7 }));
    const c = r.channels[0]!;
    if (!c.ok) throw new Error("expected a price");
    expect(c.profit).toBe(c.net - r.unitCostAtQuantity);
  });
});

describe("perPieceShares", () => {
  const line = (id: string, perOrder: number): QuoteLine => ({ id, perOrder, perPiece: -1 });
  const shares = (orders: number[], q: number): number[] =>
    perPieceShares(orders.map((o, k) => line(String(k), o)), q, Math.ceil(sum(orders) / q)).map((l) => l.perPiece);

  test("three equal lines over three pieces: the rounded column would say 99 against a cost of 100", () => {
    expect(shares([100, 100, 100], 3)).toEqual([34, 33, 33]);
  });
  test("the minor units owed go to the largest remainders, the earlier line on a tie", () => {
    expect(shares([10, 11, 12], 4)).toEqual([3, 3, 3]); // cost 9; floors 2 + 2 + 3; the two owed go to the remainders 2 and 3
    expect(shares([9, 10, 13], 4)).toEqual([2, 3, 3]); // cost 8; floors 2 + 2 + 3; the one owed goes to the largest remainder (2 of 10)
    expect(shares([5, 5], 2)).toEqual([3, 2]);
    expect(shares([1, 1, 1, 1], 8)).toEqual([1, 0, 0, 0]);
  });
  test("a line that divides evenly never takes a rounding unit, and a line of zero stays zero", () => {
    expect(shares([300, 0, 7], 3)).toEqual([100, 0, 3]);
    expect(shares([0, 0], 5)).toEqual([0, 0]);
  });
  test("does not change the lines it is given", () => {
    const lines = Object.freeze([Object.freeze(line("a", 10)), Object.freeze(line("b", 5))]) as unknown as QuoteLine[];
    expect(perPieceShares(lines, 4, 4).map((l) => l.perPiece)).toEqual([3, 1]);
    expect(lines[0]!.perPiece).toBe(-1);
  });
  test("random orders: always the exact total, never negative, never more than one unit off", () => {
    let seed = 42;
    const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    for (let k = 0; k < 500; k++) {
      const orders = Array.from({ length: 1 + rnd(11) }, () => rnd(100000));
      const q = 1 + rnd(250);
      const out = shares(orders, q);
      expect(sum(out)).toBe(Math.ceil(sum(orders) / q));
      out.forEach((v, j) => { expect(v).toBeGreaterThanOrEqual(0); expect(Math.abs(v - orders[j]! / q)).toBeLessThan(1); });
    }
  });
});
