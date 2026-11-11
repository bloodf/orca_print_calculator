import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import ExtrasSection from "../src/components/costs/ExtrasSection.vue";
import LaborSection from "../src/components/costs/LaborSection.vue";
import MachineSection from "../src/components/costs/MachineSection.vue";
import SalesSection from "../src/components/costs/SalesSection.vue";
import ShippingSection from "../src/components/costs/ShippingSection.vue";
import { t } from "../src/i18n";
import { store } from "../src/state/store";
import { toasts } from "../src/state/toast";
import { click, field, mount, openAll, seed, type, unmount } from "./costsHarness";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { unmount(); vi.clearAllTimers(); vi.useRealTimers(); });
const summary = (root: HTMLElement) => root.querySelector(".sec-sum")?.textContent ?? "";
const idle = async () => { await vi.advanceTimersByTimeAsync(900); await nextTick(); };

describe("section headers show per-piece cost", () => {
  test("machine, labor, extras, shipping and sales summaries (collapsed)", () => {
    seed();
    const machine = mount(MachineSection);
    expect(machine.querySelector("#machine-body")).toBeNull();
    expect(summary(machine)).toMatch(/R\$\s?\d/);
    expect(summary(machine)).toContain(t("summary.machine.energy", { energy: "" }).trim().split(" ")[0]!);
    expect(summary(mount(LaborSection))).toMatch(/^10 min · R\$\s?\d/);
    expect(summary(mount(ExtrasSection))).toBe(t("summary.none"));
    expect(summary(mount(ShippingSection))).toBe(t("shipping.none"));
    expect(summary(mount(SalesSection))).toMatch(/^Fee 5% \+ R\$\s?1\.00 · tax 6%$/);
  });
  test("pt-BR summaries use the locale", () => {
    seed({ lang: "pt-BR" });
    expect(summary(mount(LaborSection))).toMatch(/^10 min · R\$\s?\d+,\d\d$/);
    expect(summary(mount(SalesSection))).toMatch(/^Taxa 5 ?% \+ R\$\s?1,00 · imposto 6 ?%$/);
  });
  test("a channel with no fees reads No fees", () => {
    seed({ settings: { defaultChannelId: "direct" } });
    expect(summary(mount(SalesSection))).toBe(t("summary.noFees"));
  });
  test("sales starts open on first run, others stay collapsed", () => {
    seed({ settings: { onboarded: false } });
    expect(mount(SalesSection).querySelector("#sales-body")).not.toBeNull();
    expect(mount(LaborSection).querySelector("#labor-body")).toBeNull();
  });
  test("a section header toggle saves open state in settings.ui.open", async () => {
    seed();
    const r = mount(LaborSection);
    await click(r.querySelector(".sec-btn"));
    expect(store.settings.ui.open.labor).toBe(true);
    expect(r.querySelector("#labor-body")).not.toBeNull();
  });
});

describe("field parse and errors per locale", () => {
  test("en: dot decimals commit an override; 3 decimals show the decimals error after idle", async () => {
    seed({ settings: openAll() });
    const r = mount(LaborSection);
    const rate = field(r, t("field.laborRate"));
    await type(rate, "42.5");
    expect(store.draft.overrides.laborPerHourMinor).toBe(4250);
    await type(rate, "42.555");
    expect(store.draft.overrides.laborPerHourMinor).toBe(4250);
    await idle();
    expect(r.querySelector("[role=alert]")?.textContent).toBe(t("field.error.decimals", { n: 2 }));
  });
  test("pt-BR: comma decimals commit; dot-thousands parse; garbage gives the number error with a pt example", async () => {
    seed({ lang: "pt-BR", settings: openAll() });
    const r = mount(LaborSection);
    const rate = field(r, t("field.laborRate"));
    await type(rate, "1.234,5");
    expect(store.draft.overrides.laborPerHourMinor).toBe(123450);
    await type(rate, "abc");
    await idle();
    expect(r.querySelector("[role=alert]")?.textContent).toContain("1.234,50");
  });
  test("energy price takes digits + 2 decimals and stores canonical text", async () => {
    seed({ settings: openAll() });
    const r = mount(MachineSection);
    const e = field(r, t("field.energy"));
    await type(e, "0.9512");
    expect(store.draft.overrides.energyPerKwh).toBe("0.9512");
    await type(e, "0.95123");
    await idle();
    expect(r.querySelector("[role=alert]")?.textContent).toBe(t("field.error.decimals", { n: 4 }));
  });
  test("percent and minutes are rounded, never a decimals error", async () => {
    seed({ settings: openAll() });
    const r = mount(MachineSection);
    await type(field(r, t("field.failure")), "7.5");
    expect(store.draft.overrides.failureBp).toBe(750);
    expect(r.querySelector("[role=alert]")).toBeNull();
  });
});

describe("overrides, reset and save as defaults", () => {
  test("editing marks the field and the section; editing back removes the override", async () => {
    seed({ settings: openAll() });
    const r = mount(LaborSection);
    const mins = field(r, t("field.laborMinutes"));
    await type(mins, "25");
    expect(store.draft.overrides.laborMinutes).toBe(25);
    expect(r.querySelector(".sec-btn .ovr-dot")).not.toBeNull();
    expect(r.querySelector(".ovr-dot")).not.toBeNull();
    await type(mins, "10");
    expect(store.draft.overrides.laborMinutes).toBeUndefined();
    expect(r.querySelector(".sec-btn .ovr-dot")).toBeNull();
  });
  test("reset clears the override with an Undo toast that restores it", async () => {
    seed({ settings: openAll() });
    const r = mount(LaborSection);
    await type(field(r, t("field.laborMinutes")), "25");
    await click(r.querySelector(".nf-head button"));
    expect(store.draft.overrides.laborMinutes).toBeUndefined();
    const toast = toasts.list[toasts.list.length - 1]!;
    expect(toast.text).toBe(t("common.resetDone"));
    toast.action!.run();
    expect(store.draft.overrides.laborMinutes).toBe(25);
  });
  test("Save as defaults moves overrides into settings.defaults; Undo puts both back", async () => {
    seed({ settings: openAll() });
    const r = mount(LaborSection);
    await type(field(r, t("field.laborMinutes")), "25");
    await click([...r.querySelectorAll("button")].find((b) => b.textContent === t("section.saveDefaults"))!);
    expect(store.settings.defaults.laborMinutes).toBe(25);
    expect(store.draft.overrides.laborMinutes).toBeUndefined();
    toasts.list[toasts.list.length - 1]!.action!.run();
    expect(store.settings.defaults.laborMinutes).toBe(10);
    expect(store.draft.overrides.laborMinutes).toBe(25);
  });
  test("printer-scoped fields save to the printer profile, never an override", async () => {
    seed({ settings: openAll() });
    const r = mount(MachineSection);
    await type(field(r, t("field.watts")), "150");
    expect(store.settings.printers["Snapmaker U1"]?.watts).toBe(150);
    expect(store.draft.overrides).toEqual({});
    expect(r.querySelector(".ovr-dot")).toBeNull();
  });
  test("failure model select and wear checkbox are overrides too", async () => {
    seed({ settings: openAll() });
    const r = mount(MachineSection);
    const sel = r.querySelector<HTMLSelectElement>("select")!;
    sel.value = "markup";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
    expect(store.draft.overrides.failureMode).toBe("markup");
    const box = r.querySelector<HTMLInputElement>("input[type=checkbox]#cf-1, .cf input")!;
    await click(box);
    expect(Object.keys(store.draft.overrides)).toContain("failureIncludesMachine");
  });
});

describe("extras", () => {
  test("empty shows help and only + Extra; custom row adds, edits, and scope changes", async () => {
    seed({ settings: openAll() });
    const r = mount(ExtrasSection);
    expect(r.textContent).toContain(t("extras.help"));
    await click(r.querySelector(".add button"));
    await click([...document.querySelectorAll("[role=menuitem]")].find((b) => b.textContent === t("extras.custom"))!);
    expect(store.draft.extras).toHaveLength(1);
    await type(r.querySelector<HTMLInputElement>("[data-extra-name]")!, "Magnet");
    await type(field(r, t("field.extraCost")), "1.50");
    expect(store.draft.extras[0]).toMatchObject({ label: "Magnet", unitMinor: 150, qtyE3: 1000, per: "piece" });
    const sel = r.querySelector<HTMLSelectElement>("select")!;
    sel.value = "order";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
    expect(store.draft.extras[0]!.per).toBe("order");
    expect(summary(r)).toMatch(/^1 item · R\$\s?\d/);
  });
  test("catalog items add prefilled rows; custom rows offer Save to catalog", async () => {
    seed({ settings: { ...openAll(), extrasCatalog: [{ key: "c1", label: "Box", unitMinor: 250, qtyE3: 1000, per: "order" }] } });
    const r = mount(ExtrasSection);
    await click(r.querySelector(".add button"));
    await click(document.querySelector("[role=menuitem]"));
    expect(store.draft.extras[0]).toMatchObject({ label: "Box", unitMinor: 250, per: "order" });
    expect(r.textContent).not.toContain(t("extras.saveToCatalog"));
    await type(r.querySelector<HTMLInputElement>("[data-extra-name]")!, "Ring");
    await click([...r.querySelectorAll("button")].find((b) => b.textContent === t("extras.saveToCatalog"))!);
    expect(store.settings.extrasCatalog.map((c) => c.label)).toEqual(["Box", "Ring"]);
  });
  test("remove offers Undo that restores the row at its index", async () => {
    seed({ settings: openAll() });
    store.draft = { ...store.draft, extras: [
      { key: "a", label: "A", unitMinor: 100, qtyE3: 1000, per: "piece" }, { key: "b", label: "B", unitMinor: 200, qtyE3: 1000, per: "plate" },
    ] };
    const r = mount(ExtrasSection);
    await click(r.querySelector(".xrow .xdel"));
    expect(store.draft.extras.map((x) => x.key)).toEqual(["b"]);
    const toast = toasts.list[toasts.list.length - 1]!;
    expect(toast.text).toBe(t("extras.removed"));
    toast.action!.run();
    expect(store.draft.extras.map((x) => x.key)).toEqual(["a", "b"]);
  });
  test("a blank name shows the required error after blur", async () => {
    seed({ settings: openAll() });
    store.draft = { ...store.draft, extras: [{ key: "a", label: "", unitMinor: 0, qtyE3: 1000, per: "piece" }] };
    const r = mount(ExtrasSection);
    const name = r.querySelector<HTMLInputElement>("[data-extra-name]")!;
    name.dispatchEvent(new Event("blur"));
    await nextTick();
    expect(name.getAttribute("aria-invalid")).toBe("true");
  });
});

describe("shipping and sales", () => {
  test("segmented mode emits overrides; amount hidden for Not included; summary follows", async () => {
    seed({ settings: openAll() });
    const r = mount(ShippingSection);
    expect(r.querySelector("input[type=text]")).toBeNull();
    const radio = (label: string) => [...r.querySelectorAll<HTMLElement>("[role=radio]")].find((b) => b.textContent === label)!;
    await click(radio(t("shipping.customer")));
    expect(store.draft.overrides.shipping).toEqual({ mode: "customer", minor: 0 });
    await type(field(r, t("field.shippingAmount")), "18,90".replace(",", "."));
    expect(store.draft.overrides.shipping).toEqual({ mode: "customer", minor: 1890 });
    expect(summary(r)).toMatch(/^Customer pays R\$\s?18\.90$/);
    await click(radio(t("shipping.absorbed")));
    expect(summary(r)).toMatch(/^Included in price/);
    expect(r.textContent).toContain(t("shipping.absorbedHelp"));
    await click(r.querySelector(".head button"));
    expect(store.draft.overrides.shipping).toBeUndefined();
  });
  test("sales fee fields edit the selected channel; rounding options come from the engine", async () => {
    seed({ settings: openAll() });
    const r = mount(SalesSection);
    await type(field(r, t("field.fee")), "8");
    expect(store.settings.channels.find((c) => c.id === "store")!.tiers[0]!.pctBp).toBe(800);
    await type(field(r, t("field.tax")), "10");
    expect(store.settings.channels.find((c) => c.id === "store")!.taxBp).toBe(1000);
    const opts = [...r.querySelectorAll<HTMLOptionElement>("select option")].map((o) => o.value);
    expect(opts).toEqual(["none", "round", "ending9", "step5"]);
    await type(field(r, t("field.minOrder")), "20");
    expect(store.draft.overrides.minOrderMinor).toBe(2000);
  });
  test("a multi-step channel shows the read-only steps line instead of the fee fields", () => {
    seed({ settings: { ...openAll(), channels: [{ id: "store", name: "S", taxBp: 0, surchargeMinor: 0, tiers: [{ minMinor: 0, pctBp: 500, fixedMinor: 0, shippingMinor: 0 }, { minMinor: 10000, pctBp: 300, fixedMinor: 0, shippingMinor: 0 }] }], comparedChannelIds: ["store"], defaultChannelId: "store" } });
    const r = mount(SalesSection);
    expect(r.textContent).toContain(t("channel.steps", { n: 2 }));
    expect(r.querySelector("label")?.textContent).not.toBe(t("field.fee"));
  });
});
