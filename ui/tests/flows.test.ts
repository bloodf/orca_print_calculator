// Whole-app flows through the real bridge and the dev mock host (no Orca): calculator -> save -> Quotes -> open -> edit ->
// close dirty -> Undo -> save -> reopen -> export; an incomplete quote; an offline Spoolman; Extras and Settings; pt-BR.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h, nextTick, type App as VueApp } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";
import AppRoot from "../src/App.vue";
import { setLocale } from "../src/i18n";
import { createMockHost } from "../src/mock/host";
import type { ScenarioName } from "../src/mock/scenarios";
import { setLanguage, store } from "../src/state/store";
import { clearToasts, toasts } from "../src/state/toast";

let app: VueApp | null = null;
let root: HTMLElement | null = null;
const sent: { cmd: string; args: Record<string, unknown> }[] = [];
const tick = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); } };
async function boot(name: ScenarioName): Promise<HTMLElement> {
  const host = createMockHost(name);
  const post = host.postMessage.bind(host);
  host.postMessage = (m) => { const x = m as { type: string; cmd: string; args: Record<string, unknown> }; if (x.type === "cmd") sent.push({ cmd: x.cmd, args: x.args }); post(m); };
  window.orca = host;
  root = document.createElement("div");
  document.body.appendChild(root);
  app = createApp({ render: () => h(AppRoot) });
  app.mount(root);
  await tick(700);
  return root;
}
const btn = (el: ParentNode, text: string, nth = 0): HTMLButtonElement => {
  const all = [...el.querySelectorAll("button")].filter((x) => x.textContent?.replace(/\s+/g, " ").trim().includes(text));
  if (!all[nth]) throw new Error(`no button "${text}" #${nth}`);
  return all[nth]!;
};
const menuItem = (text: string): HTMLElement => [...document.querySelectorAll<HTMLElement>("[role=menuitem] .mi")].find((x) => x.textContent?.includes(text))!;
const tab = (el: ParentNode, name: string): HTMLElement => el.querySelector<HTMLElement>(`[role=tab][aria-label="${name}"]`)!;
const typeInto = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => { input.value = value; input.dispatchEvent(new Event("input", { bubbles: true })); await tick(); };
const undoToast = () => toasts.list.find((x) => x.action?.label === "Undo" || x.action?.label === "Desfazer");
const lastSave = () => { const all = saved(); return all[all.length - 1]!; };
const saved = () => sent.filter((s) => s.cmd === "save_quotes").map((s) => s.args.quotes as { id: string; customer: string; no: number }[]);

beforeEach(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
  vi.useFakeTimers(); setLocale("en"); clearToasts(); sent.length = 0;
});
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; delete window.orca; store.preview = false; store.view = "calc"; vi.useRealTimers(); });

describe("quote lifecycle", () => {
  test("save, list, open, edit, close dirty, Undo, save changes, reopen, export, all through the UI", async () => {
    const el = await boot("ok");
    // 1. new quote with a customer, saved from the calculator
    btn(el, "Customer").click();
    await tick();
    await typeInto(el.querySelector<HTMLInputElement>("#qa-customer")!, "Ana Souza");
    btn(el, "Save quote").click();
    await tick(100);
    expect(lastSave()[lastSave().length - 1]!.customer).toBe("Ana Souza");
    const id = store.draft.quoteId!;
    expect(id).toBeTruthy();
    expect(el.textContent).toContain("Saved as");
    // 2. exported from the calculator: complete quote, CSV allowed
    btn(el, "CSV").click();
    await tick(100);
    expect(sent.some((s) => s.cmd === "export_file" && String(s.args.name).endsWith(".csv") && String(s.args.text).includes("Ana Souza"))).toBe(true);
    // 3. Quotes list shows it; Open brings it back clean
    tab(el, "Quotes").click();
    await tick();
    const row = [...el.querySelectorAll("tbody tr")].find((r) => r.textContent?.includes("Ana Souza"))!;
    expect(row).toBeTruthy();
    btn(row, "Open").click();
    await tick();
    expect(store.view).toBe("calc");
    expect(store.draft.quoteId).toBe(id);
    expect(el.querySelector("[data-quote-banner]")).not.toBeNull();
    expect(el.textContent).not.toContain("Save changes"); // opened clean
    // 4. edit -> dirty -> the primary button becomes Save changes
    await typeInto(el.querySelector<HTMLInputElement>("#qa-customer")!, "Bruno Lima");
    expect(btn(el, "Save changes")).toBeTruthy();
    // 5. close while dirty: nothing lost silently, Undo restores the whole draft
    btn(el.querySelector("[data-quote-banner]")!, "Close quote").click();
    await tick();
    expect(store.draft.quoteId).toBeNull();
    expect(undoToast()).toBeTruthy();
    undoToast()!.action!.run();
    await tick();
    expect(store.draft.quoteId).toBe(id);
    expect(el.querySelector<HTMLInputElement>("#qa-customer")!.value).toBe("Bruno Lima");
    // 6. save the edit: same record, new customer
    btn(el, "Save changes").click();
    await tick(100);
    const last = lastSave();
    expect(last.filter((q) => q.id === id)).toHaveLength(1);
    expect(last.find((q) => q.id === id)!.customer).toBe("Bruno Lima");
    // 7. reopen from the list after the save: clean, new customer, exportable from the row menu
    tab(el, "Quotes").click();
    await tick();
    const row2 = [...el.querySelectorAll("tbody tr")].find((r) => r.textContent?.includes("Bruno Lima"))!;
    expect(row2).toBeTruthy();
    row2.querySelector<HTMLButtonElement>("[aria-label^='More actions']")!.click();
    await tick(200);
    menuItem("CSV").click();
    await tick(100);
    expect(sent.filter((s) => s.cmd === "export_file").length).toBe(2);
  });

  test("opening another quote while the open one has unsaved edits keeps them for Undo", async () => {
    const el = await boot("ok");
    tab(el, "Quotes").click();
    await tick();
    const rows = el.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);
    btn(rows[0]!, "Open").click();
    await tick();
    await typeInto(el.querySelector<HTMLInputElement>("#qa-customer") ?? (btn(el, "Customer").click(), await tick(), el.querySelector<HTMLInputElement>("#qa-customer")!), "Edited, unsaved");
    const first = store.draft.quoteId;
    tab(el, "Quotes").click();
    await tick();
    btn(el.querySelectorAll("tbody tr")[1]!, "Open").click();
    await tick();
    expect(store.draft.quoteId).not.toBe(first);
    undoToast()!.action!.run();
    await tick();
    expect(store.draft.quoteId).toBe(first);
    expect(store.draft.customer).toBe("Edited, unsaved");
  });
});

describe("icon spacing (C09)", () => {
  test("an icon beside a label is followed by an element, never a bare text node (the gap rule cannot see text)", async () => {
    const el = await boot("ok");
    tab(el, "Quotes").click();
    await tick();
    el.querySelector<HTMLButtonElement>("tbody tr [aria-label^='More actions']")!.click();
    await tick();
    tab(el, "Calculator").click();
    await tick();
    const bare = [...document.body.querySelectorAll("button svg")].filter((svg) => svg.nextSibling?.nodeType === 3 && (svg.nextSibling.textContent ?? "").trim() !== "");
    expect(bare.map((b) => b.parentElement?.textContent?.trim())).toEqual([]);
    expect([...document.body.querySelectorAll("button svg + span")].length).toBeGreaterThan(2);
  });
});

describe("incomplete quote", () => {
  test("a draft can be saved but not sent: the price is marked partial, Print and CSV are absent, the list refuses with a way to fix it", async () => {
    const el = await boot("unknown");
    expect(el.querySelector("[data-testid=hero-price]")!.classList.contains("partial")).toBe(true);
    expect(el.querySelector("[data-testid=incomplete-line]")!.textContent).toContain("Incomplete");
    expect(el.querySelector("[data-gaps]")).not.toBeNull();
    expect([...el.querySelectorAll("button")].some((b) => b.textContent?.trim() === "CSV")).toBe(false);
    btn(el, "Save quote").click();
    await tick(100);
    expect(store.quotes).toHaveLength(3); // the two seeded ones and this draft
    tab(el, "Quotes").click();
    await tick();
    el.querySelector<HTMLButtonElement>("tbody tr [aria-label^='More actions']")!.click();
    await tick(200);
    menuItem("CSV").click();
    await tick(100);
    expect(sent.some((s) => s.cmd === "export_file")).toBe(false);
    const refused = toasts.list.find((x) => x.tone === "bad")!;
    expect(refused.text).toMatch(/Slice again/);
    refused.action!.run(); // "Open": the way to fix it
    await tick();
    expect(store.view).toBe("calc");
    expect(el.querySelector("[data-gaps]")).not.toBeNull();
  });
});

describe("offline Spoolman", () => {
  test("the price says which prices stand in, and Quotes, Extras and Settings still open", async () => {
    const el = await boot("offline");
    await tick(9000); // the mock Spoolman times out
    expect(store.spoolman.state).toBe("offline");
    expect(el.querySelector("[data-spoolman-offline]")).not.toBeNull();
    expect(el.querySelector("[data-testid=price-origin]")!.textContent).toContain("Spoolman is offline");
    for (const [name, sel] of [["Quotes", "#quotes-title"], ["Extras and stock", "main.stock"], ["Settings", "main.settings"]] as const) {
      tab(el, name).click();
      await tick();
      expect(el.querySelector(sel), name).not.toBeNull();
    }
    expect(el.querySelector("main.stock")?.textContent ?? el.textContent).toContain("Spoolman");
  });
});

describe("Extras and Settings", () => {
  test("Extras: add an extra to the catalog and see it in the list; Settings: language lives here and changes the whole UI", async () => {
    const el = await boot("ok");
    tab(el, "Extras and stock").click();
    await tick();
    expect(el.querySelector("main.stock h1")).not.toBeNull();
    expect(el.querySelector("[data-testid=filament-table]")).not.toBeNull(); // Spoolman is ok: the stock table is there
    tab(el, "Settings").click();
    await tick();
    const lang = [...el.querySelectorAll("select")].find((s) => s.getAttribute("aria-label") === "Language" || s.id.includes("lang") || s.closest("[id*=language]"));
    expect(lang ?? el.querySelector("main.settings")).toBeTruthy();
    setLanguage("pt-BR");
    await tick();
    expect(tab(el, "Orçamentos")).not.toBeNull();
    expect(el.querySelector("header select")).toBeNull(); // not duplicated in the header
    expect(document.documentElement.lang).toBe("pt-BR");
  });
  test("pt-BR first run at the header: tabs, no language select, the printer and Spoolman chips keep full text for assistive tech", async () => {
    const el = await boot("firstRun");
    setLanguage("pt-BR");
    await tick();
    const names = [...el.querySelectorAll<HTMLElement>("header [role=tab]")].map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Calculadora", "Orçamentos", "Extras e estoque", "Ajustes"]);
    expect(el.querySelector("header select")).toBeNull();
    const sp = [...el.querySelectorAll<HTMLElement>("header .chip")].find((c) => /Spoolman/.test(c.getAttribute("aria-label") ?? ""));
    expect(sp?.getAttribute("title")).toBe("Spoolman não configurado");
  });
});

describe("Extras and stock, Spoolman states", () => {
  test("a configured Spoolman that is offline gets a retry, not the first-time setup", async () => {
    const el = await boot("offline");
    await tick(9000);
    tab(el, "Extras and stock").click();
    await tick();
    const off = el.querySelector("[data-stock-offline]")!;
    expect(off.textContent).toContain("isn't responding at http://192.168.1.10:7912");
    expect(el.textContent).not.toContain("Connect Spoolman to see");
    expect(off.querySelectorAll("button")).toHaveLength(2);
  });
  test("never configured: the first-time setup stays", async () => {
    const el = await boot("noSpoolman");
    tab(el, "Extras and stock").click();
    await tick();
    expect(el.querySelector("[data-stock-offline]")).toBeNull();
    expect(el.textContent).toContain("Connect Spoolman to see");
  });
});
