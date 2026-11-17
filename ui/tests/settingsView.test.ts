// Settings fields end to end: each control writes the setting it names (and only that one).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h, nextTick, type App } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({})) }));
import SettingsView from "../src/views/SettingsView.vue";
import { setLocale } from "../src/i18n";
import { settingsTab, type SettingsTab } from "../src/state/settingsTab";
import { store } from "../src/state/store";
import { clearToasts } from "../shared/src/components/toast";
import { load } from "./priceKit";
import { choose } from "./pv";

let app: App | null = null;
let root: HTMLElement | null = null;
const flush = async () => { for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); } };
beforeEach(async () => {
  setLocale("en"); clearToasts(); load("ok"); settingsTab.value = "spoolman"; localStorage.clear(); // OuiSettings remembers the last tab
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
    await choose(root!.querySelector("#settings-pricing")!, "Ends in 0 or 5");
    await type("Minimum order", "50");
    await flush();
    const d = store.settings.defaults;
    expect([d.targetMarginBp, d.pretty, d.minOrderMinor]).toEqual([2857, "step5", 5000]); // 40% markup = 28.57% margin
  });
});

describe("section index", () => {
  const links = () => [...root!.querySelectorAll<HTMLButtonElement>("nav [role=tab]")];
  const groups = () => [...root!.querySelectorAll(".grp")].map((g) => g.id);
  test("one tab per group in reading order, the first selected and the only group shown", () => {
    expect(groups().sort()).toEqual(["about", "channels", "costs", "language", "pricing", "printers", "requirements", "sheet", "spoolman"].map((id) => `settings-${id}`));
    expect(links().map((l) => l.textContent?.trim())).toEqual(["Spoolman", "Costs", "Pricing", "Sales channels", "Printers", "Quote sheet", "Language and currency", "Requirements", "About"]);
    expect(links().filter((l) => l.getAttribute("aria-selected") === "true").map((l) => l.dataset.section)).toEqual(["settings-spoolman"]);
    expect([...root!.querySelectorAll<HTMLElement>(".grp")].filter((g) => !g.hidden).map((g) => g.id)).toEqual(["settings-spoolman"]);
    expect(root!.querySelector("#settings-extras")).toBeNull();
  });
  test("a click on a tab shows its group alone and selects it", async () => {
    links().find((l) => l.textContent?.trim() === "Printers")!.click();
    await flush();
    expect(links().find((l) => l.getAttribute("aria-selected") === "true")?.dataset.section).toBe("settings-printers");
    expect([...root!.querySelectorAll<HTMLElement>(".grp")].filter((g) => !g.hidden).map((g) => g.id)).toEqual(["settings-printers"]);
  });
  test("openSettingsTab('settings-printers') opens the Printers tab; an unknown anchor changes nothing", async () => {
    const shown = () => [...root!.querySelectorAll<HTMLElement>(".grp")].filter((g) => !g.hidden).map((g) => g.id);
    const { openSettingsTab } = await import("../src/state/settingsTab");
    openSettingsTab("settings-printers");
    await flush();
    expect(settingsTab.value).toBe("printers");
    expect(shown()).toEqual(["settings-printers"]);
    openSettingsTab("nowhere");
    await flush();
    expect(settingsTab.value).toBe("printers");
    expect(shown()).toEqual(["settings-printers"]);
  });
  test("the tabs are one stop for Tab and arrow keys move between them", async () => {
    expect(links().filter((l) => l.tabIndex === 0)).toHaveLength(1);
    const first = links()[0];
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await flush();
    expect(links()[1].getAttribute("aria-selected")).toBe("true");
  });
});
