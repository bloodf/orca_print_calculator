import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import { BAMBU_HOST } from "../src/mock/fixtures";

const call = vi.fn();
vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: (...a: unknown[]) => call(...a) }));

import AppHeader from "../src/components/AppHeader.vue";
import PrinterChip from "../src/components/PrinterChip.vue";
import SpoolmanStatus from "../src/components/SpoolmanStatus.vue";
import PricePanel from "../src/components/price/PricePanel.vue";
import { t } from "../src/i18n";
import { setLanguage, store } from "../src/state/store";
import { click, field, mount, seed, type, unmount } from "./costsHarness";

beforeEach(() => { vi.useFakeTimers(); call.mockReset(); });
afterEach(() => { unmount(); vi.clearAllTimers(); vi.useRealTimers(); });

describe("PrinterChip", () => {
  test("estimated match shows the Estimated badge; saved value does not", () => {
    seed({ host: BAMBU_HOST, settings: { printers: {} } });
    const est = mount(PrinterChip, { model: "Bambu Lab X1 Carbon", watts: 120, source: "match", estimated: true });
    expect(est.textContent).toContain("Bambu Lab X1 Carbon");
    expect(est.textContent).toContain("120 W");
    expect(est.textContent).toContain(t("printer.estimatedPower"));
    const saved = mount(PrinterChip, { model: "Snapmaker U1", watts: 150, source: "saved", estimated: true });
    expect(saved.textContent).not.toContain(t("printer.estimatedPower"));
  });
  test("no model reads No printer and has no popover", () => {
    seed();
    const r = mount(PrinterChip, { model: null, watts: 120, source: "match", estimated: true });
    expect(r.textContent).toContain(t("header.noPrinter"));
    expect(r.querySelector("button")).toBeNull();
  });
  test("editing watts in the popover saves to settings.printers; Use suggested clears it", async () => {
    seed({ settings: { printers: {} } });
    const r = mount(PrinterChip, { model: "Snapmaker U1", watts: 120, source: "match", estimated: true });
    await click(r.querySelector("button.chip"));
    const dlg = document.querySelector("[role=dialog]") as HTMLElement;
    expect(dlg.textContent).toContain("Suggested:");
    await type(field(dlg, t("printer.power")), "165");
    expect(store.settings.printers["Snapmaker U1"]?.watts).toBe(165);
    expect(store.settings.printers["Snapmaker U1"]?.acquisitionMinor).toBeNull();
  });
  test("Use suggested appears only for a saved value and resets it", async () => {
    seed();
    const r = mount(PrinterChip, { model: "Snapmaker U1", watts: 120, source: "saved", estimated: false });
    await click(r.querySelector("button.chip"));
    const use = [...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent === t("printer.useSuggested"))!;
    await click(use);
    expect(store.settings.printers["Snapmaker U1"]?.watts).toBeNull();
    expect(store.settings.printers["Snapmaker U1"]?.acquisitionMinor).toBe(450000);
  });
});

describe("SpoolmanStatus", () => {
  const label = (state: string, extra: Record<string, unknown> = {}) => { seed(); return mount(SpoolmanStatus, { state, ...extra }).querySelector("button")!.getAttribute("aria-label"); };
  test("text per state", () => {
    expect(label("unset")).toBe(t("spoolman.unset"));
    expect(label("connecting")).toBe(t("spoolman.connecting"));
    expect(label("ok", { spools: 14 })).toBe("Spoolman · 14 spools");
    expect(label("ok", { spools: 1 })).toBe("Spoolman · 1 spool");
    expect(label("offline")).toBe(t("spoolman.offline"));
  });
  test("each Spoolman state has its own mark, not only its own colour (the text hides below 1500 px)", () => {
    seed();
    const mark = (state: string) => { const s = mount(SpoolmanStatus, { state }).querySelector(".oui-status")!; return s.querySelector("svg")?.innerHTML ?? `dot:${s.getAttribute("data-state")}`; };
    const marks = ["ok", "offline", "connecting", "unset"].map(mark);
    expect(new Set(marks).size).toBe(4);
    expect(marks[1]).not.toMatch(/^dot:/); // offline: the offline glyph
  });
  test("dot class follows the state", () => {
    seed();
    expect(mount(SpoolmanStatus, { state: "offline" }).querySelector(".dot")!.className).toContain("offline");
  });
  test("ok click refreshes and toasts; offline opens a popover with the error and Retry", async () => {
    seed();
    call.mockResolvedValue({ currency: "BRL", filaments: [], spools: [] });
    const ok = mount(SpoolmanStatus, { state: "ok", spools: 3 });
    await click(ok.querySelector("button"));
    expect(document.querySelector("[role=dialog]")).not.toBeNull(); // green opens the popover; Refresh is in it
    await click([...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent === t("plates.refresh"))!);
    await vi.advanceTimersByTimeAsync(10);
    expect(call).toHaveBeenCalledWith("spoolman_fetch", expect.anything());
    const off = mount(SpoolmanStatus, { state: "offline", error: "unreachable" });
    await click(off.querySelector("button"));
    const dlg = document.querySelector("[role=dialog]")!;
    expect(dlg.textContent).toContain(t("spoolman.error.unreachable"));
    call.mockClear();
    await click([...dlg.querySelectorAll("button")].find((b) => b.textContent === t("spoolman.retry"))!);
    expect(call).toHaveBeenCalledTimes(1);
  });
  test("offline popover uses the same copy as Settings for every host code (http_<n> included)", async () => {
    seed();
    for (const [code, text] of [["http_503", t("spoolman.error.http", { status: "503" })], ["bad_json", t("spoolman.error.bad_json")], ["weird", t("spoolman.error.unknown", { detail: "weird" })]] as const) {
      const off = mount(SpoolmanStatus, { state: "offline", error: code });
      await click(off.querySelector("button"));
      expect(document.querySelector("[role=dialog]")!.textContent).toContain(text);
      unmount();
    }
  });
});

describe("AppHeader", () => {
  test("shows project name and printer chip; the currency sits on the price panel; the language select lives in Settings, not here", async () => {
    seed();
    const r = mount(AppHeader, { view: "calc" });
    expect(r.textContent).toContain("Desk organizer");
    expect(r.textContent).toContain("Snapmaker U1");
    expect(r.querySelector("select")).toBeNull();
    setLanguage("pt-BR"); // the Settings select calls this
    await nextTick();
    expect(store.settings.language).toBe("pt-BR");
    expect(r.querySelector("[role=tablist] [role=tab] span")!.textContent).toBe("Calculadora");
    setLanguage("en");
    expect(mount(PricePanel).querySelector(".cur")!.textContent).toBe("BRL");
  });
  test("every tab keeps its name; the current one is marked selected (narrow bars put the tabs on their own scrolling line)", () => {
    seed();
    const r = mount(AppHeader, { view: "quotes" });
    expect(r.querySelector("[role=tablist]")).not.toBeNull();
    const labels = [...r.querySelectorAll<HTMLElement>("[role=tab]")].map((b) => ({ on: b.getAttribute("aria-selected") === "true", name: b.querySelector("span")!.textContent }));
    expect(labels).toEqual([{ on: false, name: "Calculator" }, { on: true, name: "Quotes" }, { on: false, name: "Extras and stock" }, { on: false, name: "Settings" }]);
  });
  test("the Spoolman chip keeps its full text as the accessible name and tooltip even when the label is cut", () => {
    seed();
    const r = mount(SpoolmanStatus, { state: "unset" });
    const b = r.querySelector("button")!;
    expect(b.getAttribute("title")).toBe(t("spoolman.unset"));
    expect(b.getAttribute("aria-label")).toBe(t("spoolman.unset"));
  });
  test("untitled project fallback and currency chip source title", () => {
    seed({ host: { ...BAMBU_HOST, projectName: null } });
    const r = mount(AppHeader, { view: "calc" });
    expect(r.textContent).toContain(t("header.untitled"));
    expect(mount(PricePanel).querySelector(".cur")!.getAttribute("title")).toBe(t("header.currencyFromSpoolman"));
  });
});

describe("AppHeader tabs", () => {
  test("every tab has an icon and its name as text, which is its accessible name", () => {
    seed();
    const r = mount(AppHeader, { view: "calc" });
    const btns = [...r.querySelectorAll<HTMLElement>("[role=tab]")];
    expect(btns).toHaveLength(4);
    for (const b of btns) {
      expect(b.querySelector("svg")).not.toBeNull();
      expect(b.querySelector("span")!.textContent!.trim()).toBeTruthy();
      expect(b.getAttribute("aria-label")).toBeNull(); // the text names it, with the count when there is one
    }
  });
});
