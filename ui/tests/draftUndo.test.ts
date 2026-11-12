// B-40: replacing the working quote (close, open another, current slice, host project switch) never loses unsaved work
// silently. Dirty -> Undo with the whole previous draft; clean -> no toast; a newer edit is never overwritten.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick, toRaw, type App } from "vue";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({})) }));
import PlateList from "../src/components/plates/PlateList.vue";
import { setLocale } from "../src/i18n";
import { exportText, isDirty } from "../src/quoteFlow";
import { hasUnsavedWork } from "../src/state/dirty";
import { confirmGap, closeQuote, openQuote, saveQuote, useCurrentSlice } from "../src/state/quotes";
import { newDraft } from "../src/state/defaults";
import { derived, patchDraft, store } from "../src/state/store";
import { clearToasts, toasts } from "../src/state/toast";
import type { PlateSnapshot, SavedQuote } from "../src/state/types";
import { load, mount } from "./priceKit";

const mounted: { app: App; root: HTMLElement }[] = [];
beforeEach(() => { setLocale("en"); clearToasts(); });
afterEach(() => { for (const m of mounted.splice(0)) { m.app.unmount(); m.root.remove(); } store.quotes = []; closeQuote(); clearToasts(); });

const undoToast = () => toasts.list.find((x) => x.action?.label === "Undo");
const undo = () => { const x = undoToast(); expect(x).toBeTruthy(); x!.action!.run(); };
const unflag = (p: PlateSnapshot): PlateSnapshot => {
  const { secondsKnown: _s, consumption: _c, ...rest } = p;
  return { ...rest, slots: p.slots.map(({ gramsKnown: _g, priceKnown: _p, ...x }) => x) };
};

async function savedQuote(): Promise<SavedQuote> {
  load("ok");
  store.quotes = [];
  store.draft = { ...store.draft, title: "Gift box", customer: "Ana", note: "first note", quantity: 3 };
  const q = (await saveQuote())!;
  clearToasts();
  return q;
}

describe("closing the open quote", () => {
  test("clean quote: closes with nothing to undo", async () => {
    const q = await savedQuote();
    openQuote(q.id);
    expect(hasUnsavedWork()).toBe(false);
    closeQuote();
    expect(store.draft.quoteId).toBeNull();
    expect(toasts.list).toHaveLength(0);
  });

  test("edited quote: customer, note, quantity and quote id come back whole with Undo, and saving then updates the same record", async () => {
    const q = await savedQuote();
    openQuote(q.id);
    patchDraft({ customer: "Bruno", note: "changed note", quantity: 9 });
    expect(isDirty()).toBe(true);
    const before = JSON.stringify(store.draft);
    closeQuote();
    expect(store.draft.customer).toBe("");
    expect(undoToast()?.text).toMatch(/not saved/);
    undo();
    expect(JSON.stringify(store.draft)).toBe(before);
    expect(store.draft.quoteId).toBe(q.id);
    expect(isDirty()).toBe(true);
    const saved = (await saveQuote())!;
    expect(saved.id).toBe(q.id); // the same record, not a copy
    expect(store.quotes).toHaveLength(1);
    expect(saved.customer).toBe("Bruno");
    expect(exportText(saved, "csv")?.text).toContain("Bruno");
  });

  test("ignoring the toast leaves the close in place and the record on disk unchanged", async () => {
    const q = await savedQuote();
    openQuote(q.id);
    patchDraft({ customer: "Bruno" });
    closeQuote();
    expect(store.draft.customer).toBe("");
    expect(store.quotes[0]).toEqual(q);
  });

  test("a newer edit after the close is never overwritten by Undo", async () => {
    const q = await savedQuote();
    openQuote(q.id);
    patchDraft({ customer: "Bruno" });
    closeQuote();
    patchDraft({ customer: "Carla", note: "fresh work" });
    undo();
    expect(store.draft.customer).toBe("Carla");
    expect(store.draft.quoteId).toBeNull();
    expect(toasts.list.some((x) => /Can't undo/.test(x.text))).toBe(true);
  });

  test("a never-saved draft with a customer is protected; an untouched blank one is not", () => {
    load("ok");
    expect(hasUnsavedWork()).toBe(false);
    closeQuote();
    expect(toasts.list).toHaveLength(0);
    patchDraft({ customer: "Ana" });
    expect(hasUnsavedWork()).toBe(true);
    closeQuote();
    expect(toasts.list).toHaveLength(1);
    undo();
    expect(store.draft.customer).toBe("Ana");
  });

  test("the banner's Close button goes through the same guard", async () => {
    const q = await savedQuote();
    openQuote(q.id);
    patchDraft({ note: "kept" });
    const m = mount(PlateList);
    mounted.push(m);
    await nextTick();
    const close = [...m.root.querySelectorAll<HTMLButtonElement>("[data-quote-banner] button")].find((b) => /Close quote/.test(b.textContent ?? ""))!;
    close.click();
    await nextTick();
    expect(store.draft.note).toBe("");
    undo();
    expect(store.draft.note).toBe("kept");
  });
});

describe("opening another quote", () => {
  test("unsaved edits in the quote on screen come back with Undo", async () => {
    const q = await savedQuote();
    store.draft = { ...newDraft(store.settings), customer: "Typed, not saved" }; // a new quote with a customer
    openQuote(q.id);
    expect(store.draft.quoteId).toBe(q.id);
    undo();
    expect(store.draft.customer).toBe("Typed, not saved");
    expect(store.draft.quoteId).toBeNull();
  });
  test("opening a clean quote after a clean quote asks nothing", async () => {
    const q = await savedQuote();
    openQuote(q.id);
    openQuote(q.id);
    expect(toasts.list).toHaveLength(0);
  });
});

describe("using the current slice on an open quote", () => {
  test("a confirmed zero and the edited customer are kept for Undo, with the slice swap undone too", async () => {
    load("ok");
    store.quotes = [];
    const q0 = (await saveQuote())!;
    const p0 = q0.plates[0]!;
    const lone = { ...p0.slots[0]!, gramsMg: 0 };
    const old: SavedQuote = { ...q0, plates: [unflag({ ...p0, slots: [lone] }), ...q0.plates.slice(1).map(unflag)] };
    store.quotes = [old];
    clearToasts();
    openQuote(old.id);
    confirmGap({ kind: "grams", plate: 1, slot: 1 });
    patchDraft({ customer: "Dora" });
    const live = toRaw(store.plates);
    const fresh = live.map((p) => ({ ...p }));
    store.pendingPlates = fresh;
    const edited = JSON.stringify(store.draft);
    useCurrentSlice();
    expect(store.draft.frozenPlates).toBeNull();
    expect(toRaw(store.plates)).toBe(fresh);
    undo();
    expect(JSON.stringify(store.draft)).toBe(edited);
    expect(store.draft.frozenPlates?.[0]?.slots[0]).toMatchObject({ gramsKnown: true });
    expect(toRaw(store.plates)).toBe(live);
    expect(toRaw(store.pendingPlates)).toBe(fresh);
    expect(derived.value.snapshots.length).toBeGreaterThan(0);
  });
  test("a clean saved quote switches without a toast", async () => {
    const q = await savedQuote();
    openQuote(q.id);
    useCurrentSlice();
    expect(toasts.list).toHaveLength(0);
  });
});
