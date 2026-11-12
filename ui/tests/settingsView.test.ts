// Settings fields end to end: each control writes the setting it names (and only that one).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h, nextTick, type App } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({})) }));
import SettingsView from "../src/views/SettingsView.vue";
import { setLocale } from "../src/i18n";
import { settingsTab, type SettingsTab } from "../src/state/settingsTab";
import { store } from "../src/state/store";
import { clearToasts } from "../src/state/toast";
import { load } from "./priceKit";
import { choose } from "./pv";

let app: App | null = null;
let root: HTMLElement | null = null;
const flush = async () => { for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); } };
beforeEach(async () => {
  setLocale("en"); clearToasts(); load("ok"); settingsTab.value = "spoolman";
  store.status = "ready";
  root = document.createElement("div");
  document.body.appendChild(root);
  app = createApp({ render: () => h(SettingsView) });
  app.mount(root);
  await flush();
});
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });

const open = async (id: SettingsTab): Promise<void> => { settingsTab.value = id; await flush(); };
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
    await open("sheet");
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
    await open("costs");
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
    await open("costs");
    await choose(root!, "Add on top of cost");
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
  test("markup, rounding and minimum order write the defaults", async () => {
    await open("pricing");
    await type("Markup", "40");
    await choose(root!, "Ends in 0 or 5");
    await type("Minimum order", "50");
    await flush();
    const d = store.settings.defaults;
    expect([d.targetMarginBp, d.pretty, d.minOrderMinor]).toEqual([2857, "step5", 5000]); // 40% markup = 28.57% margin
  });
});

describe("tabs", () => {
  const tabs = () => [...root!.querySelectorAll<HTMLButtonElement>("[role=tab]")];
  const panels = () => [...root!.querySelectorAll("[role=tabpanel]")];
  test("one panel at a time, labelled by its tab, with roving tabindex", () => {
    expect(panels()).toHaveLength(1);
    expect(panels()[0]!.id).toBe("settings-spoolman");
    expect(panels()[0]!.getAttribute("aria-labelledby")).toBe("settings-tab-spoolman");
    expect(tabs().map((b) => b.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1", "-1", "-1", "-1", "-1"]);
    expect(tabs().filter((b) => b.getAttribute("aria-selected") === "true").map((b) => b.id)).toEqual(["settings-tab-spoolman"]);
    expect(root!.querySelector("#settings-extras")).toBeNull();
  });
  test("a click switches the panel", async () => {
    tabs().find((b) => b.textContent?.trim() === "Printers")!.click();
    await flush();
    expect(panels().map((p) => p.id)).toEqual(["settings-printers"]);
    expect(settingsTab.value).toBe("printers");
  });
  test("openSettingsTab('settings-printers') selects Printers", async () => {
    const { openSettingsTab } = await import("../src/state/settingsTab");
    openSettingsTab("settings-printers");
    await flush();
    expect(document.getElementById("settings-tab-printers")!.getAttribute("aria-selected")).toBe("true");
    expect(panels().map((p) => p.id)).toEqual(["settings-printers"]);
    openSettingsTab("nowhere");
    expect(settingsTab.value).toBe("printers");
  });
  test("arrow keys, Home and End move and activate", async () => {
    // PrimeVue Tabs: a horizontal tablist (Left/Right/Home/End on the focused tab), selecting on focus like the old rail did.
    const key = async (k: string) => { (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: k, code: k, bubbles: true })); await flush(); };
    document.getElementById(`settings-tab-${settingsTab.value}`)!.focus();
    await key("ArrowRight");
    expect(settingsTab.value).toBe("costs");
    expect(document.activeElement?.id).toBe("settings-tab-costs");
    await key("ArrowLeft"); await key("ArrowLeft");
    expect(settingsTab.value).toBe("about"); // wraps
    await key("Home");
    expect(settingsTab.value).toBe("spoolman");
    await key("End");
    expect(settingsTab.value).toBe("about");
    await key("ArrowRight");
    expect(settingsTab.value).toBe("spoolman");
    await key("Tab");
    expect(settingsTab.value).toBe("spoolman");
  });
});
