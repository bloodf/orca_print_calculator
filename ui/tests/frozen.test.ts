// A reopened saved quote reproduces its saved numbers exactly (docs/ux.md §7.2, checklist "identical price"), whatever
// today's settings say: printer profile, energy, labor, defaults and channels all come from the frozen engine input.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({})) }));
import { call } from "../src/bridge";
import { setLocale } from "../src/i18n";
import { savedQuotes } from "../src/mock/fixtures";
import { exportQuote, isDirty } from "../src/quoteFlow";
import { openQuote, saveQuote, useCurrentSlice } from "../src/state/quotes";
import * as S from "../src/state/store";
import { clearToasts } from "../src/state/toast";
import { load } from "./priceKit";

const price = (): number | null => { const s = S.selected.value; return s && s.ok ? s.price : null; };
const total = (): number | null => { const s = S.selected.value; return s && s.ok ? s.grandTotal : null; };
const saves = () => vi.mocked(call).mock.calls.filter((c) => c[0] === "save_quotes").length;
beforeEach(() => { setLocale("en"); clearToasts(); vi.mocked(call).mockClear(); });
afterEach(() => { S.store.status = "ready"; });

/** Today's settings drift in every way that used to leak into a reopened quote. */
const drift = (): void => S.patchSettings((s) => ({
  printers: Object.fromEntries(Object.entries(s.printers).map(([k]) => [k, { watts: 900, acquisitionMinor: 9_000_000, lifetimeHours: 100 }])),
  channels: s.channels.map((c) => ({ ...c, taxBp: 1500, surchargeMinor: 700, tiers: c.tiers.map((t) => ({ ...t, pctBp: 2500, fixedMinor: 900 })) })),
  defaults: { ...s.defaults, energyPerKwh: "9.99", laborPerHourMinor: 99900, laborMinutes: 600, setupMinutes: 120, targetMarginBp: 6000, failureBp: 2000, maintenancePerHourMinor: 500, fixedPerPrintHourMinor: 700, minOrderMinor: 500000, pretty: "none" as const, shipping: { mode: "absorbed" as const, minor: 9000 } },
}));

describe("reopening reproduces the saved price", () => {
  test("every mock quote, after every relevant setting changed", () => {
    load("ok");
    const quotes = savedQuotes();
    expect(quotes.length).toBeGreaterThan(0);
    S.store.quotes = quotes;
    drift();
    for (const q of quotes) {
      openQuote(q.id);
      expect(price(), q.id).toBe(q.summary.price);
      const sel = S.selected.value;
      expect(sel && sel.ok ? sel.grandTotal : null, q.id).toBe(q.summary.grandTotal);
      expect(isDirty(), `${q.id} dirty right after open`).toBe(false);
    }
  });
  test("a quote saved on one channel keeps that channel's fees when the channel is edited afterwards", async () => {
    load("noSpoolman");
    S.store.status = "ready";
    S.resetDraft();
    S.patchDraft({ channelId: "store" });
    const q = (await saveQuote())!;
    drift();
    S.resetDraft();
    openQuote(q.id);
    expect(price()).toBe(q.summary.price);
    expect(isDirty()).toBe(false);
  });
  test("Print and CSV on the unchanged reopened quote do not save", async () => {
    load("ok");
    S.store.quotes = savedQuotes();
    drift();
    openQuote(S.store.quotes[0]!.id);
    vi.mocked(call).mockClear();
    await exportQuote("csv");
    expect(saves()).toBe(0);
  });
  test("a USD quote under JPY or KWD with changed printer and channel numbers still shows its own numbers", () => {
    load("ok");
    const q = { ...savedQuotes()[0]!, currency: "USD" };
    S.store.quotes = [q];
    for (const code of ["JPY", "KWD"]) {
      S.store.draft = { ...S.store.draft, currency: null, frozenPlates: null };
      S.store.settings = { ...S.store.settings, currency: code };
      S.store.spoolman = { ...S.store.spoolman, data: { ...S.store.spoolman.data, currency: null } };
      drift();
      openQuote(q.id);
      expect(S.currency.value, code).toBe("USD");
      expect(price(), code).toBe(q.summary.price);
    }
  });
});

describe("edits modify the frozen copy", () => {
  test("quantity, a cost override and going back to the saved value", () => {
    load("ok");
    S.store.quotes = savedQuotes();
    drift();
    const q = S.store.quotes[0]!;
    openQuote(q.id);
    const saved = price();
    const savedTotal = total();
    S.patchDraft({ quantity: q.summary.quantity + 5 });
    expect(isDirty()).toBe(true);
    expect(total()).not.toBe(savedTotal);
    S.patchDraft({ quantity: q.summary.quantity });
    expect(total()).toBe(savedTotal);
    expect(price()).toBe(saved);
    const frozenMargin = S.derived.value.defaults.targetMarginBp;
    S.setOverride("targetMarginBp", frozenMargin + 1000);
    expect(price()).not.toBe(saved);
    S.setOverride("targetMarginBp", frozenMargin);
    expect(S.store.draft.overrides.targetMarginBp).toBeUndefined();
    expect(price()).toBe(saved);
    expect(isDirty()).toBe(false);
  });
  test("Use current slice keeps the quote's cost defaults as overrides", () => {
    load("ok");
    S.store.quotes = savedQuotes();
    const q = S.store.quotes[0]!;
    drift();
    openQuote(q.id);
    const frozenMargin = S.derived.value.defaults.targetMarginBp;
    expect(frozenMargin).not.toBe(6000); // not today's
    useCurrentSlice();
    expect(S.store.draft.frozenPlates).toBeNull();
    expect(S.derived.value.defaults.targetMarginBp).toBe(frozenMargin);
  });
});
