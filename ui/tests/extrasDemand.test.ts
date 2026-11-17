// F06: the stock warning counts what the whole quote consumes of each catalog item: every scope, spares, copies, rounds and
// every row of the same item together. Nothing is deducted anywhere.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick, type App } from "vue";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({})) }));
import { call } from "../src/bridge";
import ExtrasEditor from "../src/components/costs/ExtrasEditor.vue";
import { setLocale } from "../src/i18n";
import { buildFlags } from "../src/components/price/flagList";
import PriceFlags from "../src/components/price/PriceFlags.vue";
import { catalogItemOf, demandByItem, filamentShortages, needOf, planOf } from "../src/state/extrasDemand";
import type { Derived } from "../src/state/derive";
import { patchDraft, store } from "../src/state/store";
import type { CatalogExtra, QuoteExtra } from "../src/state/types";
import { load, mount, txt } from "./priceKit";

const mounted: { app: App; root: HTMLElement }[] = [];
const flush = async () => { for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve(); } };
beforeEach(() => { setLocale("en"); vi.mocked(call).mockClear(); });
afterEach(() => { for (const m of mounted.splice(0)) { m.app.unmount(); m.root.remove(); } });

const item = (key: string, label: string, stockE3: number | null): CatalogExtra => ({ key, label, unitMinor: 100, qtyE3: 1000, per: "plate", ...(stockE3 === null ? {} : { stockE3 }) });
const row = (key: string, label: string, per: QuoteExtra["per"], qtyE3 = 1000, catalogKey?: string): QuoteExtra => ({ key, label, unitMinor: 100, qtyE3, per, ...(catalogKey ? { catalogKey } : {}) });
const plan = { pieces: 6, copies: 2, runs: 3 };

describe("F06: demand", () => {
  test("needOf by scope: every printed piece, copies x runs, once", () => {
    expect(needOf(row("a", "x", "piece", 1000), plan)).toBe(6000);
    expect(needOf(row("a", "x", "plate", 1000), plan)).toBe(6000); // 2 copies x 3 runs
    expect(needOf(row("a", "x", "order", 1000), plan)).toBe(1000);
  });
  test("planOf reads the same production the engine prices: spares, copies, excluded plates", () => {
    const p = (include: boolean, copies: number) => ({ index: 0, include, copies, seconds: 1, slots: [] });
    expect(planOf({ plates: [p(true, 2), p(true, 1), p(false, 9)], quantity: 5, unitsPerSet: 2 })).toEqual({ pieces: 6, copies: 3, runs: 3 });
    expect(planOf({ plates: [p(true, 1)], quantity: 1, unitsPerSet: undefined })).toEqual({ pieces: 1, copies: 1, runs: 1 });
  });
  test("rows of the same item add up; rows of other items do not mix", () => {
    const cat = [item("c1", "Magnet", 5000), item("c2", "Box", 1000)];
    const d = demandByItem([row("1", "Magnet", "plate"), row("2", "Magnet", "order", 2000), row("3", "Box", "order")], cat, plan);
    expect([...d.entries()]).toEqual([["c1", 8000], ["c2", 1000]]);
  });
  test("identity: a catalog key survives renaming either side; a legacy row matches by name", () => {
    const cat = [item("c1", "Magnet", 1)];
    expect(catalogItemOf(row("1", "Renamed row", "plate", 1000, "c1"), cat)?.key).toBe("c1");
    expect(catalogItemOf(row("1", "Magnet", "plate", 1000, "c1"), [item("c1", "Magnet v2", 1)])?.key).toBe("c1"); // catalog item renamed
    expect(catalogItemOf(row("1", "Magnet", "plate"), cat)?.key).toBe("c1"); // saved before keys existed
    expect(catalogItemOf(row("1", "Other", "plate"), cat)).toBeUndefined();
    expect(catalogItemOf(row("1", "Magnet", "plate", 1000, "gone"), cat)?.key).toBe("c1"); // dangling key falls back to the name
    // two catalog items with the same name: the key decides, the first by name only for legacy rows
    const twins = [item("a", "Same", 1), item("b", "Same", 1)];
    expect(catalogItemOf(row("1", "Same", "plate", 1000, "b"), twins)?.key).toBe("b");
  });
});

describe("F06: ExtrasEditor warning", () => {
  const setup = (rows: QuoteExtra[], stock: number | null, over: Partial<ReturnType<typeof item>> = {}) => {
    load("noSpoolman");
    store.settings = { ...store.settings, extrasCatalog: [{ ...item("c1", "Magnet", stock), ...over }] };
    patchDraft({ extras: rows, quantity: 1 });
  };
  const lines = (root: HTMLElement) => [...root.querySelectorAll(".xstock")].map((e) => [...e.children].map((c) => txt(c)).join(" | "));

  test("a per-plate extra with stock 0 over three plates warns (it used to show 'In stock: 0' alone)", async () => {
    setup([row("x", "Magnet", "plate")], 0);
    patchDraft({ plates: { 0: { include: true, copies: 1 }, 1: { include: true, copies: 1 }, 2: { include: true, copies: 1 } } });
    const m = mount(ExtrasEditor); mounted.push(m); await flush();
    expect(m.root.querySelector(".xstock .short")).not.toBeNull();
    expect(lines(m.root)).toEqual(["In stock: 0 | Needs 3, 0 in stock"]);
  });
  test("copies, rounds and spares count: 2 copies of one plate, 5 pieces in sets of 2", async () => {
    setup([row("x", "Magnet", "plate")], 5000);
    patchDraft({ quantity: 5, unitsPerSet: 2, plates: { 0: { include: true, copies: 2 }, 1: { include: false, copies: 4 }, 2: { include: false, copies: 4 } } });
    const m = mount(ExtrasEditor); mounted.push(m); await flush();
    expect(lines(m.root)).toEqual(["In stock: 5 | Needs 6, 5 in stock"]); // 1 x 2 copies x 3 runs
  });
  test("two rows of the same item each below the stock still warn together", async () => {
    setup([row("a", "Magnet", "order", 3000, "c1"), row("b", "Magnet", "order", 3000, "c1")], 5000);
    const m = mount(ExtrasEditor); mounted.push(m); await flush();
    expect(lines(m.root)).toEqual(["In stock: 5 | Needs 6, 5 in stock", "In stock: 5 | Needs 6, 5 in stock"]);
  });
  test("renaming the row keeps the link to the catalog item", async () => {
    setup([row("a", "My own name", "order", 9000, "c1")], 5000);
    const m = mount(ExtrasEditor); mounted.push(m); await flush();
    expect(lines(m.root)).toEqual(["In stock: 5 | Needs 9, 5 in stock"]);
  });
  test("an untracked item shows nothing, and nothing is ever deducted or written outside the quote", async () => {
    setup([row("a", "Magnet", "plate")], null);
    const m = mount(ExtrasEditor); mounted.push(m); await flush();
    expect(lines(m.root)).toEqual([]);
    setup([row("a", "Magnet", "plate", 9000)], 1000);
    const m2 = mount(ExtrasEditor); mounted.push(m2); await flush();
    expect(store.settings.extrasCatalog[0]!.stockE3).toBe(1000);
    expect(vi.mocked(call).mock.calls.filter(([cmd]) => cmd !== "get_state")).toEqual([]);
  });
});

describe("filament stock: what the quote prints against what Spoolman says is left", () => {
  const view = (_plate: number, n: number, filamentId: number | null) => ({ slot: { n }, filamentId });
  const plate = (index: number, include: boolean, copies: number, grams: number[]) => ({ index, include, copies, slots: grams.map((g, k) => ({ gramsMg: g * 1000, n: k + 1 })) });
  const data = {
    filaments: [{ id: 1, name: "Galaxy PLA" }, { id: 2, name: "PETG" }, { id: 3, name: "TPU" }],
    spools: [
      { id: 10, filamentId: 1, archived: false, remainingWeight: 100 },
      { id: 11, filamentId: 1, archived: false, remainingWeight: 50.5 },
      { id: 12, filamentId: 1, archived: true, remainingWeight: 900 }, // archived: not on hand
      { id: 20, filamentId: 2, archived: false, remainingWeight: 1000 },
      { id: 30, filamentId: 3, archived: false, remainingWeight: null }, // unknown: no claim either way
    ],
  };
  test("sums every included plate copy and run per filament, archived spools do not count", () => {
    const input = { plates: [plate(0, true, 2, [30, 40]), plate(1, false, 1, [500]), plate(2, true, 1, [10])], quantity: 3, unitsPerSet: 2 }; // 2 runs
    const matches = { 0: [view(0, 1, 1), view(0, 2, 2)], 1: [view(1, 1, 1)], 2: [view(2, 1, 1)] };
    // filament 1: (30 g x 2 copies + 10 g) x 2 runs = 140 g > 150.5 g? no. filament 2: 40 x 2 x 2 = 160 g of 1000 g
    expect(filamentShortages(input, matches, data)).toEqual([]);
    const more = { ...input, quantity: 5 }; // 3 runs: filament 1 needs 210 g of 150.5 g
    expect(filamentShortages(more, matches, data)).toEqual([{ filamentId: 1, name: "Galaxy PLA", needG: 210, haveG: 150.5 }]);
  });
  test("a slot tied to one spool is judged against that spool alone", () => {
    const input = { plates: [plate(0, true, 1, [80, 30])], quantity: 1, unitsPerSet: 1 };
    const pinned = { 0: [{ slot: { n: 1 }, filamentId: 1, spoolId: 11, spoolPinned: true }, { slot: { n: 2 }, filamentId: 1, spoolId: 10, spoolPinned: false }] };
    // spool 11 holds 50.5 g and its slot prints 80 g; the other 30 g of filament 1 count against all of its spools (150.5 g)
    expect(filamentShortages(input, pinned, data)).toEqual([{ filamentId: 1, name: "Galaxy PLA", needG: 80, haveG: 50.5, spoolId: 11 }]);
    const f = buildFlags({ selected: null, notCounted: [], skippedChannels: [], slotMatches: {}, fieldErrors: {}, quoteInput: { plates: [] } } as unknown as Derived,
      { m: String, pct: String }, { stale: false, short: filamentShortages(input, pinned, data) });
    expect(f).toEqual([{ id: "spoolShort-11", tone: "info", text: "Spoolman shows 51 g of Galaxy PLA, spool #11 left; this quote prints 80 g." }]);
  });
  test("a pinned spool's grams are not counted again for the filament's other slots", () => {
    const input = { plates: [plate(0, true, 1, [40, 120])], quantity: 1, unitsPerSet: 1 };
    const m = { 0: [{ slot: { n: 1 }, filamentId: 1, spoolId: 11, spoolPinned: true }, { slot: { n: 2 }, filamentId: 1, spoolId: 10, spoolPinned: false }] };
    // spool 11: 40 of 50.5 g; the other 120 g can use spool 10 (100 g) and the 10.5 g spare on spool 11
    expect(filamentShortages(input, m, data)).toEqual([{ filamentId: 1, name: "Galaxy PLA", needG: 120, haveG: 110.5 }]);
  });
  test("the preset-price flag offers Pick spool only while Spoolman is connected", () => {
    const d = { selected: null, notCounted: [], skippedChannels: [], fieldErrors: {}, quoteInput: { plates: [{ index: 0, include: true }] },
      slotMatches: { 0: [{ plateIndex: 0, slot: { n: 2 }, priceSource: "preset", pricePerKg: 20 }] } } as unknown as Derived;
    const flag = (spoolman: boolean) => buildFlags(d, { m: String, pct: String }, { stale: false, spoolman }).find((f) => f.id === "presetPrices");
    expect(flag(true)?.action).toMatchObject({ kind: "spool", plate: 0, slot: 2 });
    expect(flag(false)?.action).toBeUndefined();
  });
  test("slots with no Spoolman filament or no known remaining weight are not judged", () => {
    const input = { plates: [plate(0, true, 1, [5000, 5000])], quantity: 1, unitsPerSet: 1 };
    expect(filamentShortages(input, { 0: [view(0, 1, null), view(0, 2, 3)] }, data)).toEqual([]);
  });
  test("the price panel names the filament, the weight needed and the weight left", () => {
    const f = buildFlags({ selected: null, notCounted: [], skippedChannels: [], slotMatches: {}, fieldErrors: {}, quoteInput: { plates: [] } } as unknown as Derived,
      { m: String, pct: String }, { stale: false, short: [{ filamentId: 1, name: "Galaxy PLA", needG: 210, haveG: 150.5 }] });
    expect(f).toEqual([{ id: "filamentShort-1", tone: "info", text: "Spoolman shows 151 g of Galaxy PLA left; this quote prints 210 g." }]);
    setLocale("pt-BR");
    expect(buildFlags({ selected: null, notCounted: [], skippedChannels: [], slotMatches: {}, fieldErrors: {}, quoteInput: { plates: [] } } as unknown as Derived,
      { m: String, pct: String }, { stale: false, short: [{ filamentId: 1, name: "Galaxy PLA", needG: 1210, haveG: 150.5 }] })[0]!.text)
      .toBe("O Spoolman mostra 151 g de Galaxy PLA; este orçamento imprime 1,21 kg.");
  });
  test("live: a quote that prints more than the spools hold gets the note, a smaller one does not", async () => {
    load("ok");
    const m = mount(PriceFlags); mounted.push(m); await flush();
    const el = m.root;
    expect(el.querySelector("[data-flag^=filamentShort]")).toBeNull();
    patchDraft({ quantity: 60 });
    await flush();
    expect(el.querySelector("[data-flag^=filamentShort]")).not.toBeNull();
    store.spoolman = { ...store.spoolman, state: "offline" }; // stock from a Spoolman that is not answering is not trusted
    await flush();
    expect(el.querySelector("[data-flag^=filamentShort]")).toBeNull();
  });
});
