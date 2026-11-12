// T5.3 re-review LOW items: kept rows, numbering, save queue, timeouts, unreadable files.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h, nextTick, type App } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({})) }));
import { call } from "../src/bridge";
import { setLocale } from "../src/i18n";
import { HOST, plates as fxPlates, savedQuotes, settings as fxSettings } from "../src/mock/fixtures";
import { defaultSettings, mergeSettings, resetNames } from "../src/state/defaults";
import { saveBusy, saveQuote } from "../src/state/quotes";
import * as S from "../src/state/store";
import { clearToasts } from "../src/state/toast";
import { load } from "./priceKit";

const calls = () => vi.mocked(call);
let app: App | null = null;
let root: HTMLElement | null = null;
const flush = async () => { for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); } };
beforeEach(() => { setLocale("en"); clearToasts(); calls().mockReset(); calls().mockResolvedValue({} as never); });
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; S.store.quarantined = []; S.store.unreadable = []; });

describe("rows a migration drops are kept on disk and announced", () => {
  const bad = { channels: [{ id: "ok", name: "Ok", taxBp: 0, surchargeMinor: 0, tiers: [{ minMinor: 0, pctBp: 0, fixedMinor: 0, shippingMinor: 0 }] }, "junk", { id: 5 }], printers: { A: { watts: 100 }, B: "junk" }, extrasCatalog: [{ key: "k", label: "L", unitMinor: 1, qtyE3: 1000, per: "piece" }, { label: 1 }], slotOverrides: { p: { filamentId: 1 }, q: 7 }, manualPrices: { a: 1, b: "x" } };
  test("dropped rows go to settings.invalid and come back on the next load", () => {
    const s = mergeSettings(bad as never, defaultSettings(null, "Direct"));
    expect(s.invalid).toEqual({ channels: ["junk", { id: 5 }], printers: { B: "junk" }, extrasCatalog: [{ label: 1 }], slotOverrides: { q: 7 }, manualPrices: { b: "x" } });
    const again = mergeSettings(JSON.parse(JSON.stringify(s)), defaultSettings(null, "Direct"));
    expect(again.invalid).toEqual(s.invalid); // written back, not lost, and not duplicated
  });
  test("the notice names the collections that lost rows", () => {
    expect(resetNames(bad).sort()).toEqual(["channels", "extrasCatalog", "manualPrices", "printers", "slotOverrides"]);
  });
  test("a clean file has no invalid bag", () => {
    expect(mergeSettings(fxSettings() as never, defaultSettings(null, "Direct")).invalid).toBeUndefined();
  });
});

describe("numbers", () => {
  test("a new quote never reuses the number of a row that could not be read", async () => {
    load("ok");
    S.store.status = "ready";
    S.store.quarantined = [{ id: "bad", no: 99 }, { id: "worse", no: "x" }];
    S.patchSettings((s) => ({ sheet: { ...s.sheet, nextNo: 1 } }));
    S.resetDraft();
    const q = (await saveQuote())!;
    expect(q.no).toBeGreaterThan(99);
  });
});

describe("save queue", () => {
  test("Save as new during a Save changes in flight runs after it and makes its own record", async () => {
    load("ok");
    S.store.status = "ready";
    S.resetDraft();
    const first = (await saveQuote())!;
    expect(S.store.quotes.filter((q) => q.id === first.id)).toHaveLength(1);
    S.patchDraft({ note: "edited" });
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => { release = r; });
    calls().mockImplementation((async () => { await held; return {}; }) as never);
    const before = S.store.quotes.length;
    const p1 = saveQuote();
    const p2 = saveQuote(true);
    release();
    for (let i = 0; i < 20; i++) { await flush(); }
    const [a, b] = await Promise.all([p1, p2]);
    expect(a?.id).toBe(first.id);
    expect(b?.id).not.toBe(first.id);
    expect(S.store.quotes.length - before).toBe(1);
  });
  test("the Save buttons are really disabled while saving", async () => {
    const { default: QuoteActions } = await import("../src/components/quotes/QuoteActions.vue");
    load("ok");
    S.store.status = "ready";
    S.resetDraft();
    root = document.createElement("div");
    document.body.appendChild(root);
    app = createApp({ render: () => h(QuoteActions) });
    app.mount(root);
    await nextTick();
    saveBusy.value = true;
    await nextTick();
    const btns = [...root.querySelectorAll<HTMLButtonElement>("button")].filter((b) => /Save/.test(b.textContent ?? ""));
    expect(btns.length).toBeGreaterThan(0);
    for (const b of btns) expect(b.disabled).toBe(true);
    saveBusy.value = false;
  });
});

describe("bridge", () => {
  test("spoolman_fetch waits 30 s (the host's worst case is 25 s)", async () => {
    const real = await vi.importActual<typeof import("../src/bridge")>("../src/bridge");
    vi.useFakeTimers();
    window.orca = { postMessage: () => undefined, onMessage: () => undefined };
    let code = "";
    void real.call("spoolman_fetch", { url: "http://x" }).catch((e) => { code = (e as { code: string }).code; });
    await vi.advanceTimersByTimeAsync(29_000);
    expect(code).toBe("");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(code).toBe("timeout");
    vi.useRealTimers();
    delete window.orca;
  });
});

describe("unreadable files", () => {
  async function bootWith(unreadable: string[]): Promise<void> {
    const handlers: ((m: unknown) => void)[] = [];
    (window as unknown as { __orcaDispatch: (m: unknown) => void }).__orcaDispatch = (m) => handlers.forEach((fn) => fn(m));
    calls().mockImplementation((async (cmd: string) => (cmd === "get_state" ? { host: HOST, plates: fxPlates(), settings: null, quotes: null, spooler: null, unreadable } : {})) as never);
    S.store.status = "loading";
    await S.loadState();
  }
  test("get_state `unreadable` is remembered and shown as a persistent banner instead of first run", async () => {
    await bootWith(["settings"]);
    expect(S.store.unreadable).toEqual(["settings"]);
    const { default: PlatesArea } = await import("../src/views/PlatesArea.vue");
    root = document.createElement("div");
    document.body.appendChild(root);
    app = createApp({ render: () => h(PlatesArea) });
    app.mount(root);
    await nextTick();
    const banner = root.querySelector("[data-unreadable]")!;
    expect(banner.textContent).toMatch(/could not be read.*not being saved/i);
    expect(banner.textContent).toMatch(/settings/i);
    expect(root.querySelector(".fr")).toBeNull(); // no first-run checklist on top of a file we could not read
  });
  test("both files named; a normal state shows no banner", async () => {
    await bootWith(["settings", "quotes"]);
    expect(S.store.unreadable).toEqual(["settings", "quotes"]);
    await bootWith([]);
    expect(S.store.unreadable).toEqual([]);
  });
  test("the contract: a missing `unreadable` key means none", async () => {
    calls().mockImplementation((async (cmd: string) => (cmd === "get_state" ? { host: HOST, plates: [], settings: fxSettings(), quotes: savedQuotes(), spooler: null } : {})) as never);
    S.store.status = "loading";
    await S.loadState();
    expect(S.store.unreadable).toEqual([]);
  });
});
