// T4.10: behavioural fixes from the T4.9 audit (finding numbers in the test names).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick, type App } from "vue";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({})) }));
import { call } from "../src/bridge";
import AppHeader from "../src/components/AppHeader.vue";
import FirstRunChecklist from "../src/components/FirstRunChecklist.vue";
import NumberField from "../src/components/base/NumberField.vue";
import Segmented from "../src/components/base/Segmented.vue";
import PlateList from "../src/components/plates/PlateList.vue";
import PricePanel from "../src/components/price/PricePanel.vue";
import PriceFlags from "../src/components/price/PriceFlags.vue";
import QuoteActions from "../src/components/quotes/QuoteActions.vue";
import { setLocale } from "../src/i18n";
import { exportBlock, sheetFor } from "../src/quoteFlow";
import { closeQuote, openQuote, saveQuote, useCurrentSlice } from "../src/state/quotes";
import { derived, flushSettings, patchSettings, setView, store } from "../src/state/store";
import { clearToasts, toasts } from "../src/state/toast";
import type { HostPlate } from "../src/state/types";
import { plates as fixturePlates } from "../src/mock/fixtures";
import { load, mount, txt } from "./priceKit";

const mounted: { app: App; root: HTMLElement }[] = [];
const flush = async () => { for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve(); } };
const show = async (c: Parameters<typeof mount>[0], props?: Record<string, unknown>): Promise<HTMLElement> => {
  const m = mount(c, props); mounted.push(m); await flush(); return m.root;
};
const btn = (el: Element, label: string): HTMLButtonElement => {
  const b = [...el.querySelectorAll("button")].find((x) => txt(x).includes(label));
  if (!b) throw new Error(`no button "${label}"`);
  return b;
};

beforeEach(() => { setLocale("en"); clearToasts(); vi.mocked(call).mockClear(); });
afterEach(() => { for (const m of mounted.splice(0)) { m.app.unmount(); m.root.remove(); } });

describe("F13 export block reasons", () => {
  test("a fully priced quote is not blocked", () => { load("ok"); expect(exportBlock()).toBe(""); });
  test("unknown grams and unknown time name the real cause (blockedUnknown)", () => {
    load("unknown");
    expect(derived.value.notCounted.some((n) => n.kind === "time")).toBe(true);
    expect(exportBlock()).toBe("quote.blockedUnknown");
    load("ok", { draft: (d) => d });
    store.plates = store.plates.map((p) => ({ ...p, slots: p.slots.map((s, i) => (i === 0 ? { ...s, grams: null } : s)) }));
    expect(exportBlock()).toBe("quote.blockedUnknown");
  });
  test("missing time alone blocks", () => {
    load("ok");
    store.plates = store.plates.map((p) => ({ ...p, seconds: null }));
    expect(exportBlock()).toBe("quote.blockedUnknown");
  });
  test("an unpriced filament blocks with the filament reason", () => {
    load("unmatched");
    expect(exportBlock()).toBe("quote.blockedIncomplete");
  });
  test("missing energy price, labor rate and printer wear do not block", () => {
    load("ok", { settings: (s) => ({ ...s, defaults: { ...s.defaults, energyPerKwh: null, laborPerHourMinor: null, depreciationEnabled: true } }) });
    expect(derived.value.notCounted.map((n) => n.kind)).toEqual(expect.arrayContaining(["energy", "labor"]));
    expect(exportBlock()).toBe("");
  });
  test("QuoteActions shows the reason instead of the buttons", async () => {
    load("unknown");
    const el = await show(QuoteActions);
    expect(txt(el)).toContain("Not ready to send: 2 things to fix.");
    expect(txt(el)).toContain("Plate 1: print time is unknown.");
    expect(txt(el)).toContain("Slice again in OrcaSlicer, then Refresh.");
    expect(el.textContent).not.toContain("CSV");
  });
});

describe("F4 saved-quote banner and escape hatches", () => {
  test("banner with both actions; Close quote returns to a live draft", async () => {
    load("savedQuote");
    const el = await show(PlateList);
    const banner = el.querySelector("[data-quote-banner]")!;
    expect(txt(banner)).toMatch(/Quote #\d{4} · saved/);
    expect(banner.textContent).toContain("Use current slice");
    expect(store.draft.frozenPlates).not.toBeNull();
    btn(banner as HTMLElement, "Close quote").click();
    await flush();
    expect(store.draft.frozenPlates).toBeNull();
    expect(el.querySelector("[data-quote-banner]")).toBeNull();
  });
  test("Use current slice keeps the other fields and thaws the plates", async () => {
    load("savedQuote");
    const el = await show(PlateList);
    const customer = store.draft.customer;
    btn(el, "Use current slice").click();
    await flush();
    expect(store.draft.frozenPlates).toBeNull();
    expect(store.draft.customer).toBe(customer);
  });
  test("a live slice that arrived meanwhile is named in the banner and wins on Use current slice", async () => {
    load("savedQuote");
    const fresh: HostPlate[] = fixturePlates().slice(0, 1);
    store.pendingPlates = fresh;
    const el = await show(PlateList);
    expect(txt(el.querySelector("[data-quote-banner]"))).toContain("New slice from OrcaSlicer.");
    useCurrentSlice();
    expect(store.plates).toEqual(fresh);
    expect(store.pendingPlates).toBeNull();
    expect(store.draft.frozenPlates).toBeNull();
  });
  test("closeQuote resets to a fresh draft", () => {
    load("savedQuote");
    closeQuote();
    expect(store.draft.quoteId).toBeNull();
  });
});

describe("F5 offline alert", () => {
  test("warn alert with the URL, Retry and Settings", async () => {
    load("ok");
    store.spoolman = { ...store.spoolman, state: "offline", error: "net" };
    const el = await show(PlateList);
    const a = el.querySelector("[data-spoolman-offline]")!;
    expect(txt(a)).toContain("isn't responding at");
    btn(a as HTMLElement, "Settings").click();
    expect(store.view).toBe("settings");
  });
  test("no alert while Spoolman is fine", async () => {
    load("ok");
    const el = await show(PlateList);
    expect(el.querySelector("[data-spoolman-offline]")).toBeNull();
  });
});

describe("F6/F7 first run", () => {
  test("collapsed Your time row shows the rate and margin, not a placeholder", async () => {
    load("firstRun", { settings: (s) => ({ ...s, defaults: { ...s.defaults, laborPerHourMinor: 3000 } }) });
    store.settings = { ...store.settings, onboarded: false };
    const el = await show(FirstRunChecklist);
    el.querySelector<HTMLElement>('[data-row="time"]')!.dispatchEvent(new FocusEvent("focusout", { relatedTarget: document.body }));
    await flush();
    const row = txt(el.querySelector('[data-row="time"]'));
    expect(row).toMatch(/R\$30\.00\/h · markup \d+(\.\d)?%/);
    expect(row).not.toContain("Labor rate BRL");
  });
  test("a currency change with money defaults set says so once", async () => {
    load("firstRun", { settings: (s) => ({ ...s, currency: "USD", defaults: { ...s.defaults, energyPerKwh: "0.95" } }) });
    store.settings = { ...store.settings, onboarded: false, currency: "USD" };
    store.spoolman = { state: "unset", data: { currency: null, filaments: [], spools: [] }, error: null };
    await show(FirstRunChecklist);
    store.spoolman = { state: "ok", data: { currency: "BRL", filaments: [], spools: [] }, error: null };
    await flush();
    expect(toasts.list.map((x) => x.text)).toEqual(["Prices are now in BRL. Check the energy and labor values."]);
  });
});

describe("F8 header before the state is known", () => {
  test("loading shows only the mark and tabs", async () => {
    load("ok");
    store.status = "loading";
    const el = await show(AppHeader, { view: "calc" });
    expect(el.querySelector("[role=tablist]")).not.toBeNull();
    expect(txt(el)).not.toMatch(/Untitled project|No printer|USD|Spoolman/);
    expect(el.querySelector("select")).toBeNull();
    store.status = "ready";
  });
});

describe("F9 empty state", () => {
  test("body text in both empty cases, quiet sentence, no quote actions", async () => {
    load("empty");
    const list = await show(PlateList);
    expect(txt(list)).toContain("Slice the project in OrcaSlicer.");
    const panel = await show(PricePanel);
    const s = panel.querySelector('[data-testid="hero-sentence"] p')!;
    expect(s.className).toContain("sm");
    expect(s.className).not.toContain("xl-sentence");
    expect(panel.querySelector(".qa")).toBeNull();
  });
});

describe("F10/F11 picker", () => {
  test("Pick spool flag opens the plate rows and that slot's picker", async () => {
    load("unmatched");
    const el = await show(PlateList);
    const panel = await show(PriceFlags);
    btn(panel, "Pick spool").click();
    await flush();
    expect(el.querySelector(".rows")).not.toBeNull();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
  test("unpriced slot gets a bad icon and an sr reason on the plate cost", async () => {
    load("unmatched");
    const el = await show(PlateList);
    expect(txt(el)).toContain("missing filament price");
  });
  test("the slot's own material is listed first and focus returns to Change after a pick", async () => {
    load("ok");
    const el = await show(PlateList);
    el.querySelector<HTMLButtonElement>(".chip")!.click();
    await flush();
    const change = [...el.querySelectorAll<HTMLButtonElement>(".mrow button")].find((b) => b.textContent?.includes("Change"))!;
    change.focus();
    change.click();
    await flush();
    await flush();
    const first = document.querySelector('[role="listbox"] [role="group"]')?.getAttribute("aria-label") ?? document.querySelector(".p-listbox-option-group")?.textContent;
    expect(first?.trim().toUpperCase()).toBe("PLA");
    document.querySelector<HTMLElement>('[role="option"] .opt')!.click();
    await flush();
    await flush();
    expect(document.activeElement).toBe(change);
  });
});

describe("F12 provenance and snapshot", () => {
  test("filament id is persisted in the snapshot and the badge names its namespace", async () => {
    load("ok");
    const q = await saveQuote();
    expect(q).not.toBeNull();
    const withId = q!.plates.flatMap((p) => p.slots).filter((s) => s.source === "name");
    for (const s of withId) expect(typeof s.filamentId).toBe("number");
    openQuote(q!.id);
    const el = await show(PlateList);
    expect(txt(el)).not.toMatch(/(^|\s)#(\s|$)/);
  });
});

describe("F15 header tabs: manual activation", () => {
  test("arrows and End move focus only; Enter/click activates", async () => {
    const seen: string[] = [];
    const el = await show(AppHeader, { view: "calc", "onUpdate:view": (v: string) => seen.push(v) });
    const tabs = [...el.querySelectorAll<HTMLElement>("[role=tab]")];
    const key = async (to: HTMLElement, code: string) => { to.dispatchEvent(new KeyboardEvent("keydown", { key: code, code, bubbles: true })); await flush(); };
    tabs[0]!.focus();
    await key(tabs[0]!, "ArrowRight");
    expect(document.activeElement).toBe(tabs[1]);
    await key(tabs[1]!, "End");
    expect(document.activeElement).toBe(tabs[3]);
    expect(seen).toEqual([]); // moving focus never switches the view
    tabs[3]!.click();
    expect(seen).toEqual(["settings"]);
  });
  test("automatic mode still selects on arrow", async () => {
    const seen: string[] = [];
    const el = await show(Segmented, { options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], modelValue: "a", label: "s", "onUpdate:modelValue": (v: string) => seen.push(v) });
    el.querySelector("button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(seen).toEqual(["b"]);
  });
});

describe("F14 invalid field flag", () => {
  test("an invalid number field shows the flag and clears when fixed", async () => {
    load("ok");
    const el = await show({ components: { NumberField, PriceFlags }, template: '<NumberField :model-value="30" label="m" :scale="1" :step="1" id="t-inv" /><PriceFlags />' } as never);
    expect(txt(el)).not.toContain("A field has an error");
    const input = el.querySelector<HTMLInputElement>("#t-inv")!;
    input.focus();
    input.value = "abc";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.blur();
    await flush();
    expect(txt(el)).toContain("A field has an error; using its last valid value.");
    input.value = "30";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    expect(txt(el)).not.toContain("A field has an error");
  });
});

describe("wear shortcut with no printer model", () => {
  test("the Set action is hidden when the host reports no printer", async () => {
    load("ok", { settings: (s) => ({ ...s, defaults: { ...s.defaults, depreciationEnabled: true } }) });
    store.host = { ...store.host, printerModel: null, printerVendor: null };
    expect(derived.value.notCounted.map((n) => n.kind)).toContain("wear");
    const el = await show(PriceFlags);
    expect(txt(el)).toContain("Not counted yet");
    expect(txt(el)).not.toMatch(/\bSet\b/);
  });
});

describe("F18/F19 copy", () => {
  test("rounded line is plain language with the pre-rounding price, not a mode name", async () => {
    load("ok");
    const el = await show(PricePanel);
    expect(txt(el)).toMatch(/Rounded up from R\$\d+\.\d\d/);
    expect(txt(el)).not.toMatch(/Ends in|Round \(|significant/);
  });
  test("no rounded line when rounding is off", async () => {
    load("ok", { settings: (s) => ({ ...s, defaults: { ...s.defaults, pretty: "none" } }) });
    const el = await show(PricePanel);
    expect(txt(el)).not.toContain("Rounded up");
  });
  test("one piece with shipping is singular", async () => {
    load("ok", { settings: (s) => ({ ...s, defaults: { ...s.defaults, shipping: { mode: "customer", minor: 2500 } } }) });
    const el = await show(PricePanel);
    expect(txt(el)).toMatch(/order total for 1 piece incl\./);
    expect(txt(el)).not.toContain("1 pieces");
  });
  test("pt-BR has the same sentences", async () => {
    load("ok");
    setLocale("pt-BR");
    const el = await show(PricePanel);
    expect(txt(el)).toMatch(/Arredondado para cima de R\$\s?\d+,\d\d/);
  });
});

describe("F22 setView flush", () => {
  test("no save when nothing is pending; a pending edit is flushed", async () => {
    load("ok");
    await flushSettings(); // settle edits left pending by earlier tests
    vi.mocked(call).mockClear();
    vi.useFakeTimers();
    setView("settings");
    await Promise.resolve();
    expect(vi.mocked(call).mock.calls.filter((c) => c[0] === "save_settings")).toHaveLength(0);
    patchSettings({ language: "en" });
    setView("calc");
    await Promise.resolve();
    expect(vi.mocked(call).mock.calls.filter((c) => c[0] === "save_settings")).toHaveLength(1);
    vi.useRealTimers();
  });
});

describe("sheet details are frozen at save time", () => {
  test("changing the shop name afterwards does not change a saved quote's sheet", async () => {
    load("ok");
    patchSettings((s) => ({ sheet: { ...s.sheet, shopName: "Old Shop", footer: "Old footer", validityDays: 7 } }));
    const q = await saveQuote();
    // brand text fields are frozen too; the logo and the next number are not
    expect(q?.sheet).toEqual({
      shopName: "Old Shop", footer: "Old footer", validityDays: 7, taxId: "", phone: "+55 11 5550-0100", email: "hello@studiolayer.example",
      website: "", address: "Rua das Camadas, 120\nSão Paulo, SP", payment: "", accent: "#00675B",
    });
    patchSettings((s) => ({ sheet: { ...s.sheet, shopName: "New Shop", footer: "New footer", validityDays: 30 } }));
    const m = sheetFor(store.quotes.find((x) => x.id === q!.id)!)!;
    expect(m.shop).toBe("Old Shop");
    expect(m.footer).toBe("Old footer");
  });
  test("an older quote without a snapshot falls back to today's details", () => {
    load("ok");
    const old = { ...store.quotes[0]! };
    delete old.sheet;
    patchSettings((s) => ({ sheet: { ...s.sheet, shopName: "Today Shop" } }));
    expect(sheetFor(old)?.shop).toBe("Today Shop");
  });
});

describe("F9 follow-up: the empty state raises no field-error flag", () => {
  test("no plates is a hero sentence, not an invalid field", async () => {
    load("empty");
    const el = await show(PriceFlags);
    expect(txt(el)).not.toContain("A field has an error");
  });
});
