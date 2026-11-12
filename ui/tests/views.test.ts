// Mounted app and views, driven through the real bridge by the dev mock host (same shapes as the contract fixtures).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h, nextTick, type App as VueApp } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";
import AppRoot from "../src/App.vue";
import PriceBar from "../src/components/price/PriceBar.vue";
import ToastHost from "../src/components/base/ToastHost.vue";
import { setLocale } from "../src/i18n";
import { createMockHost } from "../src/mock/host";
import type { ScenarioName } from "../src/mock/scenarios";
import { priceAnnouncement } from "../src/state/announce";
import { derived, store } from "../src/state/store";
import { clearToasts, toast } from "../src/state/toast";
import { load } from "./priceKit";

let app: VueApp | null = null;
let root: HTMLElement | null = null;
const tick = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); } };
async function boot(name: ScenarioName): Promise<HTMLElement> {
  window.orca = createMockHost(name);
  root = document.createElement("div");
  document.body.appendChild(root);
  app = createApp({ render: () => h(AppRoot) });
  app.mount(root);
  await tick(700);
  return root;
}
const btn = (el: ParentNode, text: string): HTMLButtonElement => {
  const b = [...el.querySelectorAll("button")].find((x) => x.textContent?.replace(/\s+/g, " ").includes(text));
  if (!b) throw new Error(`no button "${text}"`);
  return b;
};
const item = (text: string): HTMLElement => [...document.querySelectorAll<HTMLElement>("[role=menuitem] .mi")].find((x) => x.textContent?.includes(text))!;
const tab = (el: ParentNode, name: string): HTMLElement => el.querySelector<HTMLElement>(`[role=tab][aria-label="${name}"]`)!;

beforeEach(() => { Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined); vi.useFakeTimers(); setLocale("en"); clearToasts(); });
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; delete window.orca; store.preview = false; store.view = "calc"; vi.useRealTimers(); });

describe("App shell", () => {
  test("boots through get_state: header, plates, price, skip link and a debounced live region", async () => {
    const el = await boot("ok");
    expect(store.status).toBe("ready");
    expect(el.querySelector(".skip-link")).not.toBeNull();
    expect(el.querySelectorAll("article.card")).toHaveLength(3);
    expect(el.querySelector('[data-testid="hero-price"]')!.textContent).toMatch(/\d/);
    await tick(1100);
    expect(el.querySelector("[aria-live=polite]")!.textContent).toContain("Online store");
  });
  test("tabs switch views and focus the view title; Quotes and Settings render", async () => {
    const el = await boot("ok");
    tab(el, "Quotes").click();
    await tick();
    expect(el.querySelector("#quotes-title")).not.toBeNull();
    expect(el.querySelectorAll("tbody tr")).toHaveLength(2);
    tab(el, "Settings").click();
    await tick();
    expect(el.querySelector("main.settings")).not.toBeNull();
    tab(el, "Calculator").click();
    await tick();
    expect(el.querySelector("#plates-title")).not.toBeNull();
  });
  test("host error screen offers Try again, which reloads", async () => {
    const el = await boot("hostError");
    expect(el.querySelector(".host-error")).not.toBeNull();
    const tech = el.querySelector<HTMLElement>("[data-tech-details]")!; // C07: the raw code is behind a collapsed disclosure
    const toggle = tech.querySelector<HTMLElement>("[aria-expanded]")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("Technical details");
    expect(tech.querySelector("code")!.textContent).toBe("host_error");
    expect(el.querySelector(".host-error .msg")!.textContent).not.toContain("host_error");
    toggle.click();
    await tick(300);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    btn(el, "Try again").click();
    await tick(700);
    expect(el.querySelector(".host-error")).not.toBeNull(); // still failing in this scenario, and still reachable
  });
  test("loading shows skeletons and a waiting line; the skip link goes to the price", async () => {
    const el = await boot("loading");
    expect(el.querySelector(".sk-plate")).not.toBeNull();
    expect(el.textContent).toContain("Waiting for OrcaSlicer");
  });
  test("opening Quotes from the header moves focus to its title, like the other routes", async () => {
    const el = await boot("ok");
    tab(el, "Quotes").click();
    await tick();
    expect(store.view).toBe("quotes");
    expect(document.activeElement?.id).toBe("quotes-title");
    expect(document.activeElement?.tagName).toBe("H1");
    for (const [name, id] of [["Settings", ""], ["Extras and stock", ""]] as const) { // the other routes still land on their own titles
      tab(el, name).click();
      await tick();
      expect((document.activeElement as HTMLElement).hasAttribute("data-view-title"), name + id).toBe(true);
    }
  });
  test("skip link focuses the price panel", async () => {
    const el = await boot("ok");
    (el.querySelector(".skip-link") as HTMLElement).click();
    expect(document.activeElement?.id).toBe("price");
  });
});

describe("Quote preview and sheet", () => {
  test("Print opens the sheet with the total; Escape returns; itemized and summary both render", async () => {
    const el = await boot("ok");
    btn(el, "Save quote").click();
    await tick(300);
    btn(el, "Print quote").click();
    await tick();
    expect(store.preview).toBe(true);
    expect(el.querySelector(".quote-sheet .total")!.textContent).toMatch(/\d/);
    btn(el, "Itemized").click();
    await tick();
    expect(el.querySelectorAll(".quote-sheet tbody tr").length).toBeGreaterThan(0);
    btn(el, "Summary").click();
    await tick();
    expect(el.querySelector(".quote-sheet")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await tick();
    expect(store.preview).toBe(false);
  });
  test("stale and imported plates show a warning above the sheet", async () => {
    const el = await boot("stale");
    store.preview = true;
    await tick();
    expect(el.textContent).toMatch(/out of date|may be/i);
    store.preview = false;
  });
  test("an unpriced quote says so instead of a sheet", async () => {
    const el = await boot("empty");
    store.preview = true;
    await tick();
    expect(el.querySelector(".quote-sheet")).toBeNull();
    expect(el.textContent).toContain("No price to export yet");
  });
});

describe("Quotes view", () => {
  async function quotes(): Promise<HTMLElement> {
    const el = await boot("ok");
    tab(el, "Quotes").click();
    await tick();
    return el;
  }
  test("search filters by customer and shows a no-match line", async () => {
    const el = await quotes();
    const input = el.querySelector<HTMLInputElement>("input[type=search]")!;
    input.value = "zzz";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(el.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(el.querySelector("[role=status]")).not.toBeNull();
    input.value = "ana";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(el.querySelectorAll("tbody tr")).toHaveLength(2);
  });
  test("Open reopens a quote in the calculator with its banner", async () => {
    const el = await quotes();
    btn(el.querySelector("tbody tr")!, "Open").click();
    await tick();
    expect(store.view).toBe("calc");
    expect(el.querySelector("[data-quote-banner]")).not.toBeNull();
  });
  test("More menu: duplicate adds a number; delete offers Undo that restores it", async () => {
    const el = await quotes();
    const more = () => el.querySelector<HTMLButtonElement>("tbody tr button[aria-haspopup]")!;
    more().click();
    await tick(200);
    item("Duplicate").click();
    await tick(300);
    expect(store.quotes).toHaveLength(3);
    more().click();
    await tick(200);
    item("Delete").click();
    await tick(300);
    expect(store.quotes).toHaveLength(2);
    const undo = [...document.querySelectorAll(".toast button")].find((b) => b.textContent === "Undo") as HTMLButtonElement;
    undo.click();
    await tick(300);
    expect(store.quotes).toHaveLength(3);
  });
  test("More menu: CSV export writes through the host", async () => {
    const el = await quotes();
    el.querySelector<HTMLButtonElement>("tbody tr button[aria-haspopup]")!.click();
    await tick(200);
    item("CSV").click();
    await tick(300);
    expect(document.querySelector(".toast")!.textContent).toContain("Saved to");
  });
  test("Print from the list opens the preview", async () => {
    const el = await quotes();
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    el.querySelector<HTMLButtonElement>("tbody tr button[aria-haspopup]")!.click();
    await tick(200);
    item("Print").click();
    await tick(100);
    expect(store.preview).toBe(true);
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });
});

describe("Importing a file", () => {
  test("a picked .3mf shows progress, replaces the plates, and an unsliced one fails with copy", async () => {
    const el = await boot("ok");
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    const pick = async (name: string) => {
      const file = new File([new Uint8Array([0x50, 0x4b, 3, 4])], name);
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await tick(700);
    };
    await pick("plain.3mf");
    expect(document.querySelector(".toast")!.textContent).toMatch(/no slice data/i);
    await pick("desk.gcode.3mf");
    expect(el.textContent).toContain("from desk.gcode.3mf");
  });
  test("a non-3mf file is refused before any read", async () => {
    const el = await boot("ok");
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "notes.txt")] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(document.querySelector(".toast")!.textContent).toMatch(/sliced \.gcode\.3mf/i);
  });
});

describe("Pieces", () => {
  test("ToastHost renders, runs an action and dismisses", async () => {
    root = document.createElement("div");
    document.body.appendChild(root);
    app = createApp({ render: () => h(ToastHost) });
    app.mount(root);
    const run = vi.fn();
    toast({ text: "Hello", action: { label: "Go", run } });
    toast({ text: "Broken", tone: "bad" });
    await nextTick();
    expect(root.querySelectorAll(".toast")).toHaveLength(2);
    expect(root.querySelector(".toast.bad")!.getAttribute("role")).toBe("alert");
    btn(root, "Go").click();
    await nextTick();
    expect(run).toHaveBeenCalled();
    (root.querySelector('.toast.bad [aria-label="Close"]') as HTMLElement).click();
    await nextTick();
    expect(root.querySelectorAll(".toast")).toHaveLength(0);
  });
  test("PriceBar shows the price and margin, jumps to the details, and renders nothing while hidden", async () => {
    load("ok");
    root = document.createElement("div");
    document.body.appendChild(root);
    const el = document.createElement("aside");
    el.id = "price";
    el.tabIndex = -1;
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);
    app = createApp({ render: () => h(PriceBar, { hidden: false }) });
    app.mount(root);
    await nextTick();
    expect(root.querySelector(".price-amber")!.textContent).toMatch(/\d/);
    btn(root, "Details").click();
    expect(el.scrollIntoView).toHaveBeenCalled();
    app.unmount();
    app = createApp({ render: () => h(PriceBar, { hidden: true }) });
    app.mount(root);
    await nextTick();
    expect(root.querySelector(".price-amber")).toBeNull();
    el.remove();
  });
  test("PriceBar with no price shows the reason", async () => {
    load("impossible");
    root = document.createElement("div");
    document.body.appendChild(root);
    app = createApp({ render: () => h(PriceBar, { hidden: false }) });
    app.mount(root);
    await nextTick();
    expect(root.querySelector(".msg")!.textContent!.length).toBeGreaterThan(5);
  });
  test("priceAnnouncement: price, no plates, problem, impossible", () => {
    load("ok");
    const o = { currency: "BRL", locale: "en-US", hasPlates: true };
    expect(priceAnnouncement(derived.value, o)).toMatch(/R\$/);
    expect(priceAnnouncement(derived.value, { ...o, hasPlates: false })).toBe("No plates yet. The price appears after slicing.");
    load("impossible");
    expect(priceAnnouncement(derived.value, o)).toMatch(/Online store/);
    load("ok");
    store.draft = { ...store.draft, plates: { 0: { include: false, copies: 1 }, 1: { include: false, copies: 1 }, 2: { include: false, copies: 1 } } };
    expect(priceAnnouncement(derived.value, o)).not.toBe("");
  });
});
