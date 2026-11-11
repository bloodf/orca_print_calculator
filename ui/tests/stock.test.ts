// Extras and stock tab, stock in the calculator, and the quote sheet branding rules (logo, accent, company lines).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { nextTick } from "vue";
import ExtrasEditor from "../src/components/costs/ExtrasEditor.vue";
import { setLocale } from "../src/i18n";
import { brandOf, sampleSheetModel, sheetHtml } from "../src/quoteExport";
import { defaultSettings, mergeSettings } from "../src/state/defaults";
import { settingsTab } from "../src/state/settingsTab";
import { DEFAULT_ACCENT, EMPTY_BRAND, MAX_LOGO_CHARS, validAccent, validLogo } from "../src/state/sheet";
import { patchDraft, store } from "../src/state/store";
import type { QuoteExtra, Settings } from "../src/state/types";
import StockView from "../src/views/StockView.vue";
import { mount, seed, unmount } from "./costsHarness";
import { lastToast } from "./settings-helpers";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const base = (): Settings => defaultSettings(null, "Direct");
const flush = async () => { for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); } };

describe("validLogo / validAccent", () => {
  test("only an empty string or our own PNG/JPEG data URI", () => {
    expect(validLogo("")).toBe(true);
    expect(validLogo(PNG)).toBe(true);
    expect(validLogo("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
    for (const bad of [
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "data:image/svg+xml,<svg onload=alert(1)>", "javascript:alert(1)", "https://example.com/logo.png",
      "data:image/png;base64,abc\"onerror=x", "data:text/html;base64,PGI+", `data:image/png;base64,${"A".repeat(MAX_LOGO_CHARS)}`, null, 42,
    ]) expect(validLogo(bad), String(bad).slice(0, 40)).toBe(false);
  });
  test("accent is #RRGGBB only", () => {
    expect(validAccent("#00675B")).toBe(true);
    expect(validAccent("#abcdef")).toBe(true);
    for (const bad of ["red", "#FFF", "#GGGGGG", "red;background:url(x)", "#00675B;x:y", "", null]) expect(validAccent(bad), String(bad)).toBe(false);
  });
});

describe("brandOf + sheetHtml", () => {
  beforeEach(() => setLocale("en"));
  const sheet = (b: Partial<typeof EMPTY_BRAND>) => ({ shopName: "Layer <Lab>", footer: "", validityDays: 0, ...EMPTY_BRAND, ...b });

  test("a valid logo becomes an <img>; an invalid one is dropped", () => {
    expect(brandOf({ logo: PNG }).logo).toBe(PNG);
    expect(sheetHtml(sampleSheetModel(sheet({ logo: PNG }), "USD"))).toContain(`<img class="logo" alt="" src="${PNG}">`);
    for (const logo of ["javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zz4=", "https://x.test/a.png"]) {
      expect(brandOf({ logo }).logo).toBe("");
      expect(sheetHtml(sampleSheetModel(sheet({ logo }), "USD"))).not.toContain("<img");
    }
  });
  test("company lines and payment are escaped; tax id and address lines come before the contact line", () => {
    const b = brandOf({ taxId: "CNPJ <b>1</b>", address: "Rua A, 1\n  \nSão Paulo", phone: "555", email: "a@b.c", website: "", payment: "Pix & \"cash\"" });
    expect(b.contact).toEqual(["CNPJ <b>1</b>", "Rua A, 1", "São Paulo", "555 · a@b.c"]);
    expect(b.payment).toEqual({ label: "Payment terms", text: "Pix & \"cash\"" });
    const html = sheetHtml(sampleSheetModel(sheet({ taxId: "CNPJ <b>1</b>", payment: "Pix & \"cash\"" }), "USD"));
    expect(html).toContain("CNPJ &lt;b&gt;1&lt;/b&gt;");
    expect(html).toContain("Pix &amp; &quot;cash&quot;");
    expect(html).toContain("Layer &lt;Lab&gt;");
    expect(html).not.toContain("<b>1</b>");
  });
  test("a hostile accent falls back to the default", () => {
    expect(brandOf({ accent: "red;background:url(x)" }).accent).toBe(DEFAULT_ACCENT);
    const html = sheetHtml(sampleSheetModel(sheet({ accent: "red;background:url(x)" }), "USD"));
    expect(html).toContain(`--accent:${DEFAULT_ACCENT}`);
    expect(html).not.toContain("url(x)");
    expect(sheetHtml(sampleSheetModel(sheet({ accent: "#123ABC" }), "USD"))).toContain("--accent:#123ABC");
  });
  test("no brand: no contact lines, no payment block", () => {
    expect(brandOf({})).toEqual({ logo: "", contact: [], accent: DEFAULT_ACCENT, payment: null });
  });
});

describe("settings merge", () => {
  test("brand fields are kept; invalid ones reset to the built-in value", () => {
    const ok = mergeSettings({ sheet: { shopName: "S", logo: PNG, taxId: "123", phone: "555", email: "e@x.y", website: "x.y", address: "A", payment: "Pix", accent: "#112233" } } as never, base());
    expect(ok.sheet).toMatchObject({ shopName: "S", logo: PNG, taxId: "123", phone: "555", email: "e@x.y", website: "x.y", address: "A", payment: "Pix", accent: "#112233" });
    const bad = mergeSettings({ sheet: { shopName: "S", logo: "javascript:alert(1)", accent: "red;x:y", phone: 5, address: "x".repeat(281) } } as never, base());
    expect(bad.sheet).toMatchObject({ shopName: "S", logo: "", accent: DEFAULT_ACCENT, phone: "", address: "" });
  });
  test("catalog stockE3 survives; a bad stock is dropped, not the item", () => {
    const s = mergeSettings({ extrasCatalog: [
      { key: "a", label: "Ring", unitMinor: 50, qtyE3: 1000, per: "piece", stockE3: 5000 },
      { key: "b", label: "Box", unitMinor: 200, qtyE3: 1000, per: "order", stockE3: -1 },
      { key: "c", label: "Magnet", unitMinor: 10, qtyE3: 2000, per: "plate" },
    ] } as never, base());
    expect(s.extrasCatalog.map((x) => [x.label, x.stockE3])).toEqual([["Ring", 5000], ["Box", undefined], ["Magnet", undefined]]);
  });
});

describe("stock in the calculator extras", () => {
  beforeEach(() => seed({ settings: { extrasCatalog: [
    { key: "c1", label: "Ring", unitMinor: 50, qtyE3: 1000, per: "piece", stockE3: 5000 },
    { key: "c2", label: "Box", unitMinor: 200, qtyE3: 1000, per: "order", stockE3: 0 },
    { key: "c3", label: "Magnet", unitMinor: 10, qtyE3: 2000, per: "plate", stockE3: 1000 },
    { key: "c4", label: "Screw", unitMinor: 5, qtyE3: 1000, per: "piece" },
  ] } }));
  afterEach(() => unmount());
  const row = (label: string, per: QuoteExtra["per"], qtyE3 = 1000): QuoteExtra => ({ key: `x-${label}`, label, unitMinor: 1, qtyE3, per });
  const lines = (root: HTMLElement) => [...root.querySelectorAll(".xstock")].map((e) => [...e.children].map((c) => c.textContent?.trim()).join(" | "));

  test("per piece: warns when quantity × qty is above the stock", async () => {
    patchDraft({ quantity: 12, extras: [row("Ring", "piece")] });
    const root = mount(ExtrasEditor);
    await flush();
    expect(lines(root)).toEqual(["In stock: 5 | Needs 12, 5 in stock"]);
    patchDraft({ quantity: 5 });
    await flush();
    expect(lines(root)).toEqual(["In stock: 5"]);
  });
  test("per piece counts spare pieces printed (runs x units per set)", async () => {
    patchDraft({ quantity: 5, unitsPerSet: 4, extras: [row("Ring", "piece")] });
    const root = mount(ExtrasEditor);
    await flush();
    expect(lines(root)).toEqual(["In stock: 5 | Needs 8, 5 in stock"]);
  });
  test("per order warns on qty; per plate shows the stock only; untracked shows nothing", async () => {
    patchDraft({ quantity: 50, extras: [row("Box", "order"), row("Magnet", "plate", 9000), row("Screw", "piece"), row("Custom", "piece")] });
    const root = mount(ExtrasEditor);
    await flush();
    expect(lines(root)).toEqual(["In stock: 0 | Needs 1, 0 in stock", "In stock: 1"]);
    expect(store.settings.extrasCatalog[0]!.stockE3).toBe(5000); // nothing deducted
  });
});

describe("StockView", () => {
  afterEach(() => unmount());

  test("catalog with stock field, out-of-stock badge, remove + undo", async () => {
    seed({ settings: { extrasCatalog: [{ key: "c1", label: "Ring", unitMinor: 50, qtyE3: 1000, per: "piece", stockE3: 0 }, { key: "c2", label: "Box", unitMinor: 50, qtyE3: 1000, per: "piece" }] } });
    const root = mount(StockView);
    await flush();
    expect(root.querySelector("h1[data-view-title]")?.textContent).toBe("Extras and stock");
    const badges = [...root.querySelectorAll(".ec-item")].map((li) => li.querySelector(".badge")?.textContent ?? null);
    expect(badges).toEqual(["Out of stock", null]);
    const stock = [...root.querySelectorAll("label")].filter((l) => l.textContent?.trim() === "In stock").map((l) => root.querySelector<HTMLInputElement>(`#${CSS.escape(l.htmlFor)}`)!);
    expect(stock.map((i) => i.value)).toEqual(["0", ""]);
    stock[1]!.focus(); stock[1]!.value = "7"; stock[1]!.dispatchEvent(new Event("input", { bubbles: true })); stock[1]!.blur();
    await flush();
    expect(store.settings.extrasCatalog[1]!.stockE3).toBe(7000);
    stock[0]!.focus(); stock[0]!.value = ""; stock[0]!.dispatchEvent(new Event("input", { bubbles: true })); stock[0]!.blur();
    await flush();
    expect(store.settings.extrasCatalog[0]!.stockE3).toBeNull();
    (root.querySelector("button[aria-label='Remove Ring']") as HTMLElement).click();
    await flush();
    expect(store.settings.extrasCatalog.map((x) => x.label)).toEqual(["Box"]);
    lastToast()!.action!.run();
    expect(store.settings.extrasCatalog.map((x) => x.label)).toEqual(["Ring", "Box"]);
  });

  test("Spoolman filament table: non-archived spools and remaining grams, — when unknown", async () => {
    seed();
    store.spoolman = { state: "ok", error: null, data: { currency: "BRL",
      filaments: [
        { id: 1, name: "PLA Black", vendor: "Acme", material: "PLA", price: 100, weight: 1000 },
        { id: 2, name: "PETG Blue", vendor: null, material: "PETG", price: 100, weight: 1000 },
      ] as never,
      spools: [
        { id: 1, filamentId: 1, price: null, initialWeight: 1000, archived: false, lastUsed: null, remainingWeight: 400 },
        { id: 2, filamentId: 1, price: null, initialWeight: 1000, archived: false, lastUsed: null, remainingWeight: 250.5 },
        { id: 3, filamentId: 1, price: null, initialWeight: 1000, archived: true, lastUsed: null, remainingWeight: 900 },
        { id: 4, filamentId: 2, price: null, initialWeight: 1000, archived: false, lastUsed: null },
      ] } };
    const root = mount(StockView);
    await flush();
    const rows = [...root.querySelectorAll("[data-testid=filament-table] tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent?.trim()));
    expect(rows).toEqual([["PLA Black", "Acme · PLA", "2", "651 g"], ["PETG Blue", "PETG", "1", "—"]]);
    expect(root.textContent).not.toContain("192.168");
  });

  test("not connected: a muted sentence and a button to the Spoolman settings tab", async () => {
    seed();
    store.spoolman = { state: "unset", error: null, data: { currency: null, filaments: [], spools: [] } };
    settingsTab.value = "about";
    const root = mount(StockView);
    await flush();
    expect(root.querySelector("[data-testid=filament-table]")).toBeNull();
    expect(root.textContent).toContain("Connect Spoolman to see your filament stock here.");
    [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Set up Spoolman")!.click();
    expect(store.view).toBe("settings");
    expect(settingsTab.value).toBe("spoolman");
  });
});
