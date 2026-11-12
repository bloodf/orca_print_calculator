// C05: a cost line that depends on unknown data is a dash with its reason, never left out (which reads as a cost of zero).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { nextTick, type App } from "vue";
import BreakdownBars from "../src/components/price/BreakdownBars.vue";
import MachineSection from "../src/components/costs/MachineSection.vue";
import { unknownLines } from "../src/components/price/unknownLines";
import { setLocale } from "../src/i18n";
import { derived } from "../src/state/store";
import { clearToasts } from "../src/state/toast";
import { load, mount, txt } from "./priceKit";

let app: App | null = null;
let root: HTMLElement | null = null;
const show = async (c: Parameters<typeof mount>[0]): Promise<HTMLElement> => { const m = mount(c); app = m.app; root = m.root; await nextTick(); return m.root; };
beforeEach(() => { setLocale("en"); clearToasts(); });
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });

describe("unknown cost lines", () => {
  test("unknown plate time: energy and printer wear stay in the breakdown as a dash with the reason, and the total is marked partial", async () => {
    load("unknown");
    expect(unknownLines(derived.value)).toMatchObject({ energy: "time", depreciation: "time", filament: "grams" });
    const el = await show(BreakdownBars);
    const energy = el.querySelector("[data-row=energy]")!;
    expect(energy.hasAttribute("data-unknown")).toBe(true);
    expect(txt(energy)).toContain("Energy · time unknown");
    expect(txt(energy)).toContain("unknown"); // the screen-reader text next to the dash
    expect(txt(el.querySelector("[data-row=depreciation]"))).toContain("time unknown");
    expect(txt(el.querySelector("[data-row=costTotal]"))).toContain("Cost per piece · partial");
    expect(el.querySelector("[data-row=energy] .bar")).toBeNull(); // no bar for an amount nobody knows
  });
  test("a known line that leaves something out says partial, with the amount kept", async () => {
    load("unknown");
    const el = await show(BreakdownBars);
    expect(txt(el.querySelector("[data-row=filament]"))).toMatch(/Filament · partialR\$/);
  });
  test("an energy price that is not set is named as such (not 'time')", async () => {
    load("ok", { settings: (s) => ({ ...s, defaults: { ...s.defaults, energyPerKwh: null } }) });
    const el = await show(BreakdownBars);
    expect(txt(el.querySelector("[data-row=energy]"))).toContain("Energy · not set");
  });
  test("nothing unknown: no dash rows and no partial mark", async () => {
    load("ok");
    expect(unknownLines(derived.value)).toEqual({});
    const el = await show(BreakdownBars);
    expect(el.querySelector("[data-unknown]")).toBeNull();
    expect(txt(el.querySelector("[data-row=costTotal]"))).not.toContain("partial");
  });
  test("pt-BR reasons", async () => {
    setLocale("pt-BR");
    load("unknown");
    const el = await show(BreakdownBars);
    expect(txt(el.querySelector("[data-row=energy]"))).toContain("Energia · tempo desconhecido");
  });
  test("the machine section summary shows the unknown lines too, not only the failures", async () => {
    load("unknown");
    const el = await show(MachineSection);
    const sum = txt(el.querySelector(".sec-sum"));
    expect(sum).toContain("Energy —");
    expect(sum).toContain("Machine —");
    expect(sum).toContain("Failures");
  });
});
