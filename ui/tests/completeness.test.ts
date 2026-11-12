// F01/F02: what the host did not report stays unknown through save, reopen, duplicate and reload, and no way of
// sending a quote (CSV, HTML, print, preview) accepts an incomplete one. A draft can still be saved.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick, type App } from "vue";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({})) }));
import { call } from "../src/bridge";
import QuotePreview from "../src/components/quotes/QuotePreview.vue";
import { setLocale, t } from "../src/i18n";
import { exportBlock, exportQuote, exportText, printQuote, savedExportBlock } from "../src/quoteFlow";
import { exportBlockOf, snapshotGaps } from "../src/state/completeness";
import { closeQuote, duplicateQuote, openQuote, saveQuote } from "../src/state/quotes";
import { derived, notCounted, store } from "../src/state/store";
import { clearToasts, toasts } from "../src/state/toast";
import { parseQuotes } from "../src/state/validate";
import type { HostPlate, PlateSnapshot, SavedQuote } from "../src/state/types";
import { load, mount, txt } from "./priceKit";

const mounted: { app: App; root: HTMLElement }[] = [];
const flush = async () => { for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve(); } };
beforeEach(() => { setLocale("en"); clearToasts(); vi.mocked(call).mockClear(); vi.mocked(call).mockImplementation(async () => ({})); });
afterEach(() => { for (const m of mounted.splice(0)) { m.app.unmount(); m.root.remove(); } });

/** The first plate with its time, weight and price removed: what a slice with no readable data looks like. */
function unknownPlate(): HostPlate[] {
  const p = store.plates[0]!;
  return [{ ...p, seconds: null, slots: [{ ...p.slots[0]!, grams: null, costPerKg: null, preset: "UNKNOWN" }] }];
}
const roundTrip = (q: SavedQuote): SavedQuote => parseQuotes(JSON.parse(JSON.stringify([q]))).quotes[0]!;

describe("F01: unknown stays unknown after saving", () => {
  test("save, reopen, reload from disk and duplicate keep the block and the not-counted list", async () => {
    load("noSpoolman");
    store.quotes = [];
    store.plates = unknownPlate();
    expect(exportBlock()).toBe("quote.blockedUnknown");
    const before = notCounted.value.map((n) => n.kind).sort();

    const saved = (await saveQuote())!; // a draft may be saved
    expect(saved).toBeTruthy();
    expect(saved.plates[0]).toMatchObject({ secondsKnown: false, slots: [{ gramsKnown: false, priceKnown: false }] });
    expect(savedExportBlock(saved)).toBe("quote.blockedUnknown");

    for (const q of [saved, roundTrip(saved)]) {
      store.quotes = [q];
      openQuote(q.id);
      expect(exportBlock()).toBe("quote.blockedUnknown");
      expect(notCounted.value.map((n) => n.kind).sort()).toEqual(before);
      const view = derived.value.slotMatches[0]![0]!;
      expect([view.slot.grams, view.pricePerKg]).toEqual([null, null]); // not 0 g, not free
      closeQuote();
    }

    store.quotes = [saved];
    await duplicateQuote(saved.id);
    const copy = store.quotes[1]!;
    expect(copy.id).not.toBe(saved.id);
    expect(savedExportBlock(copy)).toBe("quote.blockedUnknown");
  });

  test("the list's CSV, the list's print and the preview refuse an incomplete record with a reason and a way to fix it", async () => {
    load("noSpoolman");
    store.quotes = [];
    store.plates = unknownPlate();
    const q = (await saveQuote())!;
    for (const kind of ["csv", "html"] as const) expect(exportText(q, kind)).toBeNull();

    await exportQuote("csv", q);
    expect(call).not.toHaveBeenCalledWith("export_file", expect.anything());
    let toast = toasts.list[toasts.list.length - 1]!;
    expect(toast.text).toBe(t("quote.blockedUnknown"));
    expect(toast.action?.label).toBe(t("quotes.open"));

    clearToasts();
    store.preview = false;
    printQuote(q);
    expect(store.preview).toBe(false); // nothing opened, nothing printed
    toast = toasts.list[toasts.list.length - 1]!;
    expect(toast.text).toBe(t("quote.blockedUnknown"));
    toast.action!.run();
    expect(store.draft.quoteId).toBe(q.id); // the fix starts by reopening it

    store.preview = true;
    const m = mount(QuotePreview); mounted.push(m); await flush();
    expect(m.root.querySelector(".quote-sheet")).toBeNull();
    expect(txt(m.root)).toContain(t("quote.blockedUnknown"));
    expect([...m.root.querySelectorAll("button")].map((b) => txt(b))).not.toContain(t("sheet.printPdf"));
  });

  test("a complete quote still exports from the list", async () => {
    load("ok");
    store.quotes = [];
    const q = (await saveQuote())!;
    expect(savedExportBlock(q)).toBe("");
    expect(exportText(q, "csv")).not.toBeNull();
    expect(exportText(q, "html")).not.toBeNull();
    await exportQuote("csv", q);
    expect(call).toHaveBeenCalledWith("export_file", expect.objectContaining({ name: expect.stringMatching(/\.csv$/) }));
  });

  test("an unpriced filament blocks with its own reason in the list too", async () => {
    load("unmatched");
    store.quotes = [];
    const q = (await saveQuote())!;
    expect(savedExportBlock(q)).toBe("quote.blockedIncomplete");
  });

  test("an excluded plate's gaps do not block", async () => {
    load("ok");
    store.quotes = [];
    store.plates = [store.plates[0]!, { ...store.plates[1]!, seconds: null }];
    expect(exportBlock()).toBe("quote.blockedUnknown");
    store.draft = { ...store.draft, plates: { 1: { include: false, copies: 1 } } };
    expect(exportBlock()).toBe("");
    const q = (await saveQuote())!;
    expect(savedExportBlock(q)).toBe("");
  });
});

describe("F01: legitimate zeros survive, legacy zeros are read conservatively", () => {
  const snap = (over: Partial<PlateSnapshot> & { slots?: PlateSnapshot["slots"] } = {}): PlateSnapshot => ({
    index: 0, name: null, seconds: 600, slots: [{ n: 1, label: "PLA", key: "k", gramsMg: 1000, pricePerKgMinor: 100, color: null, source: "preset" }], ...over,
  });
  test("an explicit known 0 (a free spool, a zero-gram slot) is not a gap", () => {
    const p = snap({ secondsKnown: true, slots: [{ n: 1, label: "PLA", key: "k", gramsMg: 0, pricePerKgMinor: 0, color: null, source: "manual", gramsKnown: true, priceKnown: true }], consumption: "known" });
    expect(snapshotGaps(p)).toEqual([]);
  });
  test("a quote saved before the flags existed: a 0 cannot be told from unknown, so it counts as unknown", () => {
    expect(snapshotGaps(snap({ seconds: 0 }))).toEqual([{ kind: "time", plate: 1 }]);
    const p = snap({ slots: [{ n: 2, label: "PLA", key: "k", gramsMg: 0, pricePerKgMinor: 0, color: null, source: "none" }] });
    expect(snapshotGaps(p)).toEqual([{ kind: "grams", plate: 1, slot: 2 }, { kind: "price", plate: 1, slot: 2 }]);
    expect(snapshotGaps(snap({ slots: [] }))).toEqual([{ kind: "consumption", plate: 1 }]);
    expect(snapshotGaps(snap())).toEqual([]); // fully positive legacy data is untouched
  });
  test("known data of a live slice is stamped explicit, so a real 0 g slot is kept", () => {
    load("ok");
    store.plates = store.plates.map((p, i) => (i === 0 ? { ...p, slots: [{ ...p.slots[0]!, grams: 0 }] } : p));
    expect(derived.value.snapshots[0]!.slots[0]).toMatchObject({ gramsKnown: true, gramsMg: 0, priceKnown: true });
    expect(exportBlock()).toBe("");
  });
  test("block order: unknown measurements win over an unpriced filament", () => {
    const gaps = [snap({ seconds: 0 }), snap({ index: 1, slots: [{ n: 1, label: "x", key: "x", gramsMg: 5, pricePerKgMinor: 0, color: null, source: "none" }] })];
    expect(exportBlockOf(gaps, () => true)).toBe("quote.blockedUnknown");
    expect(exportBlockOf([gaps[1]!], () => true)).toBe("quote.blockedIncomplete");
  });
});

describe("F02: a plate with no consumption data is not free material", () => {
  test("time without slots is flagged, blocks every output, and says what is missing", () => {
    load("noSpoolman");
    store.plates = [{ ...store.plates[0]!, seconds: 3600, slots: [], consumption: "missing" }];
    expect(notCounted.value).toContainEqual({ kind: "consumption", plate: 1 });
    expect(exportBlock()).toBe("quote.blockedUnknown");
  });
  test("an older host (no consumption field) with no slots is treated the same", () => {
    load("noSpoolman");
    const { consumption: _drop, ...rest } = store.plates[0]!;
    store.plates = [{ ...rest, seconds: 3600, slots: [] }];
    expect(exportBlock()).toBe("quote.blockedUnknown");
  });
  test("a file that states zero use is a confirmed zero and may be exported", () => {
    load("noSpoolman");
    store.plates = [{ ...store.plates[0]!, seconds: 3600, slots: [], consumption: "zero" }];
    expect(notCounted.value.some((n) => n.kind === "consumption")).toBe(false);
    expect(exportBlock()).toBe("");
  });
  test("it survives save and reload as missing", async () => {
    load("noSpoolman");
    store.quotes = [];
    store.plates = [{ ...store.plates[0]!, seconds: 3600, slots: [], consumption: "missing" }];
    const q = (await saveQuote())!;
    expect(q.plates[0]!.consumption).toBe("missing");
    expect(savedExportBlock(roundTrip(q))).toBe("quote.blockedUnknown");
  });
  test("the not-counted sentence names the plate", () => {
    load("noSpoolman");
    store.plates = [{ ...store.plates[0]!, slots: [], consumption: "missing" }];
    expect(t("notCounted.consumption", { n: 1 })).toContain("filament use of plate 1");
  });
});
