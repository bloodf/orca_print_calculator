import { describe, expect, test } from "vitest";
import { breakEven, computeCost, deadZones, feeFor, marginAt, suggestPrice, type ChannelInput, type EngineInput } from "../src/engine/costs";
import { DEFAULT_CHANNELS, toChannelInput } from "../src/engine/channels";
import { computeQuote, type QuoteChannel, type QuoteInput, type QuoteOk, type ChannelOk } from "../src/engine/quote";
import { prettyUp } from "../src/engine/quotePricing";

const costs: QuoteInput["costs"] = {
  machine: { wattsW10: 1100, acquisitionCents: 0, lifetimeHours: 4000 }, kwhE4: 10241,
  failure: { bp: 1000, mode: "markup", includesMachine: false }, depreciationEnabled: false,
  maintenancePerHourCents: 0, labor: { perHourCents: 0, minutes: 0 }, fixedCostPerPrintHourCents: 0,
};
const slot = (g: number, key = "pla", pricePerKgMinor = 12500, n = 1) => ({ n, gramsMg: Math.round(g * 1000), pricePerKgMinor, label: key, key });
const plate = (index: number, slots: ReturnType<typeof slot>[], seconds: number, copies = 1, include = true) => ({ index, seconds, include, copies, slots });
const flat: QuoteChannel = { id: "direct", name: "Direct", tiers: [{ minPriceCents: 0, pctBp: 2000, fixedCents: 0, shippingCents: 0 }], taxBp: 0, surchargeCents: 0 };
const tieredFees: ChannelInput = {
  taxBp: 0, surchargeCents: 0,
  tiers: [
    { minPriceCents: 0, pctBp: 7000, fixedCents: 0, shippingCents: 0 },
    { minPriceCents: 900, pctBp: 2000, fixedCents: 450, shippingCents: 0 },
    { minPriceCents: 8000, pctBp: 1400, fixedCents: 1600, shippingCents: 0 },
    { minPriceCents: 10000, pctBp: 1400, fixedCents: 2000, shippingCents: 0 },
    { minPriceCents: 20000, pctBp: 1400, fixedCents: 2600, shippingCents: 0 },
  ],
};
const tiered: QuoteChannel = { id: "tiered", name: "Tiered", ...tieredFees };
const pack = { key: "pack", label: "pack", unitMinor: 200, qtyE3: 1000, per: "piece" as const };
const base: QuoteInput = {
  plates: [plate(1, [slot(50)], 3 * 3600)], quantity: 10, costs,
  setup: { ratePerHourMinor: 0, minutes: 0 }, extras: [pack], shipping: { mode: "absorbed", minor: 0 },
  channels: [flat], targetMarginBp: 4000, discountTiers: [], pretty: "none", minOrderMinor: 0,
};
// Cost driven only by one per-piece extra: unit cost is exactly `c`.
const costOnly = (c: number, over: Partial<QuoteInput> = {}): QuoteInput => ({
  ...base, plates: [plate(1, [], 0)], extras: [{ key: "c", label: "c", unitMinor: c, qtyE3: 1000, per: "piece" }], ...over,
});

const ok = (i: QuoteInput): QuoteOk => {
  const r = computeQuote(i);
  if (!r.ok) throw new Error(`unexpected problems ${JSON.stringify(r.problems)}`);
  return r;
};
const ch = (r: QuoteOk, id = "direct"): ChannelOk => {
  const c = r.channels.find((x) => x.id === id);
  if (!c?.ok) throw new Error(`channel ${id} not ok ${JSON.stringify(c)}`);
  return c;
};
const codes = (i: QuoteInput) => { const r = computeQuote(i); return r.ok ? [] : r.problems.map((p) => `${p.code}@${p.path}`); };
const deepFreeze = <T>(o: T): T => { if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };

describe("project cost", () => {
  test("single plate matches hand-computed numbers (SV06 50g 3h + packaging)", () => {
    const r = ok(base);
    const line = (id: string) => r.lines.find((l) => l.id === id)!;
    expect(line("filament").perPiece).toBe(625);
    expect(line("energy").perPiece).toBe(34);
    expect(line("failure").perPiece).toBe(66);
    expect(line("extras").perPiece).toBe(200);
    expect(line("filament").perOrder).toBe(6250);
    expect(r.unitCost).toBe(925);
    expect(r.unitCostAtQuantity).toBe(925);
    expect(r.orderCost).toBe(9250);
    // 20% fee, 40% target: 2311 nets 1849 (profit 924 < 40%); 2312 fee round(462.4) = 462, nets 1850, profit 925 = 40.0%.
    const c = ch(r);
    expect(c.price).toBe(2312);
    expect(c.fees).toBe(462);
    expect(c.net).toBe(1850);
    expect(c.profit).toBe(925);
    expect(c.marginBp).toBe(4001);
    expect(c.breakEven).toBe(1156);
    expect(c.orderTotal).toBe(23120);
    expect(c.orderProfit).toBe(18500 - 9250);
    // 10 pieces x 3h = 30h of printing: 9250 / 30 = 308.33
    expect(c.profitPerPrintHour).toBe(308);
  });

  test("regression: one plate, copies 1, no order-level items equals plain computeCost", () => {
    const i: QuoteInput = { ...base, extras: [] };
    const plain: EngineInput = {
      ...costs, materials: [{ key: "pla", label: "pla", pricePerKgCents: 12500, gramsMg: 50000 }],
      printSeconds: 10800, unitsPerPrint: 1, extras: [], quantity: 10,
    };
    const r = ok(i);
    expect(r.project).toEqual(computeCost(plain));
    expect(r.unitCost).toBe(computeCost(plain).unitCostCents);
    expect(r.unitCostAtQuantity).toBe(r.unitCost);
    expect(r.orderCost).toBe(computeCost(plain).batchCostCents);
  });

  test("3 plates, copies, shared filament merged by key, excluded plate ignored", () => {
    const i: QuoteInput = {
      ...base, extras: [],
      plates: [
        plate(1, [slot(10, "pla"), slot(5, "petg", 9000, 2)], 600),
        plate(2, [slot(20, "pla")], 1200, 2),
        plate(3, [slot(100, "pla")], 9999, 1, false),
      ],
    };
    const r = ok(i);
    expect(r.materials).toEqual([
      { key: "pla", label: "pla", pricePerKgCents: 12500, gramsMg: 50000 },
      { key: "petg", label: "petg", pricePerKgCents: 9000, gramsMg: 5000 },
    ]);
    expect(r.printSeconds).toBe(600 + 1200 * 2);
    expect(r.project).toEqual(computeCost({ ...costs, materials: r.materials, printSeconds: 3000, unitsPerPrint: 1, extras: [], quantity: 10 }));
    expect(r.plates.map((p) => [p.index, p.include, p.copies])).toEqual([[1, true, 1], [2, true, 2], [3, false, 1]]);
    expect(r.plates[1]!.totalMinor).toBe(r.plates[1]!.unitMinor * 2);
  });

  test("per-plate rows differ from the authoritative project total only by bounded rounding", () => {
    for (const g of [1.3, 7.7, 13.1, 50.5]) {
      const plates = [plate(1, [slot(g), slot(g / 3, "b", 8410)], 1111), plate(2, [slot(g * 2)], 2223, 3), plate(3, [slot(g / 7, "b", 8410)], 777, 2)];
      const r = ok({ ...base, extras: [], plates });
      const rows = r.plates.reduce((s, p) => s + p.totalMinor, 0);
      const copies = 1 + 3 + 2;
      // 8 lines, each rounds once (<= 0.5) per plate call and once for the project.
      expect(Math.abs(rows - r.unitCost)).toBeLessThanOrEqual(4 * copies + 4);
    }
  });
});

describe("quantity, sets and order-level costs", () => {
  test("extras scopes: piece, plate (x copies / unitsPerSet), order (amortized)", () => {
    const plates = [plate(1, [], 0), plate(2, [], 0, 2)];
    const ex = (per: "piece" | "plate" | "order", unitMinor: number) => ({ key: per, label: per, unitMinor, qtyE3: 1000, per });
    expect(ok({ ...base, plates, extras: [ex("piece", 200)] }).unitCostAtQuantity).toBe(200);
    expect(ok({ ...base, plates, extras: [ex("plate", 300)] }).unitCostAtQuantity).toBe(900);
    expect(ok({ ...base, plates, unitsPerSet: 3, quantity: 9, extras: [ex("plate", 300)] }).unitCostAtQuantity).toBe(300);
    const o = ok({ ...base, plates, extras: [ex("order", 500)] });
    expect(o.unitCost).toBe(0);
    expect(o.orderFixed).toBe(500);
    expect(o.unitCostAtQuantity).toBe(50);
    expect(o.lines.find((l) => l.id === "orderExtras")).toEqual({ id: "orderExtras", perPiece: 50, perOrder: 500, detail: [{ key: "order", minor: 500 }] });
  });

  test("setup amortization at q = 1, 3, 10, 100", () => {
    const i = (quantity: number) => costOnly(500, { quantity, setup: { ratePerHourMinor: 3000, minutes: 20 } });
    expect([1, 3, 10, 100].map((q) => ok(i(q)).unitCostAtQuantity)).toEqual([1500, 834, 600, 510]);
    expect(ok(i(10)).lines.find((l) => l.id === "setup")).toEqual({ id: "setup", perPiece: 100, perOrder: 1000 });
  });

  test("absorbed shipping is cost; customer shipping is a separate line outside the margin base", () => {
    const absorbed = ok(costOnly(500, { shipping: { mode: "absorbed", minor: 1200 } }));
    expect(absorbed.unitCostAtQuantity).toBe(620);
    expect(ch(absorbed).shippingCharged).toBe(0);
    expect(ch(absorbed).grandTotal).toBe(ch(absorbed).orderTotal);
    const customer = ok(costOnly(500, { shipping: { mode: "customer", minor: 1200 } }));
    const plain = ok(costOnly(500));
    expect(customer.unitCostAtQuantity).toBe(500);
    expect(ch(customer).price).toBe(ch(plain).price);
    expect(ch(customer).orderProfit).toBe(ch(plain).orderProfit);
    expect(ch(customer).shippingCharged).toBe(1200);
    expect(ch(customer).grandTotal).toBe(ch(customer).orderTotal + 1200);
    expect(customer.lines.some((l) => l.id === "shipping")).toBe(false);
  });

  test("quantity not divisible by unitsPerSet: order carries the leftover pieces", () => {
    const i: QuoteInput = { ...base, plates: [plate(1, [], 0)], unitsPerSet: 4, quantity: 10, extras: [{ key: "p", label: "p", unitMinor: 4000, qtyE3: 1000, per: "plate" }] };
    const r = ok(i);
    expect(r.runs).toBe(3);
    expect(r.piecesPrinted).toBe(12);
    expect(r.sparePieces).toBe(2);
    expect(ok({ ...i, quantity: 12 }).sparePieces).toBe(0);
    expect(r.unitCost).toBe(1000);
    expect(r.orderCost).toBe(12000);
    expect(r.unitCostAtQuantity).toBe(1200);
  });

  test("minimum order", () => {
    const r = ok(costOnly(500, { minOrderMinor: 50000 }));
    const c = ch(r);
    expect(c.price).toBe(5000);
    expect(c.fees).toBe(1000);
    expect(c.orderTotal).toBe(50000);
    expect(c.flags.minimumApplied).toBe(true);
    expect(c.orderProfit).toBe(c.net * 10 - r.orderCost);
    expect(ch(ok(costOnly(500, { minOrderMinor: 100 }))).flags.minimumApplied).toBe(false);
  });
});

describe("pricing", () => {
  const tiers = [{ minQty: 10, discountBp: 500 }, { minQty: 50, discountBp: 1000 }];
  test("discount tier boundaries: largest minQty <= q", () => {
    const at = (quantity: number) => ch(ok(costOnly(1000, { quantity, discountTiers: tiers }))).discountBp;
    expect([1, 9, 10, 49, 50, 500].map(at)).toEqual([0, 0, 500, 500, 1000, 1000]);
    const full = ch(ok(costOnly(1000, { quantity: 1 }))).price;
    expect(ch(ok(costOnly(1000, { quantity: 10, discountTiers: tiers }))).price).toBe(full - Math.round(full * 0.05));
  });

  test("discount pushing price below break-even is flagged, not hidden", () => {
    const c = ch(ok(costOnly(1000, { quantity: 10, targetMarginBp: 1000, discountTiers: [{ minQty: 10, discountBp: 3000 }] })));
    expect(c.flags.discounted).toBe(true);
    expect(c.flags.belowBreakEven).toBe(true);
    expect(c.price).toBeLessThan(c.breakEven);
    expect(c.profit).toBeLessThan(0);
    expect(c.marginBp).toBeLessThan(0);
    expect(c.flags.belowTarget).toBe(true);
    expect(c.flags.orderBelowBreakEven).toBe(true);
  });

  test("pretty rounding table: BRL (2 digits), JPY (0), KWD (3) at several magnitudes", () => {
    const cases: [string, number, Parameters<typeof prettyUp>[1], number][] = [
      ["any", 2187, "none", 2187],
      // round: up to 3 significant digits
      ["R$ 21,87", 2187, "round", 2190], ["¥2187", 2187, "round", 2190], ["¥218700", 218700, "round", 219000], ["KWD 0.989", 989, "round", 989],
      ["KWD 4.687", 4687, "round", 4690], ["R$ 0,87", 87, "round", 87], ["R$ 21,90", 2190, "round", 2190], ["¥9995", 9995, "round", 10000],
      // ending9: up to 2 significant digits, minus one minor unit
      ["R$ 21,87", 2187, "ending9", 2199], ["¥2187", 2187, "ending9", 2199], ["R$ 21,99", 2199, "ending9", 2199], ["R$ 22,00", 2200, "ending9", 2299],
      ["KWD 0.981", 981, "ending9", 989], ["KWD 4.687", 4687, "ending9", 4699], ["¥218700", 218700, "ending9", 219999], ["R$ 0,87", 87, "ending9", 87],
      ["¥10000", 10000, "ending9", 10999],
      // step5: up to a multiple of 5 at the 2nd significant digit
      ["R$ 21,87", 2187, "step5", 2200], ["R$ 22,03", 2203, "step5", 2250], ["KWD 0.989", 989, "step5", 990], ["KWD 4.687", 4687, "step5", 4700],
      ["¥218700", 218700, "step5", 220000], ["¥87", 87, "step5", 87], ["¥9987", 9987, "step5", 10000],
    ];
    for (const [label, p, mode, want] of cases) expect([label, mode, prettyUp(p, mode)]).toEqual([label, mode, want]);
  });

  test("pretty rounding is up-only, idempotent and bounded (<1% round, <5% step5, <10% ending9)", () => {
    const bound = { none: 0, round: 100, step5: 20, ending9: 10 } as const;
    for (let p = 1; p < 3_000_000; p = p + 1 + Math.floor(p / 37)) for (const mode of ["none", "round", "step5", "ending9"] as const) {
      const r = prettyUp(p, mode);
      expect(r).toBeGreaterThanOrEqual(p);
      expect(prettyUp(r, mode)).toBe(r);
      if (bound[mode]) expect((r - p) * bound[mode]).toBeLessThan(p);
      if (mode === "ending9" && p >= 100) expect(r % 10).toBe(9);
    }
  });

  test("pretty rounding never lowers profit, never drops below the target margin", () => {
    const taxed: QuoteChannel = { id: "taxed", name: "t", tiers: [{ minPriceCents: 0, pctBp: 1200, fixedCents: 300, shippingCents: 0 }], taxBp: 600, surchargeCents: 0 };
    for (const pretty of ["round", "ending9", "step5"] as const) {
      for (let c = 1; c < 40000; c += 137) {
        const raw = ch(ok(costOnly(c, { pretty: "none", channels: [taxed] })), "taxed");
        const nice = ch(ok(costOnly(c, { pretty, channels: [taxed] })), "taxed");
        expect(nice.price).toBeGreaterThanOrEqual(raw.price);
        expect(nice.profit).toBeGreaterThanOrEqual(raw.profit);
        expect(nice.profit * 10000).toBeGreaterThanOrEqual(4000 * nice.price);
        expect(nice.price).toBe(prettyUp(nice.price, pretty));
      }
    }
  });

  test("pretty rounding on a tiered channel never lowers profit and never lands in a dead zone", () => {
    // Costs whose raw 40% price sits in each tier and just below each tier boundary / dead zone
    // (2748: raw 7995 below the 8000 zone; 2977: raw just under 10000; 7154: raw just under 20000).
    const zones = deadZones(tieredFees);
    let jumps = 0;
    for (const c of [50, 2748, 2977, 7154, 8900]) {
      const raw = ch(ok(costOnly(c, { pretty: "none", channels: [tiered] })), "tiered");
      for (const pretty of ["round", "ending9", "step5"] as const) {
        const nice = ch(ok(costOnly(c, { pretty, channels: [tiered] })), "tiered");
        expect(nice.profit).toBeGreaterThanOrEqual(raw.profit);
        expect(zones.some((z) => nice.price >= z.fromCents && nice.price <= z.untilCents)).toBe(false);
        if (nice.flags.deadZoneJumped) jumps++;
      }
    }
    expect(jumps).toBeGreaterThan(0); // the fixture really crosses zones
  });

  test("discount landing in a tiered dead zone jumps past it, then re-applies pretty rounding", () => {
    const i = costOnly(3100, { channels: [tiered], quantity: 10, discountTiers: [{ minQty: 10, discountBp: 2500 }] });
    expect(ch(ok({ ...i, discountTiers: [] }), "tiered").price).toBe(11087);
    const discounted = 11087 - Math.round(11087 * 0.25); // 8315, inside 8000..8777
    expect(deadZones(tieredFees)[0]).toEqual({ fromCents: 8000, untilCents: 8777 });
    expect(discounted).toBe(8315);
    const c = ch(ok(i), "tiered");
    expect(c.price).toBe(8778);
    expect(c.flags.deadZoneJumped).toBe(true);
    expect(c.deadZones).toEqual(deadZones(tieredFees));
    expect(c.fees).toBe(feeFor(tieredFees, 8778).totalCents);
    const stepped = ch(ok({ ...i, pretty: "step5" }), "tiered"); // 8315 -> 8350 (zone) -> 8778 -> 8800
    expect(stepped.price).toBe(8800);
  });

  test("impossible margin is a typed channel problem, other channels still priced", () => {
    const cheap: QuoteChannel = { ...flat, tiers: [{ minPriceCents: 0, pctBp: 500, fixedCents: 0, shippingCents: 0 }] };
    const r = ok(costOnly(1375, { channels: [cheap, tiered], targetMarginBp: 8700 }));
    expect(r.channels.find((c) => c.id === "tiered")).toEqual({ id: "tiered", name: "Tiered", ok: false, problem: "margin_impossible" });
    expect(ch(r).ok).toBe(true);
  });

  test("search bound exceeded is a typed problem", () => {
    const steep: QuoteChannel = { id: "steep", name: "s", tiers: [{ minPriceCents: 0, pctBp: 9000, fixedCents: 0, shippingCents: 0 }], taxBp: 0, surchargeCents: 0 };
    const r = ok(costOnly(100, { channels: [steep], targetMarginBp: 999 }));
    expect(r.channels[0]).toEqual({ id: "steep", name: "s", ok: false, problem: "search_bound_exceeded" });
  });

  test("invalid channel maps the engine RangeError to a typed problem", () => {
    const r = ok(costOnly(100, { channels: [{ ...flat, tiers: [] }] }));
    expect(r.channels[0]).toMatchObject({ ok: false, problem: "channel_invalid" });
  });

  test("comparison sorted by order profit, batch table at each tier plus chosen quantity", () => {
    const r = ok(costOnly(1000, { channels: [tiered, flat], quantity: 25, setup: { ratePerHourMinor: 6000, minutes: 30 }, discountTiers: [{ minQty: 50, discountBp: 1000 }, { minQty: 10, discountBp: 500 }] }));
    expect(r.comparison.map((c) => c.id)).toEqual([...r.channels].filter((c) => c.ok).sort((a, b) => (b as ChannelOk).orderProfit - (a as ChannelOk).orderProfit).map((c) => c.id));
    expect(r.batchTable.map((b) => b.quantity)).toEqual([10, 25, 50]);
    expect(r.batchTable.map((b) => b.unitCostAtQuantity)).toEqual([1300, 1120, 1060]);
    expect(r.batchTable[1]!.channels).toEqual(r.channels);
  });

  test("one rule at every magnitude (works on minor units, so on any currency digits)", () => {
    for (const c of [700, 13000, 160000]) {
      const q = ch(ok(costOnly(c, { pretty: "ending9" })));
      expect(q.price % 10).toBe(9);
      expect(q.profit * 10000).toBeGreaterThanOrEqual(4000 * q.price);
    }
  });
});

describe("validation and purity", () => {
  test("typed problems with stable codes and paths", () => {
    expect(codes({ ...base, quantity: 0 })).toEqual(["quantity_min@quantity"]);
    expect(codes({ ...base, quantity: 1.5 })).toEqual(["not_integer@quantity"]);
    expect(codes({ ...base, plates: [{ ...base.plates[0]!, seconds: NaN }] })).toEqual(["not_integer@plates.0.seconds"]);
    expect(codes({ ...base, plates: [{ ...base.plates[0]!, slots: [{ ...slot(1), gramsMg: -5 }] }] })).toEqual(["negative@plates.0.slots.0.gramsMg"]);
    expect(codes({ ...base, plates: [{ ...base.plates[0]!, include: false }] })).toEqual(["no_plates@plates"]);
    expect(codes({ ...base, plates: [] })).toEqual(["no_plates@plates"]);
    expect(codes({ ...base, plates: [{ ...base.plates[0]!, copies: 0 }] })).toEqual(["copies_min@plates.0.copies"]);
    expect(codes({ ...base, unitsPerSet: 0 })).toEqual(["units_per_set_min@unitsPerSet"]);
    expect(codes({ ...base, discountTiers: [{ minQty: 1, discountBp: 10000 }] })).toEqual(["discount_range@discountTiers.0.discountBp"]);
    expect(codes({ ...base, discountTiers: [{ minQty: 0, discountBp: 100 }] })).toEqual(["quantity_min@discountTiers.0.minQty"]);
    expect(codes({ ...base, pretty: "x.99" as "round" })).toEqual(["invalid_option@pretty"]);
    expect(codes({ ...base, shipping: { mode: "split" as "customer", minor: 0 } })).toEqual(["invalid_option@shipping.mode"]);
    expect(codes({ ...base, extras: [{ ...pack, per: "box" as "piece" }] })).toEqual(["invalid_option@extras.0.per"]);
    expect(codes({ ...base, plates: [plate(1, [slot(1, "a", 100)], 0), plate(2, [slot(1, "a", 200)], 0)] })).toEqual(["material_price_conflict@plates.1.slots.0.pricePerKgMinor"]);
    expect(codes({ ...base, costs: { ...costs, failure: { ...costs.failure, bp: 10001 } } })).toEqual(["engine_range@costs"]);
  });

  test("inputs are not mutated (deep-frozen)", () => {
    const i = deepFreeze(structuredClone({ ...base, channels: [flat, tiered], plates: [plate(1, [slot(5)], 60, 2), plate(2, [slot(5)], 60, 1, false)], discountTiers: [{ minQty: 5, discountBp: 500 }], pretty: "ending9" as const }));
    const before = JSON.stringify(i);
    expect(() => computeQuote(i)).not.toThrow();
    expect(JSON.stringify(i)).toBe(before);
  });
});

// Regressions from the T2.6 engine review. co(c): zero machine costs, unit cost = one per-piece extra of c.
const zero: QuoteInput["costs"] = {
  machine: { wattsW10: 0, acquisitionCents: 0, lifetimeHours: 0 }, kwhE4: 0, failure: { bp: 0, mode: "markup", includesMachine: false },
  depreciationEnabled: false, maintenancePerHourCents: 0, labor: { perHourCents: 0, minutes: 0 }, fixedCostPerPrintHourCents: 0,
};
const co = (c: number, over: Partial<QuoteInput> = {}): QuoteInput => ({
  ...base, costs: zero, plates: [plate(1, [], 3600)], extras: [{ key: "c", label: "c", unitMinor: c, qtyE3: 1000, per: "piece" }], ...over,
});
const one = (pctBp: number, fixedCents = 0): QuoteChannel => ({ id: "one", name: "one", tiers: [{ minPriceCents: 0, pctBp, fixedCents, shippingCents: 0 }], taxBp: 0, surchargeCents: 0 });
const preset = (id: string): QuoteChannel => {
  const d = DEFAULT_CHANNELS.find((c) => c.id === id)!;
  const r = toChannelInput(d);
  if (!r.ok) throw new Error(id);
  return { id, name: d.name, ...r.input };
};

describe("review T2.6 regressions", () => {
  test("H1: plate rows carry plate-scoped extras only (scenario B)", () => {
    const r = ok({
      ...base, quantity: 10, setup: { ratePerHourMinor: 3000, minutes: 30 },
      costs: { ...zero, machine: { wattsW10: 1500, acquisitionCents: 0, lifetimeHours: 0 }, kwhE4: 10000, failure: { bp: 500, mode: "markup", includesMachine: false } },
      plates: [plate(1, [slot(20, "pla", 10000)], 3600, 2), plate(2, [slot(10, "pla", 10000), slot(5, "petg", 12000)], 1800), plate(3, [slot(2, "petg", 12000)], 900, 3)],
      extras: [
        { key: "box", label: "box", unitMinor: 150, qtyE3: 1000, per: "piece" },
        { key: "mag", label: "mag", unitMinor: 50, qtyE3: 2000, per: "plate" },
        { key: "lbl", label: "lbl", unitMinor: 500, qtyE3: 1000, per: "order" },
      ],
    });
    expect(r.unitCost).toBe(1465);
    const rows = r.plates.reduce((s, p) => s + p.totalMinor, 0);
    expect(Math.abs(rows - (r.unitCost - 150))).toBeLessThanOrEqual(4 * 6 + 4);
  });

  test("M4: a plate row is per plate copy (one set), unitCost is per piece", () => {
    const r = ok({ ...base, costs: zero, unitsPerSet: 4, quantity: 4, extras: [], plates: [plate(1, [slot(100, "pla", 10000)], 3600)] });
    expect(r.unitCost).toBe(250);
    expect(r.plates[0]!.unitMinor).toBe(1000);
  });

  test("H2: minimum order re-prices through the channel's fees", () => {
    const t = ch(ok(co(500, { channels: [tiered], minOrderMinor: 50000 })), "tiered");
    expect([t.price, t.fees, t.net, t.orderTotal, t.orderProfit]).toEqual([5000, 1450, 3550, 50000, 30500]);
    expect(t.flags.minimumApplied).toBe(true);
    const direct = ch(ok(co(500, { channels: [preset("direct")], minOrderMinor: 50000 })), "direct");
    expect([direct.price, direct.orderTotal, direct.orderProfit]).toEqual([5000, 50000, 45000]);
    // ceil(84000 / 10) = 8400 sits in the 8000..8777 dead zone: jump past it.
    const zoned = ch(ok(co(500, { channels: [tiered], minOrderMinor: 84000 })), "tiered");
    expect([zoned.price, zoned.orderTotal]).toEqual([8778, 87780]);
  });

  test("H3: pretty rounding takes the first pretty price that meets the target", () => {
    // raw 989 (fee 148, profit 198 = 20.02%); 990 still earns 198 and meets 20%.
    expect(ch(ok(co(643, { channels: [one(1500)], targetMarginBp: 2000, pretty: "step5" })), "one").price).toBe(990);
    for (const pct of [500, 1500, 2000]) for (const target of [2000, 4000, 7000]) for (const pretty of ["round", "ending9", "step5"] as const) {
      for (let c = 13; c < 200000; c += 9973) {
        const chan = one(pct), raw = suggestPrice(chan, c, target)!, cand = prettyUp(raw, pretty);
        const profit = (p: number) => p - feeFor(chan, p).totalCents - c;
        if (profit(cand) * 10000 < target * cand || profit(cand) < profit(raw)) continue;
        expect([pct, target, pretty, c, ch(ok(co(c, { channels: [chan], targetMarginBp: target, pretty })), "one").price]).toEqual([pct, target, pretty, c, cand]);
      }
    }
  });

  test("L2: zero unit cost prices on percentage channels", () => {
    for (const chan of [tiered, one(2000)]) expect(ch(ok(co(0, { channels: [chan], pretty: "round" })), chan.id).price).toBeGreaterThan(0);
  });

  test("M1: wide dead zone in a 0-digit currency is priced, not refused", () => {
    const krw: QuoteChannel = { id: "krw", name: "k", taxBp: 0, surchargeCents: 0, tiers: [{ minPriceCents: 0, pctBp: 1000, fixedCents: 0, shippingCents: 0 }, { minPriceCents: 20000, pctBp: 1000, fixedCents: 3000, shippingCents: 0 }] };
    const c = ch(ok(co(15000, { channels: [krw] })), "krw");
    expect(c.deadZones).toEqual(deadZones(krw));
    expect(c.deadZones[0]!.untilCents - c.deadZones[0]!.fromCents).toBeGreaterThan(3000);
    expect(c.profit * 10000).toBeGreaterThanOrEqual(4000 * c.price);
  });

  test("M2: effective discount reflects what the customer pays", () => {
    const c = ch(ok(co(1387, { pretty: "ending9", quantity: 10, discountTiers: [{ minQty: 10, discountBp: 100 }] })));
    expect(c.price).toBe(ch(ok(co(1387, { pretty: "ending9", quantity: 10 }))).price);
    expect(c.discountBp).toBe(100);
    expect(c.effectiveDiscountBp).toBe(0);
    expect(c.flags.discounted).toBe(false);
    expect(c.flags.belowTarget).toBe(false);
  });

  test("M3: per-piece cost rounds up so pricing at it never loses money on the order", () => {
    const r = ok(co(100, { targetMarginBp: 0, extras: [{ key: "p", label: "p", unitMinor: 100, qtyE3: 1000, per: "piece" }, { key: "o", label: "o", unitMinor: 4, qtyE3: 1000, per: "order" }] }));
    expect(r.unitCostAtQuantity).toBe(101);
    const c = ch(r);
    expect(c.orderProfit).toBeGreaterThanOrEqual(0);
    expect(c.flags.orderBelowBreakEven).toBe(false);
  });

  test("own margin math equals the engine's marginAt at every tier boundary and dead-zone edge", () => {
    // Prices forced through the minimum order (q 10, target 0, pretty none). Each tier start, the price
    // before it, both edges of each dead zone (zone prices are quoted as the first price past the zone).
    const zones = deadZones(tieredFees);
    const edges = [1, 2, 899, 900, 901, 7999, 8000, 8777, 8778, 9999, 10000, 10463, 10464, 19999, 20000, 20695, 20696, 29999];
    expect(zones.flatMap((z) => [z.fromCents, z.untilCents, z.untilCents + 1]).every((p) => edges.includes(p))).toBe(true);
    const expected = (p: number) => zones.find((z) => p >= z.fromCents && p <= z.untilCents)?.untilCents ?? p - 1;
    // Cost 0 reaches every edge (break-even 1). Cost 5000 adds a real cost at the zone exits and the
    // edges just before them; below its break-even the quote is the same settled price again.
    const cases: [number, number[]][] = [[0, edges], [5000, [7999, 8778, 9999, 10464, 19999, 20696].filter((x) => x >= breakEven(tieredFees, 5000)!)]];
    for (const [c, prices] of cases) for (const p of prices) {
      const q = ch(ok(co(c, { channels: [tiered], targetMarginBp: 0, minOrderMinor: p * 10 })), "tiered");
      expect([c, p, q.price]).toEqual([c, p, expected(p) + 1]);
      const m = marginAt(tiered, c, q.price);
      expect([c, p, q.profit, q.marginBp]).toEqual([c, p, m.profitCents, m.marginBp]);
    }
    // Negative margins (engine rounds half-up toward +inf): deep discounts below break-even.
    for (const [c, bp] of [[500, 9000], [5000, 6000], [5000, 9900]]) {
      const q = ch(ok(co(c!, { channels: [tiered], discountTiers: [{ minQty: 1, discountBp: bp! }] })), "tiered");
      expect(q.profit).toBeLessThan(0);
      const m = marginAt(tiered, c!, q.price);
      expect([q.profit, q.marginBp]).toEqual([m.profitCents, m.marginBp]);
    }
  });

  test("M8: customer-paid shipping carries no channel fee; fees are on item price only", () => {
    const a = ch(ok(co(800, { channels: [tiered], shipping: { mode: "customer", minor: 2500 } })), "tiered");
    const b = ch(ok(co(800, { channels: [tiered] })), "tiered");
    expect([a.price, a.fees, a.net, a.orderProfit]).toEqual([b.price, b.fees, b.net, b.orderProfit]);
    expect(a.grandTotal - b.grandTotal).toBe(2500);
  });

  test("L3: overflow is a typed problem", () => {
    expect(codes(co(1000, { quantity: 2 ** 50 }))).toEqual(["overflow@quantity"]);
  });

  test("L4: missing structure is a typed problem, not a TypeError", () => {
    const bad = (o: Record<string, unknown>) => codes({ ...base, ...o } as unknown as QuoteInput);
    expect(bad({ plates: undefined })).toEqual(["invalid_option@plates"]);
    expect(bad({ extras: null })).toEqual(["invalid_option@extras"]);
    expect(bad({ costs: undefined })).toEqual(["invalid_option@costs"]);
    expect(bad({ shipping: undefined })).toEqual(["invalid_option@shipping"]);
    expect(bad({ channels: [null] })).toEqual(["invalid_option@channels.0"]);
    expect(bad({ discountTiers: [null] })).toEqual(["invalid_option@discountTiers.0"]);
    expect(bad({ costs: { ...costs, failure: undefined } })).toEqual(["invalid_option@costs.failure"]);
    expect(bad({ plates: [{ ...base.plates[0]!, slots: undefined }] })).toEqual(["invalid_option@plates.0.slots"]);
  });

  test("L5: an excluded plate may have 0 copies", () => {
    expect(codes({ ...base, plates: [...base.plates, plate(2, [slot(1)], 60, 0, false)] })).toEqual([]);
  });
});

describe("re-review items", () => {
  test("wide zones (tiered fixture x250) fail fast with search_bound_exceeded", () => {
    const x250: QuoteChannel = { ...tiered, id: "x250", tiers: tieredFees.tiers.map((t) => ({ minPriceCents: t.minPriceCents * 250, pctBp: t.pctBp, fixedCents: t.fixedCents * 250, shippingCents: t.shippingCents * 250 })) };
    const zoneWidth = deadZones(tieredFees).reduce((s, z) => s + z.untilCents - z.fromCents + 1, 0) * 250;
    expect(zoneWidth).toBeGreaterThan(50_000);
    const r = ok(co(625000, { channels: [x250], pretty: "ending9", discountTiers: Array.from({ length: 8 }, (_, k) => ({ minQty: 2 + k, discountBp: 100 * k })) }));
    expect(r.channels[0]).toEqual({ id: "x250", name: "Tiered", ok: false, problem: "search_bound_exceeded" });
    expect(r.batchTable.every((b) => b.channels.every((c) => !c.ok && c.problem === "search_bound_exceeded"))).toBe(true);
  });

  test("minimum-order price gets the selected pretty rounding, then dead-zone escape", () => {
    const c = ch(ok(co(500, { minOrderMinor: 50010, pretty: "round" })));
    expect([c.price, c.orderTotal, c.flags.minimumApplied]).toEqual([5010, 50100, true]);
    // ceil(84000/10) = 8400 -> step5 8400 (zone 8000..8777) -> 8778 -> 8800
    const z = ch(ok(co(500, { channels: [tiered], minOrderMinor: 84000, pretty: "step5" })), "tiered");
    expect(z.price).toBe(8800);
  });
});

describe("exact boundaries of the order flags", () => {
  const zeroFee: QuoteChannel = { id: "zero", name: "Zero", tiers: [{ minPriceCents: 0, pctBp: 0, fixedCents: 0, shippingCents: 0 }], taxBp: 0, surchargeCents: 0 };
  const chan = (i: QuoteInput): ChannelOk => ok(i).channels[0] as ChannelOk;
  test("a minimum order equal to the price does not raise the minimum flag; one more unit does", () => {
    const p = chan(costOnly(1000, { quantity: 1 })).price;
    expect(chan(costOnly(1000, { quantity: 1, minOrderMinor: p })).flags.minimumApplied).toBe(false);
    expect(chan(costOnly(1000, { quantity: 1, minOrderMinor: p })).price).toBe(p);
    expect(chan(costOnly(1000, { quantity: 1, minOrderMinor: p + 1 })).flags.minimumApplied).toBe(true);
    expect(chan(costOnly(1000, { quantity: 1, minOrderMinor: p - 1 })).flags.minimumApplied).toBe(false);
  });
  test("a profit of exactly 0 is not below break-even; a loss is", () => {
    const even = chan(costOnly(1000, { quantity: 1, channels: [zeroFee], targetMarginBp: 0 }));
    expect(even.profit).toBe(0);
    expect(even.flags.belowBreakEven).toBe(false);
    expect(even.flags.orderBelowBreakEven).toBe(false);
    const loss = chan(costOnly(1000, { quantity: 1, channels: [zeroFee], targetMarginBp: 0, discountTiers: [{ minQty: 1, discountBp: 500 }] }));
    expect(loss.flags.belowBreakEven).toBe(loss.profit < 0);
    // an order whose per-piece profit is 0 but whose order costs are not covered
    const orderLoss = chan(costOnly(1000, { quantity: 1, channels: [zeroFee], targetMarginBp: 0, extras: [{ key: "c", label: "c", unitMinor: 1000, qtyE3: 1000, per: "piece" }, { key: "o", label: "o", unitMinor: 500, qtyE3: 1000, per: "order" }] }));
    expect(orderLoss.flags.orderBelowBreakEven).toBe(orderLoss.orderProfit < 0);
  });
});
