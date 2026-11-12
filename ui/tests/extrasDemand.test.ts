// F06: the stock warning counts what the whole quote consumes of each catalog item: every scope, spares, copies, rounds and
// every row of the same item together. Nothing is deducted anywhere.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick, type App } from "vue";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({})) }));
import { call } from "../src/bridge";
import ExtrasEditor from "../src/components/costs/ExtrasEditor.vue";
import { setLocale } from "../src/i18n";
import { catalogItemOf, demandByItem, needOf, planOf } from "../src/state/extrasDemand";
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
