import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import { BAMBU_HOST } from "../src/mock/fixtures";

const call = vi.fn();
vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: (...a: unknown[]) => call(...a) }));

import AppHeader from "../src/components/AppHeader.vue";
import PrinterChip from "../src/components/PrinterChip.vue";
import SpoolmanStatus from "../src/components/SpoolmanStatus.vue";
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
    expect(est.textContent).toContain(t("printer.estimated"));
    const saved = mount(PrinterChip, { model: "Snapmaker U1", watts: 150, source: "saved", estimated: true });
    expect(saved.textContent).not.toContain(t("printer.estimated"));
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
  test("dot class follows the state", () => {
    seed();
    expect(mount(SpoolmanStatus, { state: "offline" }).querySelector(".dot")!.className).toContain("offline");
  });
  test("ok click refreshes and toasts; offline opens a popover with the error and Retry", async () => {
    seed();
    call.mockResolvedValue({ currency: "BRL", filaments: [], spools: [] });
    const ok = mount(SpoolmanStatus, { state: "ok", spools: 3 });
    await click(ok.querySelector("button"));
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
  test("shows project name, printer chip and currency; the language select lives in Settings, not here", async () => {
    seed();
    const r = mount(AppHeader, { view: "calc" });
    expect(r.textContent).toContain("Desk organizer");
    expect(r.textContent).toContain("Snapmaker U1");
    expect(r.querySelector(".cur")!.textContent).toBe("BRL");
    expect(r.querySelector("select")).toBeNull();
    setLanguage("pt-BR"); // the Settings select calls this
    await nextTick();
    expect(store.settings.language).toBe("pt-BR");
    expect(r.querySelector("[role=tablist] [role=tab]")!.getAttribute("aria-label")).toBe("Calculadora");
  });
  test("the tab group never shrinks and only the current tab keeps its name when narrow", () => {
    seed();
    const r = mount(AppHeader, { view: "quotes" });
    expect(r.querySelector("[role=tablist]")).not.toBeNull();
    const labels = [...r.querySelectorAll<HTMLElement>("[role=tab]")].map((b) => ({ on: b.getAttribute("aria-selected") === "true", hides: b.querySelector(".tab-label")!.classList.contains("hide-narrow") }));
    expect(labels).toEqual([{ on: false, hides: true }, { on: true, hides: false }, { on: false, hides: true }, { on: false, hides: true }]);
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
    expect(r.querySelector(".cur")!.getAttribute("title")).toBe(t("header.currencyFromSpoolman"));
  });
});

describe("AppHeader tabs", () => {
  test("tabs collapse to icons below the wide breakpoint but keep the full label as title and aria-label", () => {
    seed();
    const r = mount(AppHeader, { view: "calc" });
    const btns = [...r.querySelectorAll<HTMLElement>("[role=tab]")];
    expect(btns).toHaveLength(4);
    for (const b of btns) {
      expect(b.getAttribute("title")).toBeTruthy();
      expect(b.getAttribute("aria-label")).toBe(b.getAttribute("title"));
    }
  });
});
