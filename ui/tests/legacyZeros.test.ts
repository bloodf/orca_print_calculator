// A quote saved before the completeness flags existed: a zero is read from its own provenance, never guessed, and a zero
// nothing explains is settled only by an explicit, visible action (which edits the quote and changes nothing until saved).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick, type App } from "vue";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({})) }));
import GapList from "../src/components/quotes/GapList.vue";
import QuoteActions from "../src/components/quotes/QuoteActions.vue";
import { setLocale } from "../src/i18n";
import { exportBlock, exportText, isDirty, savedExportBlock } from "../src/quoteFlow";
import { confirmable, confirmZero, snapshotGaps } from "../src/state/completeness";
import { closeQuote, confirmGap, openQuote, saveQuote } from "../src/state/quotes";
import { derived, store } from "../src/state/store";
import { clearToasts } from "../src/state/toast";
import type { PlateSnapshot, SavedQuote } from "../src/state/types";
import { buildScenario } from "../src/mock/scenarios";
import { parseQuotes } from "../src/state/validate";
import { load, mount, txt } from "./priceKit";

const mounted: { app: App; root: HTMLElement }[] = [];
const flush = async () => { for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve(); } };
beforeEach(() => { setLocale("en"); clearToasts(); });
afterEach(() => { for (const m of mounted.splice(0)) { m.app.unmount(); m.root.remove(); } closeQuote(); });

type Slot = PlateSnapshot["slots"][number];
const slot = (n: number, gramsMg: number, pricePerKgMinor = 12000): Slot => ({ n, label: `PLA${n}`, key: `k${n}`, gramsMg, pricePerKgMinor, color: null, source: "name", filamentId: n });
const legacy = (over: Partial<PlateSnapshot> = {}): PlateSnapshot => ({ index: 0, name: null, seconds: 3600, slots: [slot(1, 20000)], ...over });
/** Strip every flag, as a file written before they existed. */
const unflag = (p: PlateSnapshot): PlateSnapshot => {
  const { secondsKnown: _s, consumption: _c, ...rest } = p;
  return { ...rest, slots: p.slots.map(({ gramsKnown: _g, priceKnown: _p, ...x }) => x) };
};

describe("legacy provenance", () => {
  test("a 0 g slot beside a positive sibling is still a gap: the host never proved the sibling rule, so it needs its own confirmation", () => {
    const p = legacy({ slots: [slot(1, 20000), slot(2, 0)] });
    expect(snapshotGaps(p)).toEqual([{ kind: "grams", plate: 1, slot: 2 }]);
    expect(confirmable(p, { kind: "grams", plate: 1, slot: 2 })).toBe(true);
    expect(snapshotGaps(confirmZero([p], { kind: "grams", plate: 1, slot: 2 })[0]!)).toEqual([]);
  });
  test("a 0 g slot alone has no proof: it stays a gap and may be confirmed", () => {
    const p = legacy({ slots: [slot(1, 0)] });
    expect(snapshotGaps(p)).toEqual([{ kind: "grams", plate: 1, slot: 1 }]);
    expect(confirmable(p, { kind: "grams", plate: 1, slot: 1 })).toBe(true);
  });
  test("a price of 0 is unknown and is never offered as confirmable (no source produces a free filament)", () => {
    const p = legacy({ slots: [slot(1, 20000, 0)] });
    expect(snapshotGaps(p)).toEqual([{ kind: "price", plate: 1, slot: 1 }]);
    expect(confirmable(p, { kind: "price", plate: 1, slot: 1 })).toBe(false);
  });
  test("a time of 0 is not confirmable; a flagged-unknown value (the host said so) is not confirmable either", () => {
    expect(confirmable(legacy({ seconds: 0 }), { kind: "time", plate: 1 })).toBe(false);
    const flagged = legacy({ slots: [{ ...slot(1, 0), gramsKnown: false }] });
    expect(confirmable(flagged, { kind: "grams", plate: 1, slot: 1 })).toBe(false);
    expect(confirmZero([flagged], { kind: "grams", plate: 1, slot: 1 })[0]).toEqual(flagged);
  });
  test("confirming is pure and touches only the named gap", () => {
    const plates = [legacy({ slots: [slot(1, 0), slot(2, 0)] }), legacy({ index: 1, slots: [] })];
    const frozen = JSON.stringify(plates);
    const next = confirmZero(plates, { kind: "grams", plate: 1, slot: 2 });
    expect(JSON.stringify(plates)).toBe(frozen);
    expect(next[0]!.slots[1]).toMatchObject({ gramsKnown: true });
    expect(next[0]!.slots[0]).not.toHaveProperty("gramsKnown");
    expect(snapshotGaps(next[1]!)).toEqual([{ kind: "consumption", plate: 2 }]);
    expect(confirmZero(next, { kind: "consumption", plate: 2 })[1]!.consumption).toBe("zero");
  });
});

/** A saved quote that predates the flags, whose first plate has a lone 0 g slot (nothing proves it was reported). */
async function legacyQuote(): Promise<SavedQuote> {
  load("ok");
  store.quotes = [];
  const q = (await saveQuote())!;
  const p0 = q.plates[0]!;
  const lone = { ...p0.slots[0]!, gramsMg: 0 }; // plate 1 keeps one slot, at 0 g: nothing beside it proves the 0
  const plates = [unflag({ ...p0, slots: [lone] }), ...q.plates.slice(1).map(unflag)];
  const input = { ...q.input, plates: q.input.plates.map((p, i) => (i === 0 ? { ...p, slots: [{ n: lone.n, label: lone.label, key: lone.key, gramsMg: 0, pricePerKgMinor: lone.pricePerKgMinor }] } : p)) };
  const old: SavedQuote = { ...q, plates, input };
  store.quotes = [old];
  return old;
}

describe("settling an unexplained legacy zero", () => {
  test("blocks with the field named; confirming edits the quote, then saving lets it out without altering any stored number", async () => {
    const old = await legacyQuote();
    expect(savedExportBlock(old)).toBe("quote.blockedUnknown");
    expect(exportText(old, "csv")).toBeNull();
    openQuote(old.id);
    expect(exportBlock()).toBe("quote.blockedUnknown");
    expect(isDirty()).toBe(false);

    confirmGap({ kind: "grams", plate: 1, slot: 1 });
    expect(exportBlock()).toBe("");
    expect(isDirty()).toBe(true); // an edit, not a silent change: it must be saved on purpose
    expect(store.quotes[0]).toEqual(old); // the record on disk is untouched until then
    const before = JSON.stringify(derived.value.quoteInput);

    const saved = (await saveQuote())!;
    expect(saved.plates[0]!.slots[0]).toMatchObject({ gramsMg: 0, gramsKnown: true });
    expect(JSON.stringify(saved.input)).toBe(before);
    expect(isDirty()).toBe(false);
    expect(savedExportBlock(saved)).toBe("");
    expect(exportText(saved, "csv")).not.toBeNull();
  });

  test("another gap of the same quote is not released by confirming this one", async () => {
    const old = await legacyQuote();
    const second: SavedQuote = { ...old, plates: old.plates.map((p) => ({ ...p, seconds: 0 })) };
    store.quotes = [second];
    openQuote(second.id);
    confirmGap({ kind: "grams", plate: 1, slot: 1 });
    expect(exportBlock()).toBe("quote.blockedUnknown"); // time 0 still stands
    expect(derived.value.notCounted).toContainEqual({ kind: "time", plate: 1 });
  });

  test("a draft that is not a saved quote ignores a confirm", () => {
    load("ok");
    const before = JSON.stringify(store.draft);
    confirmGap({ kind: "grams", plate: 1, slot: 1 });
    expect(JSON.stringify(store.draft)).toBe(before);
  });
});

describe("legacyQuote mock scenario (used for the screenshots)", () => {
  test("is a readable legacy quote: valid on disk, blocked until the zero is settled", () => {
    load("noSpoolman");
    const { state } = buildScenario("legacyQuote");
    const { quotes, bad } = parseQuotes(JSON.parse(JSON.stringify(state.quotes)));
    expect(bad).toEqual([]);
    expect(quotes[0]!.plates[0]).not.toHaveProperty("secondsKnown");
    store.quotes = quotes;
    openQuote(quotes[0]!.id);
    expect(exportBlock()).toBe("quote.blockedUnknown");
    expect(derived.value.notCounted).toEqual(expect.arrayContaining([{ kind: "grams", plate: 1, slot: 1 }]));
  });
});

describe("GapList", () => {
  test("names each field, offers Confirm 0 only where it can, and moves focus on", async () => {
    const old = await legacyQuote();
    openQuote(old.id);
    const m = mount(QuoteActions); mounted.push(m); await flush();
    expect(txt(m.root)).toContain("Not ready to send: 1 thing to fix.");
    expect(txt(m.root)).toContain("Plate 1, slot 1: weight was saved as 0 g");
    expect(m.root.textContent).not.toContain("CSV"); // no export buttons while blocked
    const btn = m.root.querySelector<HTMLButtonElement>("[data-gap-confirm]")!;
    expect(btn.getAttribute("aria-label")).toBe("Confirm 0 g for slot 1 on plate 1");
    expect(txt(m.root)).toContain("Use current slice");
    document.body.focus();
    btn.click(); await flush();
    expect(m.root.querySelector("[data-gaps]")).toBeNull();
    expect(m.root.textContent).toContain("CSV");
    expect(document.activeElement?.id).toBe("qa-save"); // not dropped to the page
    expect(txt(m.root)).toContain("Save changes");
  });

  test("a live slice with a missing time offers no confirm, only the way to fix it", async () => {
    load("unknown");
    const m = mount(GapList); mounted.push(m); await flush();
    expect(m.root.querySelector("[data-gap-confirm]")).toBeNull();
    expect(txt(m.root)).toContain("Slice again in OrcaSlicer");
  });

  test("pt-BR", async () => {
    setLocale("pt-BR");
    load("unknown");
    const m = mount(GapList); mounted.push(m); await flush();
    expect(txt(m.root)).toContain("Ainda não dá para enviar");
    expect(txt(m.root)).toContain("Placa 1: o tempo de impressão é desconhecido.");
  });
});
