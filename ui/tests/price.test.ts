import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { nextTick, type App } from "vue";
import PriceBar from "../src/components/price/PriceBar.vue";
import PriceFlags from "../src/components/price/PriceFlags.vue";
import PricePanel from "../src/components/price/PricePanel.vue";
import { buildFlags } from "../src/components/price/flagList";
import { channelProblemSentence, problemSentence } from "../src/components/price/priceState";
import { setLocale } from "../src/i18n";
import { SCENARIO_NAMES } from "../src/mock/scenarios";
import type { Derived } from "../src/state/derive";
import { derived } from "../src/state/store";
import { clearToasts } from "../src/state/toast";
import { en, load, mount, txt } from "./priceKit";

let app: App | null = null;
let root: HTMLElement | null = null;
const show = async (c: Parameters<typeof mount>[0], props?: Record<string, unknown>): Promise<HTMLElement> => {
  const m = mount(c, props); app = m.app; root = m.root; await nextTick(); return m.root;
};
beforeEach(() => { en(); clearToasts(); });
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });

const AMBER = ".price-amber";

describe("amber price", () => {
  test.each(SCENARIO_NAMES.filter((n) => n !== "loading" && n !== "hostError"))("state %s: at most one amber element, exactly one when there is a price", async (name) => {
    load(name);
    const el = await show(PricePanel);
    const hasPrice = derived.value.selected?.ok === true && derived.value.result.ok && derived.value.quoteInput.plates.length > 0;
    expect(el.querySelectorAll(AMBER).length).toBe(hasPrice ? 1 : 0);
    expect(el.querySelector("#price-title")).not.toBeNull();
  });
  test("ok state: the amber element holds the selected channel price and nothing else is amber", async () => {
    load("ok");
    const el = await show(PricePanel);
    const sel = derived.value.selected;
    expect(sel?.ok).toBe(true);
    expect(el.querySelectorAll(AMBER)).toHaveLength(1);
    expect(txt(el.querySelector(AMBER))).toMatch(/\d/);
    expect(el.querySelector("table")?.querySelector(AMBER) ?? null).toBeNull();
  });
  test("PriceBar: hidden holds no amber number; shown holds exactly one (and the panel never shows two at once)", async () => {
    load("ok");
    const hidden = await show(PriceBar, { hidden: true });
    expect(hidden.querySelectorAll(AMBER)).toHaveLength(0);
    expect(hidden.querySelector(".price-bar")?.getAttribute("aria-hidden")).toBe("true");
    app?.unmount(); root?.remove();
    const shown = await show(PriceBar, { hidden: false });
    expect(shown.querySelectorAll(AMBER)).toHaveLength(1);
    expect(txt(shown)).toContain("Details");
  });
});

describe("hero states", () => {
  test("impossible margin: title, body and two actions, no number, no tiles", async () => {
    load("impossible");
    const el = await show(PricePanel);
    expect(el.querySelector(AMBER)).toBeNull();
    const h = el.querySelector("[data-testid=hero-impossible]")!;
    expect(txt(h)).toContain("No price works on Online store");
    expect(txt(h)).toContain("Fees, tax and your target margin add up to 100% or more. Lower the target margin or the channel fees.");
    expect([...h.querySelectorAll("button")].map(txt)).toEqual(["Lower target margin", "Edit channel fees"]);
    expect(el.querySelector(".tiles")).toBeNull();
    expect(el.querySelector("[data-row]")).toBeNull();
  });
  test("impossible margin keeps Compare channels open", async () => {
    load("impossible");
    const el = await show(PricePanel);
    expect(el.querySelector("table.cmp")).not.toBeNull();
  });
  test("no plates", async () => {
    load("empty");
    const el = await show(PricePanel);
    expect(txt(el.querySelector("[data-testid=hero-sentence]"))).toBe("No plates yet. The price appears after slicing.");
  });
  test("every plate excluded -> include one", async () => {
    load("ok", { draft: (d) => ({ ...d, plates: { 0: { include: false, copies: 1 }, 1: { include: false, copies: 1 }, 2: { include: false, copies: 1 } } }) });
    const el = await show(PricePanel);
    expect(txt(el.querySelector("[data-testid=hero-sentence]"))).toBe("Include at least one plate.");
  });
  test("overflow quantity -> order too large", async () => {
    load("ok", { draft: (d) => ({ ...d, quantity: 10 ** 15 }) });
    const el = await show(PricePanel);
    expect(txt(el.querySelector("[data-testid=hero-sentence]"))).toBe("The order is too large to calculate. Lower the quantity.");
  });
  test("invalid selected channel -> channel invalid sentence with a fees action", async () => {
    load("ok", { settings: (s) => ({ ...s, channels: s.channels.map((c) => (c.id === "store" ? { ...c, taxBp: 99999 } : c)) }) });
    const el = await show(PricePanel);
    const h = el.querySelector("[data-testid=hero-sentence]")!;
    expect(txt(h)).toContain("This channel's fees are invalid. Fix them in settings.");
    expect(txt(h)).toContain("Edit channel fees");
  });
  test("problem codes map to their messages", () => {
    expect(problemSentence(["no_plates", "negative"])).toBe("Include at least one plate.");
    expect(problemSentence(["overflow"])).toBe("The order is too large to calculate. Lower the quantity.");
    expect(problemSentence(["engine_range"])).toBe("A number is too large to calculate. Check quantities and prices.");
    expect(problemSentence(["material_price_conflict"])).toBe("Same filament with two prices. Pick one spool.");
    for (const c of ["not_integer", "negative", "quantity_min", "copies_min", "discount_range", "invalid_option"]) expect(problemSentence([c])).toBe("Fix the highlighted field to see a price.");
    const bad = (problem: "margin_impossible" | "search_bound_exceeded" | "channel_invalid" | "overflow") => channelProblemSentence({ id: "x", name: "Shop", ok: false, problem });
    expect(bad("margin_impossible")).toBe("No price works on Shop");
    expect(bad("search_bound_exceeded")).toBe("This channel's fee steps are too complex to price. Simplify its fee steps.");
    expect(bad("channel_invalid")).toBe("This channel's fees are invalid. Fix them in settings.");
    expect(bad("overflow")).toBe("The order is too large to calculate. Lower the quantity.");
  });
  test("incomplete label while something is not counted", async () => {
    load("unknown");
    const el = await show(PricePanel);
    expect(txt(el.querySelector("#price-title"))).toBe("Suggested price (incomplete) · per piece");
    load("ok");
    await nextTick();
    expect(txt(el.querySelector("#price-title"))).toBe("Suggested price · per piece");
  });
});

describe("tiles and sub-line", () => {
  test("q=1: rounded mode sub-line, profit per print hour, break-even", async () => {
    load("ok");
    const el = await show(PricePanel);
    expect(txt(el)).toMatch(/Rounded up from R\$\d+\.\d\d/);
    expect(txt(el)).not.toMatch(/Round \(3 digits\)|Rounded:/);
    expect(txt(el)).toMatch(/\/print hour/);
    expect(txt(el)).toContain("Break-even");
  });
  test("q>1: order total sub-line and profit on the order", async () => {
    load("ok", { draft: (d) => ({ ...d, quantity: 5 }) });
    const el = await show(PricePanel);
    expect(txt(el)).toMatch(/order total for 5 pieces/);
    expect(txt(el)).toMatch(/on the order/);
  });
  test("a loss shows the profit in the bad tone with a typographic minus", async () => {
    load("ok", { draft: (d) => ({ ...d, quantity: 2, discountTiers: [{ minQty: 2, discountBp: 9000 }] }) });
    const el = await show(PricePanel);
    const p = el.querySelector("[data-testid=profit]")!;
    expect(p.classList.contains("bad")).toBe(true);
    expect(txt(p).startsWith("−")).toBe(true);
  });
});

describe("spare pieces", () => {
  const spare = async (units: number, q: number) => {
    load("ok", { draft: (d) => ({ ...d, unitsPerSet: units, quantity: q }) });
    const el = await show(PricePanel);
    return el.querySelector(".oc-spare");
  };
  test("none when the run divides the quantity", async () => { expect(await spare(2, 4)).toBeNull(); });
  test("en singular and plural", async () => {
    expect(txt(await spare(2, 3))).toBe("1 spare piece");
    app?.unmount(); root?.remove();
    expect(txt(await spare(3, 4))).toBe("2 spare pieces");
  });
  test("pt-BR singular and plural, with the why in the title", async () => {
    setLocale("pt-BR");
    const one = await spare(2, 3);
    expect(txt(one)).toBe("1 peça a mais");
    expect(one?.getAttribute("title")).toContain("Uma rodada rende 2 peças");
    app?.unmount(); root?.remove();
    expect(txt(await spare(3, 4))).toBe("2 peças a mais");
  });
});

describe("flags", () => {
  const flagsOf = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>("[data-flag]")].map((f) => ({ id: f.dataset.flag!, tone: f.dataset.tone!, text: txt(f.querySelector(".flag-text")) }));

  test("below break-even is bad, comes before info flags, and carries the sr prefix and amount", async () => {
    load("ok", { draft: (d) => ({ ...d, quantity: 2, discountTiers: [{ minQty: 2, discountBp: 9000 }] }) });
    const el = await show(PriceFlags);
    const f = flagsOf(el);
    expect(f[0]).toMatchObject({ id: "belowBreakEven", tone: "bad" });
    expect(f[0]!.text).toBe("Warning: Below break-even on Online store: each piece loses R$48.96.");
    expect(f.map((x) => x.id)).toEqual(["belowBreakEven", "discount"]);
    expect(f[1]).toMatchObject({ tone: "info" });
    expect(f[1]!.text).toBe("Note: 90% volume discount from 2 pieces.");
  });
  test("a discount that only misses the target is info (belowTarget)", async () => {
    load("ok", { draft: (d) => ({ ...d, quantity: 10, discountTiers: [{ minQty: 10, discountBp: 1000 }] }) });
    const el = await show(PriceFlags);
    const f = flagsOf(el);
    expect(f.map((x) => x.id)).toEqual(["belowTarget", "discount"]);
    expect(f[0]!.text).toMatch(/^Note: Margin \d+\.\d% is under your 30% target after discount or minimum\.$/);
    expect(f.every((x) => x.tone === "info")).toBe(true);
  });
  test("minimum order", async () => {
    load("ok", { draft: (d) => ({ ...d, overrides: { minOrderMinor: 50000 } }) });
    const el = await show(PriceFlags);
    expect(flagsOf(el).find((x) => x.id === "minimum")?.text).toMatch(/^Note: Price per piece raised so the order reaches the R\$500\.00 minimum\.$/);
  });
  test("slot without price is bad with a Pick spool action", async () => {
    load("unmatched");
    const el = await show(PriceFlags);
    const f = flagsOf(el);
    expect(f[0]).toMatchObject({ id: "slotNoPrice-2-1", tone: "bad" });
    expect(f[0]!.text).toContain("Slot 1 (House brand PLA) has no price, counted as 0.");
    expect([...el.querySelectorAll("button")].map(txt)).toContain("Pick spool");
  });
  test("not-counted items join into one info flag", async () => {
    load("firstRun");
    const el = await show(PriceFlags);
    const f = flagsOf(el).find((x) => x.id === "notCounted")!;
    expect(f.tone).toBe("info");
    expect(f.text).toBe("Note: Not counted yet: energy, labor, printer wear.");
  });
  test("unknown print time and grams are named", async () => {
    load("unknown");
    const el = await show(PriceFlags);
    expect(txt(el)).toContain("print time of plate 1");
    expect(txt(el)).toContain("filament weight of slot 2 on plate 1");
  });
  test("stale plates and a skipped channel", async () => {
    load("stale", { settings: (s) => ({ ...s, channels: s.channels.map((c) => (c.id === "store" ? { ...c, taxBp: 99999 } : c)), defaultChannelId: "direct" }) });
    const el = await show(PriceFlags);
    const ids = flagsOf(el).map((x) => x.id);
    expect(ids).toContain("stale");
    expect(ids).toContain("channelSkipped-store");
    expect(txt(el)).toContain("Online store was skipped: its fees are invalid.");
  });
  test("preset prices", async () => {
    load("noSpoolman");
    const el = await show(PriceFlags);
    expect(flagsOf(el).map((x) => x.id)).toContain("presetPrices");
  });
  test("no flags renders nothing", async () => {
    load("ok");
    const el = await show(PriceFlags);
    expect(flagsOf(el).filter((x) => x.tone === "bad")).toEqual([]);
  });

  describe("pure builder: tones, order and params for each engine flag", () => {
    const fmt = { m: (n: number) => `$${n}`, pct: (bp: number) => `${bp / 100}%` };
    const sel = (flags: Partial<Record<string, boolean>>, over: Record<string, unknown> = {}) => ({
      id: "c", name: "Shop", ok: true, price: 5000, profit: 100, orderProfit: -700, marginBp: 1500, effectiveDiscountBp: 1250, discountBp: 1200,
      deadZones: [{ fromCents: 4000, untilCents: 4999 }, { fromCents: 7000, untilCents: 7999 }],
      flags: { discounted: false, belowTarget: false, belowBreakEven: false, orderBelowBreakEven: false, deadZoneJumped: false, minimumApplied: false, ...flags }, ...over,
    });
    const build = (s: ReturnType<typeof sel>) => buildFlags({
      selected: s, notCounted: [], skippedChannels: [], slotMatches: {}, fieldErrors: {},
      quoteInput: { plates: [], quantity: 12, targetMarginBp: 3000, minOrderMinor: 9900, discountTiers: [{ minQty: 5, discountBp: 500 }, { minQty: 10, discountBp: 1200 }] },
    } as unknown as Derived, fmt, { stale: false });

    test("order below break-even replaces nothing when per-piece is fine; belowTarget is suppressed by either loss flag", () => {
      const f = build(sel({ orderBelowBreakEven: true, belowTarget: true }));
      expect(f.map((x) => [x.id, x.tone])).toEqual([["orderBelowBreakEven", "bad"]]);
      expect(f[0]!.text).toBe("The order loses $700 once setup and order costs are counted.");
    });
    test("both loss flags -> only the per-piece one, with -profit", () => {
      const f = build(sel({ belowBreakEven: true, orderBelowBreakEven: true }, { profit: -250 }));
      expect(f.map((x) => x.id)).toEqual(["belowBreakEven"]);
      expect(f[0]!.text).toBe("Below break-even on Shop: each piece loses $250.");
    });
    test("full house, in spec order, with the right params", () => {
      const f = build(sel({ belowTarget: true, minimumApplied: true, deadZoneJumped: true, discounted: true }, { price: 8000 }));
      expect(f.map((x) => x.id)).toEqual(["belowTarget", "minimum", "deadZone", "discount"]);
      expect(f.map((x) => x.text)).toEqual([
        "Margin 15% is under your 30% target after discount or minimum.",
        "Price per piece raised so the order reaches the $9900 minimum.",
        "Raised to $8000: between $4000 and $4999 Shop's next fee step leaves you less.", // first zone ending below the price
        "12.5% volume discount from 10 pieces.", // effective discount, the tier that applies at q = 12
      ]);
    });
  });
});
