// T5.3: settings migration and saved-quote validation (never crash on a hand-edited or older file).
import { describe, expect, test } from "vitest";
import { createApp, h, nextTick } from "vue";
import { defaultSettings, mergeSettings, migrateSettings } from "../src/state/defaults";
import { parseQuotes } from "../src/state/validate";
import { savedQuotes } from "../src/mock/fixtures";
import QuotesView from "../src/views/QuotesView.vue";
import { store } from "../src/state/store";
import { sheetFor } from "../src/quoteFlow";
import type { Settings } from "../src/state/types";

const base = (): Settings => defaultSettings(null, "Direct");

describe("migrateSettings / mergeSettings", () => {
  test("a channel from an older file gets the fields it lacks", () => {
    const s = mergeSettings({ channels: [{ id: "shop", name: "Shop", tiers: [{ minMinor: 0, pctBp: 500, fixedMinor: 100 }] }] } as never, base());
    expect(s.channels[0]).toEqual({ id: "shop", name: "Shop", taxBp: 0, surchargeMinor: 0, tiers: [{ minMinor: 0, pctBp: 500, fixedMinor: 100, shippingMinor: 0 }] });
  });
  test("a printer profile missing fields is completed; non-object entries are dropped", () => {
    const s = mergeSettings({ printers: { A: { watts: 120 }, B: "junk", C: null } } as never, base());
    expect(s.printers).toEqual({ A: { watts: 120, acquisitionMinor: null, lifetimeHours: null } });
  });
  test("garbage channels fall back to the built-in Direct channel, not a crash", () => {
    expect(mergeSettings({ channels: ["x", 3, null] } as never, base()).channels.map((c) => c.id)).toEqual(["direct"]);
    expect(mergeSettings({ channels: [{ id: 1 }] } as never, base()).channels.map((c) => c.id)).toEqual(["direct"]);
  });
  test("wrong-typed pieces are ignored, valid ones kept", () => {
    const s = mergeSettings({ defaults: "x", sheet: { nextNo: "7", shopName: "S" }, manualPrices: { a: 100, b: "x" }, slotOverrides: { p: { filamentId: 1 }, q: 5 }, extrasCatalog: [{ key: "k", label: "L", unitMinor: 5, qtyE3: 1000, per: "piece" }, { label: 1 }] } as never, base());
    expect(s.defaults).toEqual(base().defaults);
    expect(s.sheet.nextNo).toBe(1);
    expect(s.sheet.shopName).toBe("S");
    expect(s.manualPrices).toEqual({ a: 100 });
    expect(Object.keys(s.slotOverrides)).toEqual(["p"]);
    expect(s.extrasCatalog).toHaveLength(1);
  });
  test("migrateSettings: missing or unknown version is treated as version 1 and stamped", () => {
    expect(migrateSettings({ language: "en" })?.version).toBe(1);
    expect(migrateSettings({ version: 99, language: "en" })?.version).toBe(1);
    expect(migrateSettings(null)).toBeNull();
    expect(migrateSettings([] as never)).toBeNull();
    expect(migrateSettings("x" as never)).toBeNull();
  });
});

describe("parseQuotes", () => {
  test("valid quotes pass; malformed rows are separated, not thrown", () => {
    const good = savedQuotes();
    const { quotes, bad } = parseQuotes([...good, { id: "x" }, null, "junk", { ...good[0]!, summary: undefined }, { ...good[0]!, input: { plates: 1 } }, { ...good[0]!, no: "7" }]);
    expect(quotes.map((q) => q.id)).toEqual(["q-a", "q-b"]);
    expect(bad).toHaveLength(6);
  });
  test("a non-array is an empty list", () => { expect(parseQuotes(undefined)).toEqual({ quotes: [], bad: [] }); expect(parseQuotes({} as never)).toEqual({ quotes: [], bad: [] }); });
  test("sheetFor never throws on a quote that no longer prices", () => {
    const q = { ...savedQuotes()[0]!, input: { ...savedQuotes()[0]!.input, quantity: -5 } };
    expect(() => sheetFor(q)).not.toThrow();
    expect(sheetFor(q)).toBeNull();
    const broken = { ...savedQuotes()[0]!, input: { plates: [] } } as never;
    expect(() => sheetFor(broken)).not.toThrow();
  });
});

describe("QuotesView with skipped rows", () => {
  test("shows how many rows were skipped and does not crash", async () => {
    store.quotes = savedQuotes();
    store.skippedQuotes = 2;
    const root = document.createElement("div");
    document.body.appendChild(root);
    const app = createApp({ render: () => h(QuotesView) });
    app.mount(root);
    await nextTick();
    expect(root.textContent).toMatch(/2 saved quotes could not be read/i);
    app.unmount(); root.remove();
    store.skippedQuotes = 0;
  });
});
