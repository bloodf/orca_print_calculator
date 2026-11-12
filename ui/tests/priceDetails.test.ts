import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { nextTick, type App } from "vue";
import BatchTable from "../src/components/price/BatchTable.vue";
import BreakdownBars from "../src/components/price/BreakdownBars.vue";
import ChannelComparison from "../src/components/price/ChannelComparison.vue";
import DiscountTierEditor from "../src/components/price/DiscountTierEditor.vue";
import OrderControls from "../src/components/price/OrderControls.vue";
import { derived, result, store } from "../src/state/store";
import { clearToasts, toasts } from "../src/state/toast";
import type { DiscountTier } from "../src/state/types";
import { en, load, mount, txt } from "./priceKit";
import { optionLabels } from "./pv";

let app: App | null = null;
let root: HTMLElement | null = null;
const show = async (c: Parameters<typeof mount>[0], props?: Record<string, unknown>): Promise<HTMLElement> => {
  const m = mount(c, props); app = m.app; root = m.root; await nextTick(); return m.root;
};
beforeEach(() => { en(); clearToasts(); });
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });
const oneChannel = (s: typeof store.settings) => ({ ...s, channels: [s.channels[0]!], comparedChannelIds: ["direct"], defaultChannelId: "direct" });

describe("breakdown bars", () => {
  test.each([[2, 1, false], [10, 3, false], [10, 3, true]] as const)("detail remains per ordered piece (quantity %i, run %i, legacy %s)", async (quantity, unitsPerSet, legacy) => {
    load("ok", { draft: (d) => ({ ...d, quantity, unitsPerSet, extras: [
      { key: "ring", label: "Ring", unitMinor: 50, qtyE3: 1000, per: "piece" },
      { key: "magnet", label: "Magnet", unitMinor: 40, qtyE3: 2000, per: "piece" },
    ] }) });
    if (legacy) {
      const input: typeof derived.value.quoteInput = JSON.parse(JSON.stringify(derived.value.quoteInput));
      delete input.calc;
      store.draft.frozenInput = input;
      expect(derived.value.quoteInput.calc).toBeUndefined();
    }
    const el = await show(BreakdownBars);
    const amount = (n: Element | null) => Math.round(Number(txt(n).replace(/[^0-9.-]/g, "")) * 100);
    for (const id of ["filament", "extras"]) {
      const row = el.querySelector(`[data-row=${id}]`)!;
      row.querySelector<HTMLButtonElement>("button")!.click(); await nextTick();
      const details: number[] = [];
      for (let n = row.nextElementSibling; n?.classList.contains("det"); n = n.nextElementSibling) details.push(amount(n.querySelector(".amt")));
      expect(details.length).toBeGreaterThan(0);
      expect(Math.abs(details.reduce((a, b) => a + b, 0) - amount(row.querySelector(".amt")))).toBeLessThanOrEqual(details.length);
      if (id === "extras") expect(details).toEqual(quantity === 2 ? [50, 80] : [60, 96]);
    }
  });
  test("rows carry amount, share and a bar scaled to the largest row", async () => {
    load("ok", { settings: (s) => ({ ...s, ui: { ...s.ui, open: { breakdown: true } } }) });
    const el = await show(BreakdownBars);
    const scales = Object.fromEntries([...el.querySelectorAll<HTMLElement>("[data-row] .bar")].map((b) => [b.closest("[data-row]")!.getAttribute("data-row")!, Number(b.dataset.scale)]));
    const r = result.value;
    if (!r.ok) throw new Error("expected a quote");
    const per = Object.fromEntries(r.lines.filter((l) => l.perPiece > 0).map((l) => [l.id, l.perPiece]));
    const top = Math.max(...Object.values(per), derived.value.selected && derived.value.selected.ok ? derived.value.selected.profit : 0);
    expect(Math.max(...Object.values(scales))).toBe(1);
    for (const [id, minor] of Object.entries(per)) expect(scales[id]).toBeCloseTo(minor / top, 3);
    expect(el.querySelector("[data-row=filament] .bar")?.getAttribute("style")).toContain("scaleX(");
    expect(txt(el.querySelector("[data-row=filament] .shr"))).toMatch(/%$/);
  });
  test("zero rows are omitted; the total row is the unit cost at the quantity", async () => {
    load("ok", { settings: (s) => ({ ...s, ui: { ...s.ui, open: { breakdown: true } } }) });
    const el = await show(BreakdownBars);
    const ids = [...el.querySelectorAll("[data-row]")].map((x) => x.getAttribute("data-row"));
    expect(ids).not.toContain("maintenance");
    expect(ids).not.toContain("setup");
    expect(ids).toContain("costTotal");
    expect(ids.indexOf("costTotal")).toBeLessThan(ids.indexOf("fees"));
    expect(txt(el.querySelector("[data-row=costTotal]"))).toContain("Cost per piece");
    expect(el.querySelector("[data-row=profit] .bar")?.classList.contains("profit")).toBe(true);
  });
  test("filament expands to per-material detail", async () => {
    load("ok", { settings: (s) => ({ ...s, ui: { ...s.ui, open: { breakdown: true } } }) });
    const el = await show(BreakdownBars);
    const btn = el.querySelector<HTMLButtonElement>("[data-row=filament] button")!;
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    btn.click(); await nextTick();
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(txt(el)).toContain("Generic PLA @U1");
  });
});

describe("channel comparison", () => {
  test("hidden with one channel", async () => {
    load("ok", { settings: oneChannel });
    const el = await show(ChannelComparison);
    expect(el.querySelector("[data-section=compare]")).toBeNull();
    expect(el.querySelector("table")).toBeNull();
  });
  test("with two channels it is collapsed by default, opens, marks the selection and keeps prices out of amber", async () => {
    load("ok");
    const el = await show(ChannelComparison);
    expect(el.querySelector("[data-section=compare]")).not.toBeNull();
    expect(el.querySelector("table")).toBeNull();
    el.querySelector<HTMLButtonElement>(".sec-btn")!.click(); await nextTick();
    expect(store.settings.ui.open.compare).toBe(true);
    const rows = [...el.querySelectorAll<HTMLElement>("tbody tr")];
    expect(rows).toHaveLength(2);
    expect(el.querySelectorAll("tr.sel")).toHaveLength(1);
    expect((el.querySelector("tr.sel") as HTMLElement).dataset.channel).toBe(derived.value.selectedChannelId);
    expect(txt(el.querySelector("tr.sel .sr-only"))).toBe("selected");
    expect(el.querySelector("tr[aria-selected]")).toBeNull();
    expect(el.querySelector(".price-amber")).toBeNull();
    expect(el.querySelector("caption")?.textContent).toBe("Price and profit per piece on each channel");
    rows.find((r) => r.dataset.channel === "direct")!.click(); await nextTick();
    expect(store.draft.channelId).toBe("direct");
    expect((el.querySelector("tr.sel") as HTMLElement).dataset.channel).toBe("direct");
  });
});

describe("order controls", () => {
  test("channel select only with 2+ channels; problem channels are suffixed", async () => {
    load("impossible");
    let el = await show(OrderControls);
    expect(el.querySelector("[role=combobox]")).not.toBeNull();
    expect(await optionLabels(el)).toEqual(["Direct", "Online store — no price"]);
    app?.unmount(); root?.remove();
    load("ok", { settings: oneChannel });
    el = await show(OrderControls);
    expect(el.querySelector("[role=combobox]")).toBeNull();
    expect(el.querySelector("#price-margin")).not.toBeNull();
  });
});

describe("batch table", () => {
  const withTier = (bp: number, pretty: "ending9" | "none" = "ending9") => load("ok", {
    settings: (s) => ({ ...s, ui: { ...s.ui, open: { batch: true } } }),
    draft: (d) => ({ ...d, quantity: 10, discountTiers: [{ minQty: 10, discountBp: bp }], overrides: { pretty } }),
  });
  test("discount cell shows the effective discount and the nominal tier when rounding moves it", async () => {
    withTier(1000);
    const el = await show(BatchTable);
    const sel = derived.value.selected;
    if (!sel || !sel.ok) throw new Error("expected a price");
    expect(sel.effectiveDiscountBp).not.toBe(sel.discountBp);
    const cell = el.querySelector("tr[data-q='10'] [data-cell=discount]")!;
    expect(txt(cell.querySelector(".eff"))).toBe("10.2%");
    expect(txt(cell.querySelector(".nominal"))).toBe("tier 10%");
  });
  test("no nominal line when they match", async () => {
    withTier(1000, "none");
    const el = await show(BatchTable);
    expect(txt(el.querySelector("tr[data-q='10'] [data-cell=discount]"))).toBe("10%");
  });
  test("rows: current quantity is marked, tiers come first, no tier row for a plain quantity", async () => {
    withTier(1000);
    const el = await show(BatchTable);
    const qs = [...el.querySelectorAll<HTMLElement>("tbody tr")].map((r) => r.dataset.q);
    expect(qs).toEqual(["10"]);
    expect(el.querySelector("tr.cur")?.textContent).toContain("current");
    store.draft = { ...store.draft, quantity: 3 }; await nextTick();
    expect([...el.querySelectorAll<HTMLElement>("tbody tr")].map((r) => r.dataset.q)).toEqual(["3", "10"]);
    el.querySelector<HTMLButtonElement>("tr[data-q='10'] .qbtn")!.click(); await nextTick();
    expect(store.draft.quantity).toBe(10);
  });
  test("loss rows use the bad tone with an sr 'loss'; target misses get the info icon", async () => {
    load("ok", {
      settings: (s) => ({ ...s, ui: { ...s.ui, open: { batch: true } } }),
      draft: (d) => ({ ...d, quantity: 20, discountTiers: [{ minQty: 10, discountBp: 1000 }, { minQty: 20, discountBp: 6000 }] }),
    });
    const el = await show(BatchTable);
    const ten = el.querySelector("tr[data-q='10']")!;
    expect(ten.querySelector("[data-cell=margin] [data-icon=belowTarget]")).not.toBeNull();
    expect(ten.querySelector("[data-cell=margin]")?.classList.contains("bad")).toBe(false);
    const twenty = el.querySelector("tr[data-q='20']")!;
    expect(twenty.querySelector("[data-cell=orderProfit]")?.classList.contains("bad")).toBe(true);
    expect(twenty.querySelector("[data-cell=margin]")?.classList.contains("bad")).toBe(true);
    expect(txt(twenty.querySelector("[data-cell=orderProfit]"))).toMatch(/^−.* loss$/);
  });
});

describe("discount tier editor", () => {
  const tiers: DiscountTier[] = [{ minQty: 10, discountBp: 500 }, { minQty: 50, discountBp: 1000 }];
  const host = async (initial: DiscountTier[], dflt?: DiscountTier[]) => {
    const seen: DiscountTier[][] = [];
    const el = await show(DiscountTierEditor, { modelValue: initial, defaultValue: dflt, "onUpdate:modelValue": (v: DiscountTier[]) => seen.push(v) });
    return { el, seen };
  };
  test("add appends a sensible tier; max 6 hides the add button", async () => {
    const { el, seen } = await host(tiers);
    el.querySelector<HTMLButtonElement>(".add")!.click();
    expect(seen[0]).toEqual([...tiers, { minQty: 100, discountBp: 1500 }]);
    app?.unmount(); root?.remove();
    const six = Array.from({ length: 6 }, (_, i) => ({ minQty: 10 + i, discountBp: 100 }));
    expect((await host(six)).el.querySelector(".add")).toBeNull();
  });
  test("remove emits the shorter list and a toast whose Undo restores it", async () => {
    const { el, seen } = await host(tiers);
    el.querySelectorAll<HTMLButtonElement>(".rm")[0]!.click();
    expect(seen[0]).toEqual([tiers[1]]);
    const t = toasts.list[toasts.list.length - 1]!;
    expect(t.text).toBe("Discount tier removed");
    t.action!.run();
    expect(seen[1]).toEqual(tiers);
  });
  test("duplicate quantities show an inline error", async () => {
    const { el } = await host([{ minQty: 10, discountBp: 500 }, { minQty: 10, discountBp: 900 }]);
    expect(el.querySelectorAll("[role=alert]")).toHaveLength(2);
    expect(txt(el.querySelector("[role=alert]"))).toBe("Two tiers use the same quantity.");
  });
  test("rows are sorted by quantity when focus leaves a row", async () => {
    const { el, seen } = await host([{ minQty: 50, discountBp: 1000 }, { minQty: 10, discountBp: 500 }]);
    el.querySelector("[data-tier]")!.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    expect(seen[0]).toEqual([{ minQty: 10, discountBp: 500 }, { minQty: 50, discountBp: 1000 }]);
  });
  test("override dot and reset only when the model differs from the defaults", async () => {
    const { el } = await host(tiers, tiers);
    expect(el.querySelector(".edited")).toBeNull();
    app?.unmount(); root?.remove();
    const again = await host(tiers, [{ minQty: 10, discountBp: 500 }]);
    expect(again.el.querySelector(".edited")).not.toBeNull();
  });
});
