// The batch table keeps Order profit and Margin (the loss signal) visible at every panel width: 7 columns only where the panel is wide.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import BatchTable from "../src/components/price/BatchTable.vue";
import { setLocale } from "../src/i18n";
import { setSectionOpen, store } from "../src/state/store";
import { load } from "./priceKit";

let app: App | null = null;
let root: HTMLElement | null = null;
/** matchMedia for the one query shape the panel uses: a comma list of (min-width) / (max-width) conditions. */
function fakeMedia(width: number): void {
  window.matchMedia = ((q: string) => {
    const ok = q.split(",").some((part) => [...part.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].every((m) => (m[1] === "min" ? width >= Number(m[2]) : width <= Number(m[2]))));
    return { matches: ok, media: q, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}
async function headers(width: number, lang: "en" | "pt-BR" = "en"): Promise<string[]> {
  setLocale(lang);
  fakeMedia(width);
  load("ok", { settings: (st) => ({ ...st, language: lang }), draft: (d) => ({ ...d, quantity: 10, discountTiers: [{ minQty: 5, discountBp: 1000 }, { minQty: 10, discountBp: 2000 }, { minQty: 20, discountBp: 6000 }] }) });
  setSectionOpen("batch", true);
  root = document.createElement("div");
  document.body.appendChild(root);
  app = createApp({ render: () => h(BatchTable) });
  app.mount(root);
  await nextTick(); await nextTick();
  return [...root.querySelectorAll("thead th")].map((th) => (th.firstElementChild?.textContent ?? th.textContent)!.trim()); // the visible text (a short header also carries its full name for screen readers)
}
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; store.settings = { ...store.settings }; });
beforeEach(() => setLocale("en"));

describe("batch table columns by width", () => {
  test.each([340, 599, 900, 1100, 1439, 1440, 1920])("panel at viewport %ipx: five columns, short headers, no Unit cost or Order total", async (w) => {
    const h5 = await headers(w);
    expect(h5).toEqual(["Qty", "Discount", "Price", "Profit", "Margin"]);
  });
  test.each([600, 760, 899])("the wide narrow-layout panel (%ipx) keeps all seven", async (w) => {
    expect(await headers(w)).toHaveLength(7);
  });
  test("short headers keep their full name for assistive tech", async () => {
    await headers(1440);
    const th = [...root!.querySelectorAll("thead th")];
    expect(th[3]!.getAttribute("title") ?? th[3]!.querySelector("[title]")?.getAttribute("title")).toBe("Order profit");
    expect(th[3]!.textContent).toContain("Order profit"); // sr-only full text
  });
  test("pt-BR short headers", async () => {
    expect(await headers(1440, "pt-BR")).toEqual(["Qtd", "Desconto", "Preço", "Lucro", "Margem"]);
  });
  test("the secondary numbers stay reachable: unit cost and order total in the price cell's tooltip", async () => {
    await headers(1440);
    const cell = root!.querySelector("tbody tr td:nth-child(3)")!;
    expect(cell.getAttribute("title")).toMatch(/Unit cost.*Order total/s);
  });
});

describe("channel comparison follows the same widths", () => {
  test.each([[340, 4], [900, 4], [1440, 4], [1920, 4], [760, 7]])("viewport %ipx has %i columns", async (w, n) => {
    const { default: ChannelComparison } = await import("../src/components/price/ChannelComparison.vue");
    setLocale("en");
    fakeMedia(w);
    load("ok");
    setSectionOpen("compare", true);
    root = document.createElement("div");
    document.body.appendChild(root);
    app = createApp({ render: () => h(ChannelComparison) });
    app.mount(root);
    await nextTick(); await nextTick();
    expect(root.querySelectorAll("thead th")).toHaveLength(n);
  });
});
