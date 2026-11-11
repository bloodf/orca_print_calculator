// T5.3 review fixes, part 2: currency of saved quotes, pinned currency, serialized writes (bridge mocked).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({})) }));
import { BridgeError, call } from "../src/bridge";
import PlateList from "../src/components/plates/PlateList.vue";
import PricePanel from "../src/components/price/PricePanel.vue";
import { setLocale } from "../src/i18n";
import { deleteQuote, openQuote, saveQuote } from "../src/state/quotes";
import * as S from "../src/state/store";
import { clearToasts, toasts } from "../src/state/toast";
import { load } from "./priceKit";

const calls = () => vi.mocked(call);
let apps: { app: App; root: HTMLElement }[] = [];
const mountC = async (c: unknown): Promise<HTMLElement> => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const app = createApp({ render: () => h(c as never) });
  app.mount(root);
  apps.push({ app, root });
  for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
  return root;
};
beforeEach(() => { setLocale("en"); clearToasts(); calls().mockReset(); calls().mockResolvedValue({} as never); });
afterEach(() => { for (const a of apps) { a.app.unmount(); a.root.remove(); } apps = []; });

describe("MEDIUM: a saved quote renders and computes in its own currency", () => {
  test("opening a BRL quote while today's currency is USD keeps BRL, labels and digits", async () => {
    load("savedQuote");
    S.store.settings = { ...S.store.settings, currency: "USD" };
    S.store.spoolman = { ...S.store.spoolman, data: { ...S.store.spoolman.data, currency: null } };
    expect(S.liveCurrency.value).toBe("USD");
    expect(S.store.draft.currency).toBe("BRL");
    expect(S.currency.value).toBe("BRL");
    const el = await mountC(PricePanel);
    expect(el.textContent).toContain("R$");
    expect(el.textContent).not.toMatch(/(^|[^R])\$\d|US\$/);
  });
  test("different digit counts: a JPY quote reopened under BRL still reads as yen", async () => {
    load("savedQuote");
    const q = S.store.quotes[0]!;
    S.store.quotes = [{ ...q, currency: "JPY" }];
    S.store.draft = { ...S.store.draft, currency: null };
    openQuote(q.id);
    expect(S.currency.value).toBe("JPY");
    expect(S.digits.value).toBe(0);
  });
  test("the banner names the difference and offers no Use current slice while currencies differ", async () => {
    load("savedQuote");
    S.store.settings = { ...S.store.settings, currency: "USD" };
    S.store.spoolman = { ...S.store.spoolman, data: { ...S.store.spoolman.data, currency: null } };
    const el = await mountC(PlateList);
    const banner = el.querySelector("[data-quote-banner]")!;
    expect(banner.textContent).toMatch(/BRL/);
    expect(banner.textContent).toMatch(/USD/);
    expect(banner.textContent).not.toContain("Use current slice");
    expect(banner.textContent).toContain("Close quote");
  });
  test("same currency: unchanged banner with Use current slice", async () => {
    load("savedQuote");
    const el = await mountC(PlateList);
    expect(el.querySelector("[data-quote-banner]")!.textContent).toContain("Use current slice");
  });
  test("closing the quote returns to the live currency", () => {
    load("savedQuote");
    S.store.draft = { ...S.store.draft, currency: null };
    expect(S.currency.value).toBe(S.liveCurrency.value);
  });
});

describe("MEDIUM: the effective currency is pinned once money exists", () => {
  test("typing the first money default records the currency and where it was entered", () => {
    load("firstRun");
    S.store.status = "ready";
    S.store.settings = { ...S.store.settings, currency: null, defaultsCurrency: null, onboarded: false, defaults: { ...S.store.settings.defaults, energyPerKwh: null, laborPerHourMinor: null } };
    S.store.spoolman = { state: "unset", data: { currency: null, filaments: [], spools: [] }, error: null };
    S.patchSettings({ language: "en" });
    expect(S.store.settings.currency).toBeNull(); // nothing entered yet
    S.patchDefaults({ laborPerHourMinor: 3000 });
    expect(S.store.settings.currency).toBe(S.liveCurrency.value);
    expect(S.store.settings.defaultsCurrency).toBe(S.liveCurrency.value);
  });
  test("finishing the checklist pins it too", () => {
    load("firstRun");
    S.store.status = "ready";
    S.store.settings = { ...S.store.settings, currency: null, defaultsCurrency: null, onboarded: false };
    S.finishOnboarding();
    expect(S.store.settings.currency).not.toBeNull();
    expect(S.store.settings.onboarded).toBe(true);
  });
  test("an already pinned currency is never overwritten", () => {
    load("ok");
    S.store.settings = { ...S.store.settings, currency: "EUR", defaultsCurrency: "EUR" };
    S.patchDefaults({ laborPerHourMinor: 100 });
    expect(S.store.settings.currency).toBe("EUR");
  });
});

describe("LOW: overlapping writes", () => {
  test("a failing save does not roll back a later successful change, and retry rebuilds from the current list", async () => {
    load("ok");
    S.store.status = "ready";
    S.resetDraft();
    const a = S.store.quotes[0]!;
    const b = S.store.quotes[1]!;
    calls().mockRejectedValueOnce(new BridgeError("io"));
    const p1 = deleteQuote(a.id);
    const p2 = deleteQuote(b.id);
    await Promise.all([p1, p2]);
    // first write failed (a stays), second succeeded (b gone)
    expect(S.store.quotes.map((q) => q.id)).toEqual([a.id]);
    const retry = toasts.list.find((t) => t.action?.label === "Try again");
    expect(retry).toBeDefined();
    calls().mockClear();
    retry!.action!.run();
    await new Promise((r) => setTimeout(r, 0));
    const sentList = (calls().mock.calls[0]![1] as { quotes: { id: string }[] }).quotes.map((q) => q.id);
    expect(sentList).not.toContain(b.id); // the retry does not bring back what the second write removed
    expect(S.store.quotes.map((q) => q.id)).toEqual([]);
  });
  test("nothing is written before get_state succeeded", async () => {
    load("ok");
    S.store.status = "error";
    const r = await saveQuote();
    expect(r).toBeNull();
    expect(calls().mock.calls.filter((c) => c[0] === "save_quotes")).toHaveLength(0);
    S.store.status = "ready";
  });
  test("rows that could not be read are written back untouched with every save", async () => {
    load("ok");
    S.store.status = "ready";
    S.store.quarantined = [{ id: "bad", junk: true }];
    S.resetDraft();
    await saveQuote();
    const sent = calls().mock.calls.find((c) => c[0] === "save_quotes")![1] as { quotes: { id: string }[] };
    expect(sent.quotes.map((q) => q.id)).toContain("bad");
    S.store.quarantined = [];
  });
});

describe("MEDIUM: the price panel says when defaults were typed in another currency", () => {
  test("flag with the old code; none when the currency matches", async () => {
    const { default: PriceFlags } = await import("../src/components/price/PriceFlags.vue");
    load("ok");
    S.store.settings = { ...S.store.settings, defaultsCurrency: "USD" };
    const el = await mountC(PriceFlags);
    expect(el.textContent).toContain("Defaults were entered in USD");
    S.store.settings = { ...S.store.settings, defaultsCurrency: "BRL" };
    await nextTick();
    expect(el.textContent).not.toContain("Defaults were entered");
  });
});

describe("MEDIUM: Save buttons show the save in flight", () => {
  test("aria-busy while saving; one record after two clicks", async () => {
    const { default: QuoteActions } = await import("../src/components/quotes/QuoteActions.vue");
    load("ok");
    S.store.status = "ready";
    S.resetDraft();
    let release: () => void = () => undefined;
    calls().mockImplementation((() => new Promise((r) => { release = () => r({}); })) as never);
    const el = await mountC(QuoteActions);
    const save = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Save quote"))!;
    const before = S.store.quotes.length;
    save.click(); save.click();
    await nextTick();
    expect(save.getAttribute("aria-busy")).toBe("true");
    release();
    for (let i = 0; i < 30; i++) { await nextTick(); await Promise.resolve(); release(); }
    expect(S.store.quotes.length - before).toBe(1);
    expect(el.querySelector("[aria-busy]")).toBeNull();
  });
});
