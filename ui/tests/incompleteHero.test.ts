// C03/B-26/C04/C06: the price says where it is partial, next to the numbers; the quantities say how they compose; an
// offline Spoolman says which prices stand in. Values never change with the layout.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { nextTick, type App } from "vue";
import PlateCard from "../src/components/plates/PlateCard.vue";
import PriceBar from "../src/components/price/PriceBar.vue";
import PricePanel from "../src/components/price/PricePanel.vue";
import OrderControls from "../src/components/price/OrderControls.vue";
import { setLocale } from "../src/i18n";
import { derived, patchDraft, store } from "../src/state/store";
import type { Settings } from "../src/state/types";
import { clearToasts } from "@orca-plugins/ui-foundation/src/components/toast";
import { load, mount, txt } from "./priceKit";

let app: App | null = null;
let root: HTMLElement | null = null;
const show = async (c: Parameters<typeof mount>[0], props?: Record<string, unknown>): Promise<HTMLElement> => {
  const m = mount(c, props); app = m.app; root = m.root; await nextTick(); return m.root;
};
beforeEach(() => { setLocale("en"); clearToasts(); });
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });

describe("incomplete price (C03, B-26)", () => {
  const noRates = (st: Settings): Settings => ({ ...st, defaults: { ...st.defaults, energyPerKwh: null, laborPerHourMinor: null } });
  test("a partial price is tinted as a warning and marks profit and margin as partial; with no list of gaps, one line says how many items are missing", async () => {
    load("ok", { settings: noRates });
    const el = await show(PricePanel);
    const price = el.querySelector("[data-testid=hero-price]")!;
    expect(price.classList.contains("partial")).toBe(true);
    const line = txt(el.querySelector("[data-testid=incomplete-line]"));
    expect(line).toMatch(/^Incomplete: 2 items missing/);
    expect(txt(el.querySelector(".tiles"))).toMatch(/Profit per piece.* · partial.*Margin.* · partial/);
    // the line sits right under the price block, before the order controls and before the actions
    expect(el.querySelector("[data-price-hero]")!.nextElementSibling?.getAttribute("data-testid")).toBe("incomplete-line");
    expect(el.querySelector(".hero-box")!.getAttribute("data-tone")).toBe("warn"); // the block is tinted as a warning, not as done
  });
  test("\"incomplete\" is said once: the amber hero with its label, and the list of what is missing right under it (no header chip, no line pointing at the list)", async () => {
    load("unknown");
    const el = await show(PricePanel);
    expect(el.querySelector(".hero-box")!.getAttribute("data-tone")).toBe("warn");
    expect(txt(el.querySelector(".hero-box"))).toContain("Suggested price (incomplete)");
    expect(el.querySelector("[data-price-hero]")!.nextElementSibling?.hasAttribute("data-gaps")).toBe(true);
    expect(el.querySelector("[data-testid=incomplete-line]")).toBeNull();
    expect(el.querySelector("[data-testid=see-missing]")).toBeNull();
    expect(el.querySelector(".oui-panel-head .oui-status")).toBeNull();
    expect(txt(el).match(/incomplete/gi)).toHaveLength(1);
  });
  test("a complete price sits in the neutral hero (no accent fill) with no incomplete marks", async () => {
    load("ok");
    const el = await show(PricePanel);
    const box = el.querySelector(".hero-box")!;
    expect(box.classList.contains("oui-hero")).toBe(true);
    expect(box.classList.contains("oui-on-band")).toBe(false); // ui-foundation 5: nothing is filled with the plugin's hue
    expect(box.hasAttribute("data-tone")).toBe(false);
    expect(el.querySelector(".oui-panel-icon")!.getAttribute("data-tone")).toBe("lime"); // money is lime; the header itself is neutral
    expect(el.querySelector("[data-testid=hero-price]")!.classList.contains("partial")).toBe(false);
    expect(el.querySelector("[data-testid=incomplete-line]")).toBeNull();
    expect(txt(el.querySelector(".tiles"))).not.toContain("partial");
  });
  test("pt-BR says it in Portuguese with the plural right", async () => {
    setLocale("pt-BR");
    load("ok", { settings: noRates });
    const el = await show(PricePanel);
    expect(txt(el.querySelector("[data-testid=incomplete-line]"))).toMatch(/^Incompleto: faltam 2 itensVer o que falta$/);
    expect(txt(el.querySelector(".tiles"))).toContain("· parcial");
  });
  test("unknown time and weight stay listed under the price, never a hidden 0", async () => {
    load("unknown");
    const el = await show(PricePanel);
    const gaps = el.querySelector<HTMLElement>("[data-gaps]")!;
    expect(gaps).not.toBeNull();
    expect(txt(gaps)).toContain("print time is unknown");
    expect(txt(gaps)).toContain("filament 2: weight is unknown");
  });
  test("with only an unpriced filament, the same list names the filament and offers to pick a spool", async () => {
    load("unmatched");
    const el = await show(PricePanel);
    const gaps = el.querySelector<HTMLElement>("[data-gaps]")!;
    expect(txt(gaps)).toMatch(/Plate \d+, filament \d+: no price per kg\./);
    expect(gaps.querySelector("[data-gap^=price]")).not.toBeNull();
    expect(gaps.querySelector("[data-gap-pick]")).not.toBeNull();
    expect(el.querySelector("[data-testid=see-missing]")).toBeNull();
  });
  test("with only an unset energy price, focus goes to the not-counted note", async () => {
    load("ok", { settings: (s) => ({ ...s, defaults: { ...s.defaults, energyPerKwh: null } }) });
    const el = await show(PricePanel);
    el.querySelector<HTMLButtonElement>("[data-testid=see-missing]")!.click();
    await nextTick(); await nextTick();
    expect((document.activeElement as HTMLElement).dataset.flag).toBe("notCounted");
  });
  test("the number itself does not change with the marks", async () => {
    load("unknown");
    const el = await show(PricePanel);
    const sel = derived.value.selected;
    expect(sel?.ok).toBe(true);
    expect(txt(el.querySelector("[data-testid=hero-price]"))).toMatch(/\d/);
  });
  test("the narrow bar is neutral and says incomplete too", async () => {
    load("unknown");
    const el = await show(PriceBar, { hidden: false });
    expect(el.querySelector(".price-figure")!.classList.contains("partial")).toBe(true);
    expect(txt(el)).toContain("incomplete");
  });
});

describe("price origin (C06)", () => {
  const offline = (): void => {
    load("ok");
    store.spoolman = { state: "offline", data: { currency: "BRL", filaments: [], spools: [] }, error: "network" };
  };
  test("offline Spoolman with profile prices in use says so next to the price", async () => {
    offline();
    const el = await show(PricePanel);
    expect(store.settings.spoolman.url).not.toBe("");
    expect(txt(el.querySelector("[data-testid=price-origin]"))).toContain("Spoolman is offline");
  });
  test("Spoolman never configured, or reachable, adds no origin note", async () => {
    load("noSpoolman");
    expect(txt(await show(PricePanel))).not.toContain("Spoolman is offline");
    app?.unmount(); root?.remove();
    load("ok");
    expect((await show(PricePanel)).querySelector("[data-testid=price-origin]")).toBeNull();
  });
  test("the narrow bar names the fallback", async () => {
    offline();
    expect(txt(await show(PriceBar, { hidden: false }))).toContain("profile prices");
  });
});

describe("quantities (C04)", () => {
  test("the summary follows the engine: pieces ordered = runs x pieces per run, spare pieces are the rounding up", async () => {
    load("ok");
    patchDraft({ quantity: 10, unitsPerSet: 3 });
    const el = await show(OrderControls);
    const r = derived.value.result;
    expect(r.ok && r.runs).toBe(4);
    expect(r.ok && r.sparePieces).toBe(2); // 4 x 3 = 12 printed for 10 ordered
    expect(txt(el.querySelector("[data-testid=qty-summary]"))).toContain("10 pieces ordered = 4 runs × 3 pieces per run");
    expect(txt(el)).toContain("2"); // the spare note stays
  });
  test("copies are counted per run, not folded into pieces", async () => {
    load("ok");
    patchDraft({ quantity: 6, unitsPerSet: 2, plates: { 0: { include: true, copies: 2 }, 1: { include: true, copies: 3 }, 2: { include: false, copies: 9 } } });
    const el = await show(OrderControls);
    const r = derived.value.result;
    expect(r.ok && r.runs).toBe(3);
    const text = txt(el.querySelector("[data-testid=qty-summary]"));
    expect(text).toContain("6 pieces ordered = 3 runs × 2 pieces per run");
    expect(text).toContain("Each run prints 5 plates (copies counted)"); // 2 + 3; the excluded plate adds nothing
  });
  test("one piece, one run, every plate once: nothing to explain", async () => {
    load("ok");
    expect(await show(OrderControls)).not.toBeNull();
    expect(root!.querySelector("[data-testid=qty-summary]")).toBeNull();
  });
  test("several runs without extra copies: the runs line only, no plate count", async () => {
    load("ok");
    patchDraft({ quantity: 4 });
    const text = txt((await show(OrderControls)).querySelector("[data-testid=qty-summary]"));
    expect(text).toContain("4 pieces ordered = 4 runs × 1 piece per run");
    expect(text).not.toContain("Each run prints");
  });
  test("pt-BR", async () => {
    setLocale("pt-BR");
    load("ok");
    patchDraft({ quantity: 1, unitsPerSet: 1, plates: { 0: { include: true, copies: 1 }, 1: { include: true, copies: 1 } } });
    patchDraft({ quantity: 10, unitsPerSet: 3 });
    expect(txt((await show(OrderControls)).querySelector("[data-testid=qty-summary]"))).toContain("10 peças pedidas = 4 rodadas × 3 peças por rodada");
  });
  test("the copies stepper of a plate has a visible label and the same words in its accessible name", async () => {
    load("ok");
    const el = await show(PlateCard, { plate: store.plates[0], row: null, matches: [], include: true, copies: 2, stale: false, frozen: false });
    expect(txt(el.querySelector(".cp-lbl"))).toBe("Copies per run");
    expect(el.querySelector("[aria-label='Copies per run, plate 1']")).not.toBeNull();
  });
});
