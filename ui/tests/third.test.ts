// T5.3 third pass: frozen quote sections, prototype-safe settings, deep quote validation, unreadable files.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h, nextTick, type App } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({})) }));
import { call } from "../src/bridge";
import MachineSection from "../src/components/costs/MachineSection.vue";
import SalesSection from "../src/components/costs/SalesSection.vue";
import { setLocale } from "../src/i18n";
import { HOST, plates as fxPlates, savedQuotes, settings as fxSettings } from "../src/mock/fixtures";
import { isDirty, exportText, sheetFor } from "../src/quoteFlow";
import { defaultSettings, mergeSettings, migrateSettings, resetNames } from "../src/state/defaults";
import { openQuote } from "../src/state/quotes";
import * as S from "../src/state/store";
import { clearToasts, toasts } from "../src/state/toast";
import { parseQuotes } from "../src/state/validate";
import { load } from "./priceKit";

const calls = () => vi.mocked(call);
let app: App | null = null;
let root: HTMLElement | null = null;
const flush = async () => { for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); } };
const mountC = async (c: unknown): Promise<HTMLElement> => {
  root = document.createElement("div");
  document.body.appendChild(root);
  app = createApp({ render: () => h(c as never) });
  app.mount(root);
  await flush();
  return root;
};
const price = (): number | null => { const s = S.selected.value; return s && s.ok ? s.price : null; };
beforeEach(() => { setLocale("en"); clearToasts(); calls().mockReset(); calls().mockResolvedValue({} as never); });
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; S.store.unreadable = []; S.store.quarantined = []; });

const drift = (): void => S.patchSettings((s) => ({
  printers: Object.fromEntries(Object.keys(s.printers).map((k) => [k, { watts: 900, acquisitionMinor: 9_000_000, lifetimeHours: 100 }])),
  channels: s.channels.map((c) => ({ ...c, taxBp: 1500, surchargeMinor: 700, tiers: c.tiers.map((t) => ({ ...t, pctBp: 2500, fixedMinor: 900 })) })),
}));
const field = (el: HTMLElement, label: string): HTMLInputElement => {
  const l = [...el.querySelectorAll("label")].find((x) => x.textContent?.trim() === label);
  if (!l) throw new Error(`no label "${label}"`);
  return el.querySelector<HTMLInputElement>(`#${l.htmlFor}`)!;
};
const typeInto = async (i: HTMLInputElement, v: string) => { i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); i.blur(); await flush(); };

describe("M1: a saved quote's printer and channel are shown from the quote, read-only", () => {
  async function open(): Promise<{ machine: HTMLElement; q: ReturnType<typeof savedQuotes>[number] }> {
    load("ok");
    S.store.status = "ready";
    S.store.quotes = savedQuotes();
    const q = S.store.quotes[0]!;
    S.setSectionOpen("machine", true); S.setSectionOpen("sales", true);
    drift();
    openQuote(q.id);
    return { machine: await mountC({ render: () => h("div", [h(MachineSection), h(SalesSection)]) }), q };
  }
  test("Machine shows the frozen printer values, not today's profile", async () => {
    const { machine, q } = await open();
    const m = q.input.costs.machine;
    expect(field(machine, "Average power").value).toBe(String(m.wattsW10 / 10));
    expect(field(machine, "Printer price").value.replace(/[^\d]/g, "")).toBe(String(m.acquisitionCents));
    expect(field(machine, "Lifetime").value.replace(/[^\d]/g, "")).toBe(String(m.lifetimeHours));
  });
  test("those fields are read-only: typing writes neither the draft nor the settings", async () => {
    const { machine } = await open();
    const before = JSON.stringify(S.store.settings.printers);
    const dirty = isDirty();
    for (const l of ["Average power", "Printer price", "Lifetime"]) {
      const i = field(machine, l);
      expect(i.readOnly, l).toBe(true);
      await typeInto(i, "7");
    }
    expect(JSON.stringify(S.store.settings.printers)).toBe(before);
    expect(isDirty()).toBe(dirty);
  });
  test("Sales shows the quote's channel fees and tax, read-only, and never edits the global channel", async () => {
    const { machine, q } = await open();
    const ch = q.input.channels.find((c) => c.id === q.channelId)!;
    const fee = field(machine, "Fee");
    expect(fee.value.replace(/[^\d]/g, "")).toBe(String(ch.tiers[0]!.pctBp / 100).replace(/[^\d]/g, ""));
    const before = JSON.stringify(S.store.settings.channels);
    for (const l of ["Fee", "Fixed fee per piece", "Tax"]) {
      const i = field(machine, l);
      expect(i.readOnly, l).toBe(true);
      await typeInto(i, "9");
    }
    expect(JSON.stringify(S.store.settings.channels)).toBe(before);
  });
  test("a note says where the values come from; Use current settings swaps in today's, changes the price and dirties", async () => {
    const { machine } = await open();
    const saved = price();
    expect(machine.textContent).toMatch(/from the saved quote/i);
    expect(isDirty()).toBe(false);
    const btn = [...machine.querySelectorAll("button")].find((b) => b.textContent?.includes("Use current settings"))!;
    btn.click();
    await flush();
    expect(S.store.draft.frozenInput).toBeNull();
    expect(price()).not.toBe(saved);
    expect(isDirty()).toBe(true);
    expect(field(machine, "Average power").readOnly).toBe(false);
    expect(machine.textContent).not.toMatch(/from the saved quote/i);
  });
  test("without a saved quote the fields are editable as before", async () => {
    load("ok");
    S.setSectionOpen("machine", true);
    const el = await mountC(MachineSection);
    expect(field(el, "Average power").readOnly).toBe(false);
  });
});

describe("M2: prototype keys in a settings file", () => {
  const withProto = (group: string): unknown => {
    const raw = JSON.parse(JSON.stringify(fxSettings()));
    raw[group] = JSON.parse('{"__proto__":{"polluted":1}}');
    return raw;
  };
  for (const g of ["spoolman", "sheet", "ui"]) {
    test(`${g} with a __proto__ key: no throw, no pollution, the rest of the file is kept`, () => {
      const raw = withProto(g);
      expect(() => migrateSettings(raw)).not.toThrow();
      expect(() => resetNames(raw)).not.toThrow();
      const m = mergeSettings(raw, defaultSettings(null, "Direct"));
      expect(m.channels.length).toBe(2);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  }
  test("a __proto__ row in printers or manual prices is kept in the invalid bag, not lost", () => {
    const raw = JSON.parse(JSON.stringify(fxSettings()));
    raw.printers = JSON.parse('{"__proto__":"junk","Snapmaker U1":{"watts":120}}');
    const m = mergeSettings(raw, defaultSettings(null, "Direct"));
    expect(Object.keys(m.printers)).toEqual(["Snapmaker U1"]);
    expect(JSON.stringify(m.invalid)).toContain("__proto__");
    expect(({} as Record<string, unknown>).junk).toBeUndefined();
  });
  test("a throw while applying the settings never leads to saving built-ins over the user's file", async () => {
    const raw = fxSettings() as unknown as Record<string, unknown>;
    Object.defineProperty(raw, "channels", { enumerable: true, get() { throw new Error("boom"); } });
    calls().mockImplementation((async (cmd: string) => (cmd === "get_state" ? { host: HOST, plates: fxPlates(), settings: raw, quotes: [], spooler: null, unreadable: [] } : {})) as never);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    S.store.status = "loading";
    await S.loadState();
    expect(S.store.status).toBe("ready");
    expect(S.store.unreadable).toContain("settings");
    calls().mockClear();
    S.patchSettings({ language: "pt-BR" });
    await S.flushSettings();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(calls().mock.calls.filter((c) => c[0] === "save_settings")).toHaveLength(0);
    err.mockRestore();
  });
  test("a throw while reading the quotes marks quotes unreadable and writes nothing", async () => {
    const quotes = [{}] as unknown[];
    Object.defineProperty(quotes, "filter", { value: () => { throw new Error("boom"); } });
    calls().mockImplementation((async (cmd: string) => (cmd === "get_state" ? { host: HOST, plates: fxPlates(), settings: fxSettings(), quotes, spooler: null, unreadable: [] } : {})) as never);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    S.store.status = "loading";
    await S.loadState();
    expect(S.store.status).toBe("ready");
    expect(S.store.unreadable).toContain("quotes");
    err.mockRestore();
  });
});

describe("M3: quotes with missing engine input are quarantined, never half-opened", () => {
  const cases: [string, (q: any) => void][] = [
    ["costs.machine", (q) => { delete q.input.costs.machine; }],
    ["pretty", (q) => { delete q.input.pretty; }],
    ["minOrderMinor", (q) => { delete q.input.minOrderMinor; }],
    ["costs.labor", (q) => { delete q.input.costs.labor; }],
    ["costs.failure", (q) => { delete q.input.costs.failure; }],
    ["costs.kwhE4", (q) => { delete q.input.costs.kwhE4; }],
    ["targetMarginBp", (q) => { delete q.input.targetMarginBp; }],
    ["setup.minutes", (q) => { delete q.input.setup.minutes; }],
    ["channels", (q) => { q.input.channels = [{ id: "x" }]; }],
    ["extras item", (q) => { q.input.extras = [{ key: 1 }]; }],
    ["a plate slot", (q) => { q.input.plates[0].slots[0].gramsMg = "x"; }],
    ["costs.depreciationEnabled", (q) => { delete q.input.costs.depreciationEnabled; }],
  ];
  for (const [name, f] of cases) {
    test(`missing ${name}: quarantined`, () => {
      const q = JSON.parse(JSON.stringify(savedQuotes()[0]));
      f(q);
      const { quotes, bad } = parseQuotes([q]);
      expect(quotes).toHaveLength(0);
      expect(bad).toHaveLength(1);
    });
  }
  test("an older quote without a sheet snapshot is still valid and exports", () => {
    const q = JSON.parse(JSON.stringify(savedQuotes()[0]));
    delete q.sheet;
    const { quotes } = parseQuotes([q]);
    expect(quotes).toHaveLength(1);
    expect(sheetFor(quotes[0]!)).not.toBeNull();
    expect(exportText(quotes[0]!, "csv")).not.toBeNull();
  });
  test("every fixture quote stays valid", () => {
    expect(parseQuotes(savedQuotes()).bad).toHaveLength(0);
  });
  test("openQuote on a row that slipped through says so instead of doing nothing", () => {
    load("ok");
    const q = JSON.parse(JSON.stringify(savedQuotes()[0]));
    delete q.input.costs.labor;
    S.store.quotes = [q];
    expect(() => openQuote(q.id)).not.toThrow();
    expect(toasts.list[toasts.list.length - 1]!.text).toMatch(/couldn't open/i);
    expect(S.store.draft.frozenPlates).toBeNull();
  });
});

describe("LOW: no silent zeroing, flags, unreadable files", () => {
  test("a channel with any wrong-typed fee field is quarantined and named, never kept with zeroed fees", () => {
    const ok = { id: "ok", name: "Ok", taxBp: 600, surchargeMinor: 0, tiers: [{ minMinor: 0, pctBp: 500, fixedMinor: 100, shippingMinor: 0 }] };
    for (const broken of [{ ...ok, id: "a", taxBp: "6" }, { ...ok, id: "b", surchargeMinor: null }, { ...ok, id: "c", tiers: null }, { ...ok, id: "d", tiers: [{ minMinor: 0, pctBp: "5", fixedMinor: 0, shippingMinor: 0 }] }, { ...ok, id: "e", tiers: [] }]) {
      const raw = { channels: [ok, broken] };
      const m = mergeSettings(raw as never, defaultSettings(null, "Direct"));
      expect(m.channels.map((c) => c.id), JSON.stringify(broken)).toEqual(["ok"]);
      expect(JSON.stringify(m.invalid), JSON.stringify(broken)).toContain(broken.id);
      expect(resetNames(raw)).toContain("channels");
    }
  });
  test("a printer with a wrong-typed field is quarantined too; a missing field is just null", () => {
    const m = mergeSettings({ printers: { A: { watts: "x" }, B: { watts: 100 } } } as never, defaultSettings(null, "Direct"));
    expect(Object.keys(m.printers)).toEqual(["B"]);
    expect(m.printers.B).toEqual({ watts: 100, acquisitionMinor: null, lifetimeHours: null });
    expect(JSON.stringify(m.invalid)).toContain('"A"');
  });
  test("a saved quote with energy and labor at an explicit 0 raises no not-counted flags; wear follows the frozen machine", () => {
    load("ok");
    S.store.settings = { ...S.store.settings, printers: {}, defaults: { ...S.store.settings.defaults, depreciationEnabled: true } };
    const q = JSON.parse(JSON.stringify(savedQuotes()[0]));
    q.input.costs.kwhE4 = 0;
    q.input.costs.labor.perHourCents = 0;
    q.input.setup.ratePerHourMinor = 0;
    S.store.quotes = [q];
    openQuote(q.id);
    const kinds = S.derived.value.notCounted.map((n) => n.kind);
    expect(kinds).not.toContain("energy");
    expect(kinds).not.toContain("labor");
    expect(kinds).not.toContain("wear"); // the frozen machine has a price and a lifetime, today's profile does not
  });
  test("with unreadable files, settings edits send no save and add no toast; quote saves say why once", async () => {
    load("ok");
    S.store.status = "ready";
    S.store.unreadable = ["settings", "quotes"];
    calls().mockClear();
    S.patchSettings({ language: "pt-BR" });
    await S.flushSettings();
    S.setView("quotes");
    S.setView("calc");
    expect(calls().mock.calls.filter((c) => c[0] === "save_settings")).toHaveLength(0);
    expect(toasts.list).toHaveLength(0);
    const { saveQuote } = await import("../src/state/quotes");
    S.resetDraft();
    expect(await saveQuote()).toBeNull();
    expect(calls().mock.calls.filter((c) => c[0] === "save_quotes")).toHaveLength(0);
    expect(toasts.list.length).toBeLessThanOrEqual(1);
  });
  test("the banner lists both files with 'and', in both languages", async () => {
    load("ok");
    S.store.unreadable = ["settings", "quotes"];
    const { default: PlatesArea } = await import("../src/views/PlatesArea.vue");
    const el = await mountC(PlatesArea);
    expect(el.querySelector("[data-unreadable]")!.textContent).toMatch(/settings and quotes/i);
    setLocale("pt-BR");
    await flush();
    expect(el.querySelector("[data-unreadable]")!.textContent).toMatch(/ajustes e orçamentos/i);
  });
});
