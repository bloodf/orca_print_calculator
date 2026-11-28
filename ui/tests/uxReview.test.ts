// The UX review's findings, each held by a check: the Costs rows add up to their total, a normal state is not a warning,
// a control is named by a label and not by a legend, and a banner says only what the page needs said.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { nextTick, type App } from "vue";
import HelpGuide from "../src/components/HelpGuide.vue";
import FilamentChip from "../src/components/plates/FilamentChip.vue";
import PlateCard from "../src/components/plates/PlateCard.vue";
import PlateList from "../src/components/plates/PlateList.vue";
import PlateNotices from "../src/components/plates/PlateNotices.vue";
import PricePanel from "../src/components/price/PricePanel.vue";
import ChannelEditor from "../src/components/settings/ChannelEditor.vue";
import ExtrasCatalog from "../src/components/settings/ExtrasCatalog.vue";
import QuotesView from "../src/views/QuotesView.vue";
import { setLocale, t } from "../src/i18n";
import { openHelp, closeHelp } from "../src/state/help";
import { derived, patchDraft, result, slotMatches, store } from "../src/state/store";
import SectionsArea from "../src/views/SectionsArea.vue";
import { clearToasts } from "@orca-plugins/ui-foundation/src/components/toast";
import { load, mount, txt } from "./priceKit";

let apps: { app: App; root: HTMLElement }[] = [];
const show = async (c: Parameters<typeof mount>[0], props?: Record<string, unknown>): Promise<HTMLElement> => {
  const m = mount(c, props); apps.push(m); await nextTick(); await nextTick(); return m.root;
};
beforeEach(() => { setLocale("en"); clearToasts(); });
afterEach(() => { apps.forEach((m) => { m.app.unmount(); m.root.remove(); }); apps = []; closeHelp(); });

/** "R$42.06" -> 4206 minor units. */
const minor = (el: Element | null): number => Number(txt(el).replace(/[^\d]/g, ""));
const COST_ROWS = ["filament", "machine", "labor", "extras", "shipping"];

describe("Costs panel: the rows add up to Cost per piece", () => {
  const rowsSum = (el: HTMLElement): number => COST_ROWS.reduce((s, id) => s + minor(el.querySelector(`[data-section=${id}] [data-amount]`)), 0);

  test("filament is the first row, and the five cost rows are the total to the cent", async () => {
    load("ok");
    const el = await show(SectionsArea);
    expect([...el.querySelectorAll("[data-section]")].map((s) => s.getAttribute("data-section"))).toEqual([...COST_ROWS, "sales"]);
    const total = minor(el.querySelector("[data-testid=cost-per-piece]"));
    expect(total).toBeGreaterThan(0);
    expect(rowsSum(el)).toBe(total);
    const r = result.value;
    if (!r.ok) throw new Error("expected a quote");
    expect(total).toBe(r.unitCostAtQuantity);
    // the biggest cost of the piece is a row now: it was in the total without one
    expect(minor(el.querySelector("[data-section=filament] [data-amount]"))).toBe(r.lines.find((l) => l.id === "filament")!.perPiece);
    expect(minor(el.querySelector("[data-section=filament] [data-amount]"))).toBeGreaterThan(total / 3);
  });

  test.each([[1, 1], [3, 1], [7, 1], [10, 1], [5, 2], [7, 3], [100, 1]])("%i pieces ordered, %i per run, with order-level costs: still to the cent", async (quantity, unitsPerSet) => {
    load("ok", { settings: (s) => ({ ...s, defaults: { ...s.defaults, setupMinutes: 13, shipping: { mode: "absorbed", minor: 1990 } } }) });
    patchDraft({ quantity, unitsPerSet, extras: [{ key: "box", label: "Box", unitMinor: 455, qtyE3: 1000, per: "order" }, { key: "magnet", label: "Magnet", unitMinor: 33, qtyE3: 2000, per: "piece" }] });
    const el = await show(SectionsArea);
    const r = result.value;
    if (!r.ok) throw new Error("expected a quote");
    expect(minor(el.querySelector("[data-section=shipping] [data-amount]"))).toBeGreaterThan(0);
    expect(minor(el.querySelector("[data-section=extras] [data-amount]"))).toBeGreaterThan(0);
    expect(rowsSum(el)).toBe(r.unitCostAtQuantity);
    expect(minor(el.querySelector("[data-testid=cost-per-piece]"))).toBe(r.unitCostAtQuantity);
  });

  test("what selling takes is under the total, in a block of its own that says it is not a cost", async () => {
    load("ok");
    const el = await show(SectionsArea);
    const total = el.querySelector("[data-row=costTotal]")!;
    const selling = el.querySelector("[data-selling]")!;
    const after = (a: Element, b: Element): boolean => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    for (const id of COST_ROWS) expect(after(el.querySelector(`[data-section=${id}]`)!, total), id).toBe(true);
    expect(after(total, selling)).toBe(true);
    expect(selling.querySelector("[data-section=sales]")).not.toBeNull();
    expect(txt(selling)).toContain("Selling");
    expect(txt(selling)).toContain("Taken from the price, not part of the cost per piece.");
    expect(txt(selling.querySelector(".sec-title"))).toBe("Channel fees and tax"); // one name for it: the breakdown says "Channel fees" and "Tax"
    expect(minor(selling.querySelector("[data-amount]"))).toBeGreaterThan(0);
    // and it stays out of the sum
    expect(rowsSum(el) + minor(selling.querySelector("[data-amount]"))).toBeGreaterThan(minor(el.querySelector("[data-testid=cost-per-piece]")));
  });

  test("the filament row opens nothing: it says how much and how many, and goes to the plates, where its values are", async () => {
    load("ok");
    const plates = await show(PlateList);
    const el = await show(SectionsArea);
    const btn = el.querySelector<HTMLButtonElement>("[data-section=filament] .sec-btn")!;
    expect(btn.hasAttribute("aria-expanded")).toBe(false);
    expect(btn.hasAttribute("aria-controls")).toBe(false);
    expect(txt(btn)).toMatch(/^Filament: 401 g · 2 filaments ?R\$[\d.,]+\. Edit under Plates$/);
    btn.click();
    await nextTick();
    expect(document.activeElement).toBe(plates.querySelector("#plates-title"));
    expect(el.querySelector("#filament-body")).toBeNull();
  });

  test("an unknown weight: the filament row is marked partial and gives no weight it does not know", async () => {
    load("unknown");
    const el = await show(SectionsArea);
    const row = el.querySelector("[data-section=filament]")!;
    expect(row.querySelector("[data-partial]")).not.toBeNull();
    expect(txt(row.querySelector(".sec-sum"))).toBe("2 filaments");
  });

  test("pt-BR", async () => {
    setLocale("pt-BR");
    load("ok");
    const el = await show(SectionsArea);
    expect(txt(el.querySelector("[data-section=filament] .sec-sum"))).toBe("401 g · 2 filamentos");
    expect(txt(el.querySelector("[data-selling]"))).toContain("Sai do preço; não entra no custo por peça.");
    expect(txt(el.querySelector("[data-section=sales] .sec-title"))).toBe("Taxas do canal e imposto");
  });
});

describe("a preset price is a normal state, not a warning", () => {
  const chips = async (): Promise<HTMLElement> => {
    const p = store.plates[0]!;
    return show(PlateCard, { plate: p, row: null, matches: slotMatches.value[p.index] ?? [], include: true, copies: 1, stale: false, frozen: false });
  };
  test("without Spoolman: the source is muted text after the weight, no amber chip", async () => {
    load("noSpoolman");
    const el = await chips();
    expect(derived.value.slotMatches[store.plates[0]!.index]!.every((m) => m.source === "preset")).toBe(true);
    expect(el.querySelector(".oui-chip.src")).toBeNull();
    expect(el.querySelectorAll("[data-tone=warn]")).toHaveLength(0);
    const src = el.querySelector("[data-source=preset]")!;
    expect(txt(src)).toBe("· Preset price");
    expect(src.classList.contains("oui-muted")).toBe(true);
  });
  test("Spoolman set up and not answering: the stand-in price keeps its amber chip, because that needs doing something about", async () => {
    load("ok");
    store.spoolman = { state: "offline", data: { currency: null, filaments: [], spools: [] }, error: "unreachable" };
    const el = await chips();
    const chip = el.querySelector(".oui-chip.src")!;
    expect(chip.getAttribute("data-tone")).toBe("warn");
    expect(txt(chip)).toBe("Preset price");
    expect(el.querySelector("[data-source=preset]")).toBeNull();
  });
  test("no price at all stays red", async () => {
    load("unmatched");
    const p = store.plates.find((x) => (slotMatches.value[x.index] ?? []).some((m) => m.source === "none"))!;
    const m = slotMatches.value[p.index]!.find((x) => x.source === "none")!;
    const el = await show(FilamentChip, { slot: m.slot, match: m });
    expect(el.querySelector(".oui-chip.src")?.getAttribute("data-tone")).toBe("danger");
  });
});

describe("page notices", () => {
  test("stale plates: one short sentence with the way out, and the fine print is in the guide", async () => {
    load("stale");
    const el = await show(PlateNotices);
    const banner = el.querySelector("[data-stale]")!;
    expect(txt(banner)).toContain("Plates may be out of date. Slice again in OrcaSlicer to refresh them.");
    expect(txt(banner)).not.toContain("Mirroring");
    expect(banner.querySelector("[data-stale-refresh]")?.textContent?.trim()).toBe("Refresh");
    openHelp("plates");
    await show(HelpGuide);
    await nextTick();
    expect(txt(document.querySelector("[data-help-stale]"))).toBe(t("plates.staleBlind"));
  });
  test("an open quote that is no longer in the list is still named by a sentence, never by the Title field's label", async () => {
    load("savedQuote");
    store.quotes = [];
    const el = await show(PlateNotices);
    const banner = el.querySelector("[data-quote-banner]")!;
    expect(txt(banner)).toContain("Saved quote. Plates and prices are as saved.");
    expect(txt(banner.querySelector(".oui-banner-title") ?? banner)).not.toMatch(/^Title\b/);
  });
});

describe("Sales channels: the two controls of a row are named by column headings", () => {
  test("with two channels: Compare, Default, Channel over the list; no legend sentence", async () => {
    load("ok");
    expect(store.settings.channels.length).toBeGreaterThan(1);
    const el = await show(ChannelEditor);
    expect([...el.querySelectorAll("[data-channel-head] > span")].map((x) => txt(x))).toEqual(["Compare", "Default", "Channel"]);
    expect(txt(el)).not.toMatch(/First box|Round button/);
    // each control still carries its own name for a screen reader, and its column's name as a tooltip
    const first = el.querySelector(".ce-row")!;
    expect([...first.querySelectorAll(".ce-pick")].map((x) => x.getAttribute("title"))).toEqual(["Compare", "Default"]);
    expect(first.querySelector("input[type=checkbox]")?.getAttribute("aria-label")).toMatch(/^Compare /);
    expect(first.querySelector("input[type=radio]")?.getAttribute("aria-label")).toMatch(/^Default channel: /);
  });
  test("with one channel there is nothing to compare or default: no headings", async () => {
    load("ok", { settings: (s) => ({ ...s, channels: [s.channels[0]!], defaultChannelId: s.channels[0]!.id, comparedChannelIds: [s.channels[0]!.id] }) });
    const el = await show(ChannelEditor);
    expect(el.querySelector("[data-channel-head]")).toBeNull();
    expect(el.querySelector(".ce-pick")).toBeNull();
  });
});

describe("Price panel order", () => {
  test("what names the quote sits last, after what the price depends on and where it goes", async () => {
    load("ok", { settings: (s) => ({ ...s, ui: { ...s.ui, open: { breakdown: true } } }) });
    const el = await show(PricePanel);
    const after = (a: Element, b: Element): boolean => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const title = el.querySelector("#qa-title")!;
    expect(after(el.querySelector("[data-price-hero]")!, el.querySelector("#price-margin")!)).toBe(true);
    expect(after(el.querySelector("#price-margin")!, el.querySelector("[data-section=breakdown]")!)).toBe(true);
    expect(after(el.querySelector("[data-section=breakdown]")!, title)).toBe(true);
  });
});

describe("small things", () => {
  test("an empty project has nothing to price: the panel offers no channel, pieces or markup to set", async () => {
    load("empty");
    const el = await show(PricePanel);
    expect(el.querySelector("[data-testid=hero-sentence]")).not.toBeNull();
    expect(el.querySelector("#price-margin")).toBeNull();
    expect(el.querySelector("#qa-title")).toBeNull();
  });
  test("an empty extras catalog is an empty state with its one action, like the other panels of the page", async () => {
    load("ok", { settings: (s) => ({ ...s, extrasCatalog: [] }) });
    const el = await show(ExtrasCatalog);
    const empty = el.querySelector("[data-catalog-empty]")!;
    expect(txt(empty)).toContain(t("catalog.empty"));
    const add = [...el.querySelectorAll("button")].filter((b) => txt(b) === t("catalog.add"));
    expect(add).toHaveLength(1);
    expect(empty.contains(add[0]!)).toBe(true);
    add[0]!.click();
    await nextTick();
    expect(store.settings.extrasCatalog).toHaveLength(1);
    expect(el.querySelector("[data-catalog-empty]")).toBeNull();
  });
  test("a quote opens from its title as well as from Open", async () => {
    load("ok");
    store.view = "quotes";
    const el = await show(QuotesView);
    const title = el.querySelector<HTMLButtonElement>("[data-quote-title]")!;
    expect(title.tagName).toBe("BUTTON");
    title.click();
    await nextTick();
    expect(store.draft.frozenPlates).toBeTruthy();
    expect(store.view).toBe("calc");
  });
});
