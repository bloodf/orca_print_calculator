// Settings fields end to end: each control writes the setting it names (and only that one).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({})) }));
import SettingsView from "../src/views/SettingsView.vue";
import { setLocale } from "../src/i18n";
import { store } from "../src/state/store";
import { clearToasts } from "../src/state/toast";
import { load } from "./priceKit";

let app: App | null = null;
let root: HTMLElement | null = null;
const flush = async () => { for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); } };
beforeEach(async () => {
  setLocale("en"); clearToasts(); load("ok");
  store.status = "ready";
  root = document.createElement("div");
  document.body.appendChild(root);
  app = createApp({ render: () => h(SettingsView) });
  app.mount(root);
  await flush();
});
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });

const input = (label: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => {
  const l = [...root!.querySelectorAll("label")].find((x) => x.textContent?.trim() === label);
  if (!l) throw new Error(`no label "${label}"`);
  return root!.querySelector(`#${l.htmlFor}`)!;
};
const type = async (label: string, value: string): Promise<void> => {
  const el = input(label) as HTMLInputElement;
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.blur();
  await flush();
};

describe("Quote sheet settings", () => {
  test("shop name, footer, validity and next number", async () => {
    await type("Shop name", "Layer Lab");
    await type("Footer note", "Pay in 7 days");
    await type("Valid for", "30");
    await type("Next quote number", "100");
    const s = store.settings.sheet;
    expect([s.shopName, s.footer, s.validityDays, s.nextNo]).toEqual(["Layer Lab", "Pay in 7 days", 30, 100]);
  });
});

describe("Cost defaults", () => {
  test("every field writes its default", async () => {
    await type("Price per kWh", "0.80");
    await type("Maintenance", "1.50");
    await type("Fixed cost per print hour", "2.00");
    await type("Failure rate", "7");
    await type("Labor rate", "40");
    await type("Hands-on time per run", "15");
    await type("Setup time per order", "20");
    const d = store.settings.defaults;
    expect(d.energyPerKwh).toBe("0.8");
    expect([d.maintenancePerHourMinor, d.fixedPerPrintHourMinor, d.failureBp, d.laborPerHourMinor, d.laborMinutes, d.setupMinutes]).toEqual([150, 200, 700, 4000, 15, 20]);
  });
  test("failure mode and the two checkboxes", async () => {
    const mode = input("Failure cost") as HTMLSelectElement;
    mode.value = "markup";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    expect(store.settings.defaults.failureMode).toBe("markup");
    const boxes = [...root!.querySelectorAll<HTMLInputElement>('.checks input[type="checkbox"]')];
    expect(boxes.length).toBe(2);
    const before = boxes.map((b) => b.checked);
    boxes.forEach((b) => b.click());
    await flush();
    expect([store.settings.defaults.failureIncludesMachine, store.settings.defaults.depreciationEnabled]).toEqual(before.map((b) => !b));
  });
});

describe("Pricing defaults", () => {
  test("target margin, rounding and minimum order write the defaults", async () => {
    await type("Target margin", "40");
    const pretty = input("Price rounding") as HTMLSelectElement;
    pretty.value = "step5";
    pretty.dispatchEvent(new Event("change", { bubbles: true }));
    await type("Minimum order", "50");
    await flush();
    const d = store.settings.defaults;
    expect([d.targetMarginBp, d.pretty, d.minOrderMinor]).toEqual([4000, "step5", 5000]);
  });
});
