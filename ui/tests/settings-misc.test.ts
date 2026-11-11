import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import AboutSettings from "../src/components/settings/AboutSettings.vue";
import ExtrasCatalog from "../src/components/settings/ExtrasCatalog.vue";
import LanguageCurrency from "../src/components/settings/LanguageCurrency.vue";
import PrinterProfiles from "../src/components/settings/PrinterProfiles.vue";
import CostDefaults from "../src/components/settings/CostDefaults.vue";
import FirstRunChecklist from "../src/components/FirstRunChecklist.vue";
import SettingsView from "../src/views/SettingsView.vue";
import { t } from "../src/i18n";
import { openSettingsTab, settingsTab } from "../src/state/settingsTab";
import { store } from "../src/state/store";
import { byText, flush, installHost, lastToast, mountComponent, resetStore, type, unmountComponent } from "./settings-helpers";

beforeEach(() => { resetStore(); settingsTab.value = "spoolman"; });
afterEach(() => { unmountComponent(); vi.useRealTimers(); });

describe("printer profiles", () => {
  test("current printer first, suggestion shown, reset returns to suggestion", async () => {
    installHost();
    store.host = { ...store.host, printerModel: "Snapmaker U1", printerVendor: "Snapmaker" };
    store.settings = { ...store.settings, printers: { "Aaa Printer": { watts: 90, acquisitionMinor: null, lifetimeHours: null }, "Snapmaker U1": { watts: 300, acquisitionMinor: 450000, lifetimeHours: 5000 } } };
    const root = mountComponent(PrinterProfiles);
    const titles = [...root.querySelectorAll(".pp-head .lg")].map((e) => e.textContent);
    expect(titles).toEqual(["Snapmaker U1", "Aaa Printer"]);
    expect(root.querySelector(".pp-card")?.textContent).toContain("Current");
    expect(root.querySelector(".pp-card")?.textContent).toContain("Suggested:");
    (root.querySelector(".pp-card button[aria-label^='Reset']") as HTMLElement).click();
    await flush();
    expect(store.settings.printers["Snapmaker U1"]!.watts).toBeNull();
    expect(store.settings.printers["Snapmaker U1"]!.acquisitionMinor).toBe(450000);
  });

  test("remove shows an undo that restores the profile", async () => {
    installHost();
    const prof = { watts: 90, acquisitionMinor: null, lifetimeHours: null };
    store.settings = { ...store.settings, printers: { "Aaa Printer": prof } };
    const root = mountComponent(PrinterProfiles);
    (root.querySelector("button[aria-label='Remove Aaa Printer']") as HTMLElement).click();
    expect(store.settings.printers).toEqual({});
    lastToast()!.action!.run();
    expect(store.settings.printers["Aaa Printer"]).toEqual(prof);
  });
});

describe("extras catalog", () => {
  test("add, edit, remove with undo at the same index", async () => {
    installHost();
    const root = mountComponent(ExtrasCatalog);
    byText(root, "button", t("catalog.add"))!.click(); byText(root, "button", t("catalog.add"))!.click(); await flush();
    expect(store.settings.extrasCatalog).toHaveLength(2);
    type(root.querySelector(".ec-item input")!, "Ring"); await flush();
    expect(store.settings.extrasCatalog[0]!.label).toBe("Ring");
    (root.querySelector("button[aria-label='Remove Ring']") as HTMLElement).click(); await flush();
    expect(store.settings.extrasCatalog).toHaveLength(1);
    lastToast()!.action!.run();
    expect(store.settings.extrasCatalog.map((x) => x.label)).toEqual(["Ring", ""]);
  });
});

describe("auto-save", () => {
  test("a burst of edits calls save_settings once after 600 ms", async () => {
    vi.useFakeTimers();
    const calls = installHost();
    const root = mountComponent(CostDefaults);
    const input = root.querySelectorAll<HTMLInputElement>("input[type=text]")[1]!;
    for (const v of ["1", "12", "123"]) { type(input, v); vi.advanceTimersByTime(100); }
    await vi.advanceTimersByTimeAsync(499);
    expect(calls.filter((c) => c.cmd === "save_settings")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    await flush();
    expect(calls.filter((c) => c.cmd === "save_settings")).toHaveLength(1);
    expect(store.saveStatus).toBe("saved");
    expect(store.settings.defaults.maintenancePerHourMinor).toBe(12300);
  });

  test("view shows Saved, has no Save button, and rail buttons are not links", async () => {
    installHost();
    store.saveStatus = "saved";
    const root = mountComponent(SettingsView);
    expect(root.querySelector("[role=status]")?.textContent).toContain("Saved");
    expect(byText(root, "button", "Save")).toBeUndefined();
    expect(root.querySelector("a")).toBeNull();
    expect(root.querySelectorAll("section.grp")).toHaveLength(1); // one tab panel at a time
    expect(root.querySelectorAll("[data-stub]")).toHaveLength(0);
  });
});

describe("anchors", () => {
  test("every settings anchor opens its tab and the panel keeps the settings-<id> id", async () => {
    installHost();
    const root = mountComponent(SettingsView);
    for (const id of ["spoolman", "costs", "pricing", "channels", "printers", "sheet", "language", "about"]) {
      openSettingsTab(`settings-${id}`);
      await nextTick();
      expect(root.querySelector(`section#settings-${id}[role=tabpanel]`), id).not.toBeNull();
    }
    openSettingsTab("settings-extras"); // moved to its own top-level tab: leaves Settings where it was
    expect(settingsTab.value).toBe("about");
  });
});

describe("first-run checklist", () => {
  test("steps complete as values are entered; Done sets onboarded", async () => {
    const calls = installHost({ spoolman_fetch: () => ({ currency: "BRL", filaments: [], spools: [] }) });
    const root = mountComponent(FirstRunChecklist);
    const done = () => [...root.querySelectorAll(".fr-mark")].map((e) => e.classList.contains("on"));
    expect(done()).toEqual([false, false, false]);
    expect(root.textContent).toContain(t("setup.permission"));
    byText(root, "button", t("setup.skip"))!.click(); await flush();
    expect(done()).toEqual([true, false, false]);
    expect(root.textContent).toContain("Using preset prices");
    type(root.querySelector("[data-row=energy] input")!, "0.95"); await flush();
    expect(store.settings.defaults.energyPerKwh).toBe("0.95");
    type(root.querySelector("[data-row=time] input")!, "30"); await flush();
    expect(done()).toEqual([true, true, true]);
    expect(store.settings.onboarded).toBe(false);
    byText(root, "button", t("setup.done"))!.click();
    expect(store.settings.onboarded).toBe(true);
    expect(calls.filter((c) => c.cmd === "spoolman_fetch")).toHaveLength(0);
  });

  test("detected Spooler address is offered and saved on click", async () => {
    installHost({ spoolman_fetch: () => ({ currency: "BRL", filaments: [], spools: [] }) });
    store.spooler = { url: "http://10.0.0.5:7912", presetToFilament: {} };
    const root = mountComponent(FirstRunChecklist);
    expect(root.textContent).toContain("Spooler uses Spoolman at http://10.0.0.5:7912.");
    byText(root, "button", t("setup.useSpoolman"))!.click(); await flush();
    expect(store.settings.spoolman.url).toBe("http://10.0.0.5:7912");
    expect(root.querySelector(".fr-mark")?.classList.contains("on")).toBe(true);
  });
});

describe("language and about", () => {
  test("switching language re-renders copy and saves the setting", async () => {
    installHost();
    const root = mountComponent(LanguageCurrency);
    expect(root.textContent).toContain("Language");
    const sel = root.querySelector("select")!;
    sel.value = "pt-BR"; sel.dispatchEvent(new Event("change", { bubbles: true })); await flush();
    expect(store.settings.language).toBe("pt-BR");
    expect(root.textContent).toContain("Idioma");
    expect(root.textContent).toContain("Moeda");
  });

  test("currency: typed code validated; Spoolman currency is read-only", async () => {
    installHost();
    const root = mountComponent(LanguageCurrency);
    const input = root.querySelector<HTMLInputElement>("input")!;
    type(input, "zz"); await flush();
    expect(root.textContent).toContain("Use a 3-letter currency code");
    type(input, "brl"); await flush();
    expect(store.settings.currency).toBe("BRL");
    store.spoolman = { ...store.spoolman, data: { ...store.spoolman.data, currency: "EUR" } };
    await flush();
    expect(root.querySelector("input")).toBeNull();
    expect(root.textContent).toContain("EUR from Spoolman");
  });

  test("reset all needs two clicks, then offers undo", async () => {
    installHost({ spoolman_fetch: () => ({ currency: null, filaments: [], spools: [] }) });
    store.settings = { ...store.settings, sheet: { ...store.settings.sheet, shopName: "Mine" } };
    const root = mountComponent(AboutSettings);
    const btn = () => root.querySelector<HTMLElement>("button.danger")!;
    btn().click(); await flush();
    expect(btn().textContent).toContain("Click again");
    expect(store.settings.sheet.shopName).toBe("Mine");
    btn().click(); await flush();
    expect(store.settings.sheet.shopName).toBe("");
    lastToast()!.action!.run();
    expect(store.settings.sheet.shopName).toBe("Mine");
  });
});
