import { describe, expect, test } from "vitest";
import { deriveQuote, effectiveDefaults, slotKey, type DeriveInput } from "../src/state/derive";
import { defaultSettings, keepPlateControls, mergeSettings, newDraft } from "../src/state/defaults";
import { HOST, plates, settings, spooler, spoolman } from "../src/mock/fixtures";
import { buildScenario } from "../src/mock/scenarios";
import type { Draft, HostPlate, Settings } from "../src/state/types";

const input = (over: Partial<DeriveInput> = {}): DeriveInput => {
  const s = settings();
  return { settings: s, draft: newDraft(s), plates: plates(), host: HOST, spoolman: spoolman(), spooler: spooler(), currency: "BRL", ...over };
};

describe("deriveQuote: host plates to engine input", () => {
  test("ok fixture prices on the selected channel", () => {
    const d = deriveQuote(input());
    expect(d.result.ok).toBe(true);
    expect(d.selectedChannelId).toBe("store");
    expect(d.selected?.ok).toBe(true);
    expect(d.notCounted).toEqual([]);
    expect(d.digits).toBe(2);
  });
  test("slot matching, keys, grams in mg and price per kg in minor units", () => {
    const d = deriveQuote(input());
    const [pla, petg] = d.slotMatches[0]!;
    expect(pla?.source).toBe("spooler");
    expect(petg?.source).toBe("name");
    expect(pla?.key).toMatch(/^sm:3:/);
    const q = d.quoteInput.plates[0]!;
    expect(q.seconds).toBe(8040);
    expect(q.slots[0]!.gramsMg).toBe(88000);
    expect(q.slots[0]!.pricePerKgMinor).toBe(Math.round((pla?.pricePerKg ?? 0) * 100));
    expect(q.slots[0]!.label).toBe("Generic PLA @U1");
  });
  test("costs: energy kWh to E4, watts to W10, printer profile, labor", () => {
    const c = deriveQuote(input()).quoteInput.costs;
    expect(c.kwhE4).toBe(9500); // 0.95 x 10^(2+2)
    expect(c.machine).toEqual({ wattsW10: 1200, acquisitionCents: 450000, lifetimeHours: 5000 });
    expect(c.labor).toEqual({ perHourCents: 3000, minutes: 10 });
    expect(c.depreciationEnabled).toBe(true);
  });
  test("JPY digits flow through money conversion", () => {
    const s = settings();
    const d = deriveQuote(input({ currency: "JPY", settings: { ...s, defaults: { ...s.defaults, energyPerKwh: "30" } } }));
    expect(d.digits).toBe(0);
    expect(d.quoteInput.costs.kwhE4).toBe(3000); // 30 yen x 10^(0+2)
  });
  test("saved watts win over the printer match; unknown model falls back to the match", () => {
    expect(deriveQuote(input()).printer).toMatchObject({ watts: 120, source: "saved", model: "Snapmaker U1" });
    const s = settings({ printers: {} });
    expect(deriveQuote(input({ settings: s })).printer.source).toBe("match");
  });
  test("shipping modes: none maps to customer 0", () => {
    const s = settings();
    const withShip = (shipping: Settings["defaults"]["shipping"]) => deriveQuote(input({ settings: { ...s, defaults: { ...s.defaults, shipping } } })).quoteInput.shipping;
    expect(withShip({ mode: "none", minor: 999 })).toEqual({ mode: "customer", minor: 0 });
    expect(withShip({ mode: "customer", minor: 2500 })).toEqual({ mode: "customer", minor: 2500 });
    expect(withShip({ mode: "absorbed", minor: 2500 })).toEqual({ mode: "absorbed", minor: 2500 });
  });
  test("draft overrides beat defaults and change the price", () => {
    const base = deriveQuote(input());
    const s = settings();
    const over = deriveQuote(input({ draft: { ...newDraft(s), overrides: { targetMarginBp: 5000 } } }));
    expect(effectiveDefaults(s.defaults, { targetMarginBp: 5000 }).targetMarginBp).toBe(5000);
    expect(over.quoteInput.targetMarginBp).toBe(5000);
    expect(over.selected?.ok && base.selected?.ok && over.selected.price > base.selected.price).toBe(true);
  });
  test("plate controls: excluded plate and copies reach the engine", () => {
    const s = settings();
    const draft: Draft = { ...newDraft(s), plates: { 1: { include: false, copies: 1 }, 0: { include: true, copies: 2 } } };
    const q = deriveQuote(input({ draft })).quoteInput.plates;
    expect(q.map((p) => [p.include, p.copies])).toEqual([[true, 2], [false, 1], [true, 1]]);
  });
  test("units per set 4 and quantity 10 gives 2 spare pieces", () => {
    const s = settings();
    const r = deriveQuote(input({ draft: { ...newDraft(s), unitsPerSet: 4, quantity: 10 } })).result;
    expect(r.ok && r.sparePieces).toBe(2);
  });
  test("compared channels plus the selected one are priced; invalid channels are skipped and reported", () => {
    const s = settings();
    const bad = { id: "bad", name: "Bad", taxBp: 9500, surchargeMinor: 0, tiers: [{ minMinor: 0, pctBp: 0, fixedMinor: 0, shippingMinor: 0 }] };
    const d = deriveQuote(input({ settings: { ...s, channels: [...s.channels, bad], comparedChannelIds: ["direct", "store", "bad"] } }));
    expect(d.quoteInput.channels.map((c) => c.id)).toEqual(["direct", "store"]);
    expect(d.skippedChannels.map((c) => c.id)).toEqual(["bad"]);
    expect(d.result.ok && d.result.channels).toHaveLength(2);
  });
  test("unknown draft channel falls back to the default channel", () => {
    const s = settings();
    expect(deriveQuote(input({ draft: { ...newDraft(s), channelId: "gone" } })).selectedChannelId).toBe("store");
  });
  test("impossible margin comes back as a channel problem, not a throw", () => {
    const { state } = buildScenario("impossible");
    const d = deriveQuote(input({ settings: state.settings! }));
    expect(d.result.ok).toBe(true);
    expect(d.selected).toMatchObject({ ok: false, problem: "margin_impossible" });
  });
  test("no included plate gives a no_plates problem keyed by path", () => {
    const s = settings();
    const draft: Draft = { ...newDraft(s), plates: { 0: { include: false, copies: 1 }, 1: { include: false, copies: 1 }, 2: { include: false, copies: 1 } } };
    const d = deriveQuote(input({ draft }));
    expect(d.result.ok).toBe(false);
    expect(Object.values(d.fieldErrors)).toContain("no_plates");
  });
  test("out of range quantity is a field error, never a throw", () => {
    const s = settings();
    const d = deriveQuote(input({ draft: { ...newDraft(s), quantity: 0 } }));
    expect(d.result.ok).toBe(false);
    expect(d.fieldErrors["quantity"]).toBe("quantity_min");
  });
});

describe("price sources and not-counted items", () => {
  test("Spoolman unset: preset prices, source preset", () => {
    const d = deriveQuote(input({ spoolman: { filaments: [], spools: [] }, spooler: null }));
    expect(d.slotMatches[0]!.map((v) => v.source)).toEqual(["preset", "preset"]);
    expect(d.slotMatches[0]![0]!.key).toBe("preset:Generic PLA @U1");
    expect(d.quoteInput.plates[0]!.slots[0]!.pricePerKgMinor).toBe(2400);
  });
  test("slot without any price: source none, counted as 0, and the engine still prices", () => {
    const { state } = buildScenario("unmatched");
    const d = deriveQuote(input({ plates: state.plates }));
    const v = d.slotMatches[2]![0]!;
    expect(v.source).toBe("none");
    expect(v.key).toBe("none:House brand PLA");
    expect(d.quoteInput.plates[2]!.slots[0]!.pricePerKgMinor).toBe(0);
    expect(d.result.ok).toBe(true);
  });
  test("a typed manual price replaces none and preset sources", () => {
    const { state } = buildScenario("unmatched");
    const s = settings({ manualPrices: { "House brand PLA": 12345 } });
    const v = deriveQuote(input({ plates: state.plates, settings: s })).slotMatches[2]![0]!;
    expect(v).toMatchObject({ source: "manual", key: "manual:House brand PLA", pricePerKg: 123.45, priceSource: "manual" });
    // but never replaces a Spoolman match
    const pla = deriveQuote(input({ settings: settings({ manualPrices: { "Generic PLA @U1": 1 } }) })).slotMatches[0]![0]!;
    expect(pla.source).toBe("spooler");
  });
  test("no built-in values: energy and labor are listed; a known currency still has printer wear", () => {
    const s = defaultSettings("BRL", "Direct");
    const d = deriveQuote(input({ settings: s, draft: newDraft(s) }));
    expect(d.notCounted.map((n) => n.kind)).toEqual(["energy", "labor"]);
    expect(deriveQuote(input({ settings: s, draft: newDraft(s), currency: "JPY" })).notCounted.map((n) => n.kind)).toEqual(["energy", "labor", "wear"]);
  });
  test("built-in values for BRL: nothing left out, printer R$5.000 over 5.000 h, 100% markup", () => {
    const s = defaultSettings(null, "Direct", "BRL");
    const d = deriveQuote(input({ settings: { ...s, printers: {} }, draft: newDraft(s) }));
    expect(d.notCounted).toEqual([]);
    expect(d.quoteInput.costs.machine).toMatchObject({ acquisitionCents: 500000, lifetimeHours: 5000 });
    expect([s.defaults.energyPerKwh, s.defaults.laborPerHourMinor, d.quoteInput.targetMarginBp]).toEqual(["0.95", 3000, 5000]);
  });
  test("depreciation off removes the wear item", () => {
    const s = defaultSettings("BRL", "Direct");
    const off = { ...s, defaults: { ...s.defaults, depreciationEnabled: false } };
    expect(deriveQuote(input({ settings: off, draft: newDraft(off) })).notCounted.map((n) => n.kind)).toEqual(["energy", "labor"]);
  });
  test("unknown seconds and grams enter as 0 and are named, never silently zero", () => {
    const { state } = buildScenario("unknown");
    const d = deriveQuote(input({ plates: state.plates, host: state.host }));
    expect(d.quoteInput.plates[0]!.seconds).toBe(0);
    expect(d.quoteInput.plates[0]!.slots[1]!.gramsMg).toBe(0);
    expect(d.notCounted).toContainEqual({ kind: "time", plate: 1 });
    expect(d.notCounted).toContainEqual({ kind: "grams", plate: 1, slot: 2 });
  });
  test("excluded plates do not add not-counted items", () => {
    const { state } = buildScenario("unknown");
    const s = settings();
    const draft: Draft = { ...newDraft(s), plates: { 0: { include: false, copies: 1 } } };
    expect(deriveQuote(input({ plates: state.plates, host: state.host, draft })).notCounted.some((n) => n.kind === "time")).toBe(false);
  });
});

describe("frozen (saved) plates", () => {
  test("the snapshot, not live plates, feeds the engine", () => {
    const live = deriveQuote(input());
    const s = settings();
    const frozen: Draft = { ...newDraft(s), frozenPlates: live.snapshots };
    const d = deriveQuote(input({ draft: frozen, plates: [] as HostPlate[] }));
    expect(d.result.ok).toBe(true);
    expect(d.selected?.ok && live.selected?.ok && d.selected.price).toBe(live.selected?.ok ? live.selected.price : -1);
    expect(d.slotMatches[0]![0]!.slot.preset).toBe("Generic PLA @U1");
    expect(d.notCounted).toEqual([]);
  });
});

describe("helpers", () => {
  test("slotKey rules", () => {
    expect(slotKey("override", 7, 14, "p")).toBe("sm:7:14");
    expect(slotKey("spooler", 3, null, "p")).toBe("sm:3:0");
    expect(slotKey("preset", null, null, "PLA")).toBe("preset:PLA");
    expect(slotKey("none", null, null, "PLA")).toBe("none:PLA");
    expect(slotKey("manual", null, null, "PLA")).toBe("manual:PLA");
  });
  test("keepPlateControls drops vanished indices", () => {
    const s = settings();
    const d: Draft = { ...newDraft(s), plates: { 0: { include: false, copies: 3 }, 9: { include: true, copies: 1 } } };
    expect(keepPlateControls(d, plates())).toEqual({ 0: { include: false, copies: 3 } });
  });
  test("mergeSettings fills what an older file lacks and keeps channels valid", () => {
    const base = defaultSettings("USD", "Direct");
    const m = mergeSettings({ onboarded: true, defaults: { targetMarginBp: 4000 } as Settings["defaults"], defaultChannelId: "nope" }, base);
    expect(m.defaults.targetMarginBp).toBe(4000);
    expect(m.defaults.failureBp).toBe(500);
    expect(m.defaultChannelId).toBe("direct");
    expect(m.sheet.validityDays).toBe(15);
  });
  test("default settings: one zero-fee Direct channel, onboarding pending", () => {
    const s = defaultSettings(null, "Venda direta");
    expect(s.channels).toHaveLength(1);
    expect(s.channels[0]).toMatchObject({ id: "direct", name: "Venda direta" });
    expect(s.onboarded).toBe(false);
    expect(s.defaults.pretty).toBe("round");
  });
});
