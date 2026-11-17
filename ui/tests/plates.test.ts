import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h, nextTick, type App } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn() }));
import { call, BridgeError } from "../src/bridge";
import { newDraft } from "../src/state/defaults";
import { store } from "../src/state/store";
import { clearToasts, toastList as toasts } from "../shared/src/components/toast";
import { setLocale } from "../src/i18n";
import { buildScenario, type ScenarioName } from "../src/mock/scenarios";
import { spoolman } from "../src/mock/fixtures";
import PlateList from "../src/components/plates/PlateList.vue";
import PlateNotices from "../src/components/plates/PlateNotices.vue";
import AppHeader from "../src/components/AppHeader.vue";
// what the calculator shows above and in the Plates panel: the page notices, then the list
const Plates = { render: () => [h(PlateNotices), h(PlateList)] };
import ImportButton from "../src/components/plates/ImportButton.vue";
import { importFile, importState, checkFile } from "../src/components/plates/importFlow";
import { settle } from "./pv";

let app: App | null = null;
let root: HTMLElement;
const flush = async () => { for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve(); } };

function seed(name: ScenarioName, sm = true): void {
  const { state } = buildScenario(name);
  store.host = state.host;
  store.plates = state.plates;
  store.pendingPlates = null;
  store.settings = state.settings!;
  store.draft = newDraft(state.settings!);
  store.quotes = [];
  store.spooler = state.spooler;
  store.spoolman = sm ? { state: "ok", data: spoolman(), error: null } : { state: "unset", data: { currency: "BRL", filaments: [], spools: [] }, error: null };
}
const mount = async (c: unknown, props: Record<string, unknown> = {}) => { app = createApp({ render: () => h(c as never, props) }); app.mount(root); await flush(); };

beforeEach(() => { root = document.createElement("div"); document.body.appendChild(root); setLocale("en"); clearToasts(); vi.mocked(call).mockReset(); importState.phase = "idle"; });
afterEach(() => { app?.unmount(); app = null; root.remove(); });

describe("PlateList rendering", () => {
  test("ok: one card per plate with name, chips, cost, copies and no price figure or stale class", async () => {
    seed("ok");
    await mount(PlateList);
    const cards = root.querySelectorAll("article");
    expect(cards).toHaveLength(3);
    expect(cards[0]!.textContent).toContain("Plate 1");
    expect(cards[2]!.textContent).toContain("Plate 3");
    expect(cards[0]!.querySelectorAll(".chip")).toHaveLength(2);
    expect(cards[0]!.querySelector(".cost")!.textContent).toMatch(/\d/);
    expect(cards[0]!.querySelector("[aria-label='Copies per run, plate 1']")).not.toBeNull();
    expect(root.textContent).toContain("3 plates");
    // the project name is said once, in the app bar
    store.status = "ready";
    const bar = document.body.appendChild(document.createElement("div"));
    const hdr = createApp({ render: () => h(AppHeader, { view: "calc" }) });
    hdr.mount(bar); await flush();
    expect(bar.textContent).toContain("Desk organizer");
    hdr.unmount(); bar.remove();
    expect(root.querySelector(".stale, [class*=price-figure]")).toBeNull();
    expect(root.textContent).not.toContain("May be out of date");
  });
  test("stale: badge on every card and a project-wide alert", async () => {
    seed("stale");
    await mount(Plates);
    expect(root.textContent!.match(/May be out of date/g)).toHaveLength(3);
    expect(root.querySelector("[role=status]")?.textContent).toContain("Plates may be out of date");
  });
  test("unknown: time and grams say so in words, marked as a gap, never 0", async () => {
    seed("unknown");
    await mount(PlateList);
    const meta = root.querySelector(".meta")!;
    expect(meta.textContent).toContain("time unknown");
    expect(meta.textContent).toContain("weight unknown");
    expect(meta.querySelectorAll(".gap")).toHaveLength(2);
    expect(meta.textContent).not.toMatch(/\b0 ?(g|s|m)\b/);
  });
  test("imported: shows from-file provenance and the info alert", async () => {
    seed("imported");
    await mount(Plates);
    expect(root.querySelector("article")!.textContent).toContain("from desk-organizer.gcode.3mf");
    expect(root.querySelector("[role=status]")?.textContent).toContain("Plates from desk-organizer.gcode.3mf");
  });
  test("empty: EmptyState with the import button", async () => {
    seed("empty");
    await mount(PlateList);
    expect(root.querySelector("article")).toBeNull();
    expect(root.textContent).toContain("Open a project to price it");
    expect(root.textContent).toContain("Import sliced file");
  });
});

describe("controls", () => {
  test("include toggles the draft and shows Not included", async () => {
    seed("ok");
    await mount(PlateList);
    const box = root.querySelector<HTMLInputElement>("input[type=checkbox]")!;
    box.checked = false;
    box.dispatchEvent(new Event("change"));
    await flush();
    expect(store.draft.plates[0]!.include).toBe(false);
    expect(root.querySelector("article")!.textContent).toContain("Not included");
  });
  test("copies stepper updates the draft and the cost caption", async () => {
    seed("ok");
    await mount(PlateList);
    root.querySelector<HTMLButtonElement>("article [aria-label='Increase Copies per run, plate 1']")!.click();
    await flush();
    expect(store.draft.plates[0]!.copies).toBe(2);
    expect(root.querySelector("article")!.textContent).toContain("cost × 2");
  });
});

describe("chips, rows and picker", () => {
  test("chip toggles the material rows; no price source is marked", async () => {
    seed("ok");
    await mount(PlateList);
    const chip = root.querySelector<HTMLButtonElement>(".chip")!;
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector(".rows")).toBeNull();
    chip.click(); await flush();
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelector(".rows")).not.toBeNull();
    expect(root.querySelectorAll(".mrow").length).toBeGreaterThan(0);
  });
  test("picking a spool keeps it for this printer preset and slot; reset goes back to Auto", async () => {
    seed("ok");
    await mount(PlateList);
    root.querySelector<HTMLButtonElement>(".chip")!.click(); await flush();
    root.querySelector<HTMLButtonElement>(".mrow .actions button")!.click(); await settle();
    const opts = document.querySelectorAll<HTMLElement>(".p-listbox-option");
    expect(opts.length).toBeGreaterThan(3);
    const spool = Array.from(opts).find((o) => o.querySelector(".opt[data-spool='9']"))!;
    spool.click(); await settle();
    expect(store.settings.slotSpools).toEqual({ "Snapmaker U1 (0.4 nozzle)#1": { filamentId: 1, spoolId: 9, preset: "Generic PLA @U1" } });
    expect(store.settings.slotOverrides).toEqual({});
    expect(root.querySelector(".mrow [data-priced-by]")?.textContent).toBe("Spoolman spool #9");
    expect(root.querySelector(".mrow")?.textContent).toContain("Picked spool");
    const reset = root.querySelector<HTMLButtonElement>(".mrow .actions .icon-btn-sm")!;
    expect(reset).not.toBeNull();
    reset.click(); await flush();
    expect(store.settings.slotSpools).toEqual({});
  });
  test("the Auto option clears this slot's spool and the older pick for its preset", async () => {
    seed("ok");
    store.settings = { ...store.settings, slotOverrides: { "Generic PLA @U1": { filamentId: 4 }, "Generic PETG (#12)": { filamentId: 13 } }, slotSpools: { "Snapmaker U1 (0.4 nozzle)#1": { filamentId: 1, spoolId: 9 }, "Other printer#1": { filamentId: 1, spoolId: 1 } } };
    await mount(PlateList);
    root.querySelector<HTMLButtonElement>(".chip")!.click(); await flush();
    root.querySelector<HTMLButtonElement>(".mrow .actions button")!.click(); await settle();
    expect(document.querySelector(".p-listbox-option[aria-selected='true'] [data-spool='9']")).not.toBeNull();
    document.querySelector<HTMLElement>(".p-listbox-option .opt")!.click(); await settle();
    expect(store.settings.slotSpools).toEqual({ "Other printer#1": { filamentId: 1, spoolId: 1 } });
    expect(store.settings.slotOverrides).toEqual({ "Generic PETG (#12)": { filamentId: 13 } });
  });
  test("a filament with no spool in use can be picked; a deleted picked spool is noted, then pruned on the next save", async () => {
    seed("ok");
    store.spoolman = { ...store.spoolman, data: { ...store.spoolman.data, filaments: [...store.spoolman.data.filaments, { id: 30, vendor: "Acme", name: "Bare PLA", material: "PLA", price: 50, weight: 1000, colorHex: "#E8E8E8" }] } };
    store.settings = { ...store.settings, slotSpools: { "Snapmaker U1 (0.4 nozzle)#2": { filamentId: 12, spoolId: 999 } } };
    await mount(PlateList);
    root.querySelector<HTMLButtonElement>(".chip")!.click(); await flush();
    expect(root.querySelectorAll(".mrow")[1]?.textContent).toContain("Spool #999 is archived or deleted in Spoolman");
    root.querySelector<HTMLButtonElement>(".mrow .actions button")!.click(); await settle();
    const bare = [...document.querySelectorAll<HTMLElement>(".p-listbox-option")].find((o) => o.textContent?.includes("Bare PLA"))!;
    bare.click(); await settle();
    expect(store.settings.slotSpools).toEqual({ "Snapmaker U1 (0.4 nozzle)#1": { filamentId: 30, preset: "Generic PLA @U1" } }); // #2's dead pick pruned
    expect(root.querySelector(".mrow")?.textContent).toContain("R$50.00/kg");
  });
  test("the older pick for the preset is the one highlighted in the picker", async () => {
    seed("ok");
    store.settings = { ...store.settings, slotOverrides: { "Generic PLA @U1": { filamentId: 4, spoolId: 4 } } };
    await mount(PlateList);
    root.querySelector<HTMLButtonElement>(".chip")!.click(); await flush();
    root.querySelector<HTMLButtonElement>(".mrow .actions button")!.click(); await settle();
    expect(document.querySelector(".p-listbox-option[aria-selected='true'] [data-spool='4']")).not.toBeNull();
  });
  test("no printer preset: the picker offers no spools, nothing is stored, the hint is hidden", async () => {
    seed("ok", false);
    store.host = { ...store.host, printerPreset: null };
    store.spoolman = { ...store.spoolman, state: "ok" };
    store.settings = { ...store.settings, slotOverrides: { "Generic PLA @U1": { filamentId: 4 } } };
    await mount(PlateList);
    root.querySelector<HTMLButtonElement>(".chip")!.click(); await flush();
    expect(root.querySelector(".mrow .hint")).toBeNull();
    root.querySelector<HTMLButtonElement>(".mrow .actions button")!.click(); await settle();
    expect(document.body.textContent).toContain("Select a printer preset to pick a spool per slot.");
    expect(document.querySelector("[role=listbox]")).toBeNull();
    const { setSlotSpool } = await import("../src/components/plates/slots");
    const m = { plateIndex: 0, slot: store.plates[0]!.slots[0]!, key: "", source: "preset", filamentId: null, spoolId: null, pricePerKg: 24, priceSource: "preset" } as const;
    setSlotSpool(m, { filamentId: 1, spoolId: 1 });
    expect(store.settings.slotSpools).toEqual({});
    expect(store.settings.slotOverrides).toEqual({ "Generic PLA @U1": { filamentId: 4 } }); // a refused pick is not an Auto
  });
  test("the preset-price hint shows only while Spoolman is connected", async () => {
    seed("ok", false);
    await mount(PlateList);
    root.querySelector<HTMLButtonElement>(".chip")!.click(); await flush();
    expect(root.querySelector(".mrow [data-priced-by]")?.textContent).toBe("Orca preset");
    expect(root.querySelector(".mrow .hint")).toBeNull();
    app?.unmount(); root.innerHTML = "";
    seed("ok");
    store.spooler = null;
    store.spoolman = { ...store.spoolman, data: { ...store.spoolman.data, filaments: [], spools: [] } };
    await mount(PlateList);
    root.querySelector<HTMLButtonElement>(".chip")!.click(); await flush();
    expect(root.querySelector(".mrow .hint")?.textContent).toContain("Pick a spool");
  });
  test("picker search filters and keyboard Enter picks the best spool", async () => {
    seed("ok");
    await mount(PlateList);
    root.querySelector<HTMLButtonElement>(".chip")!.click(); await flush();
    root.querySelector<HTMLButtonElement>(".mrow .actions button")!.click(); await settle();
    const input = document.querySelector<HTMLInputElement>("[role=dialog] input[type=text]")!;
    input.value = "polyterra"; input.dispatchEvent(new Event("input")); await settle();
    expect([...document.querySelectorAll<HTMLElement>(".p-listbox-option .opt")].map((o) => o.dataset.spool)).toEqual(["2", "10"]);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await settle();
    expect(Object.values(store.settings.slotSpools)[0]).toEqual({ filamentId: 2, spoolId: 2, preset: "Generic PLA @U1" });
  });
  test("spoolman unset: note replaces the list, typed price is stored per preset", async () => {
    seed("ok", false);
    await mount(PlateList);
    root.querySelector<HTMLButtonElement>(".chip")!.click(); await flush();
    root.querySelector<HTMLButtonElement>(".mrow .actions button")!.click(); await settle();
    expect(document.querySelector("[role=listbox]")).toBeNull();
    expect(document.body.textContent).toContain("Connect Spoolman to pick a spool.");
    const field = document.querySelector<HTMLInputElement>("[role=dialog] input")!;
    field.value = "27.50"; field.dispatchEvent(new Event("input")); await flush();
    expect(Object.values(store.settings.manualPrices)[0]).toBe(2750);
  });
});

describe("import", () => {
  test("checkFile: extension and size are checked before reading", () => {
    expect(checkFile({ name: "a.stl", size: 10 })).toContain(".gcode.3mf");
    expect(checkFile({ name: "A.3MF", size: 200 * 1024 * 1024 })).toContain("100 MB");
    expect(checkFile({ name: "A.3MF", size: 1000 })).toBeNull();
  });
  test("wrong file: toast, host never called, plates untouched", async () => {
    seed("ok");
    const before = store.plates;
    await importFile(new File(["x"], "model.stl"));
    expect(call).not.toHaveBeenCalled();
    expect(toasts.list[0]!.tone).toBe("error");
    expect(store.plates).toBe(before);
  });
  test.each([["not_zip", "Pick a sliced"], ["no_slice_info", "no slice data"], ["too_big", "100 MB"], ["boom", "Couldn't read"]])("host error %s maps to its message and leaves plates", async (code, text) => {
    seed("ok");
    const before = store.plates;
    vi.mocked(call).mockRejectedValue(new BridgeError(code));
    await importFile(new File(["PK"], "x.3mf"));
    await flush();
    expect(toasts.list[0]!.title).toContain(text);
    expect(store.plates).toBe(before);
    expect(importState.phase).toBe("idle");
  });
  test("zero plates in a valid file counts as notSliced", async () => {
    seed("ok");
    vi.mocked(call).mockResolvedValue({ plates: [] });
    await importFile(new File(["PK"], "x.3mf"));
    await flush();
    expect(toasts.list[0]!.title).toContain("no slice data");
    expect(store.plates).toHaveLength(3);
  });
  test("success sends name and base64 and replaces plates", async () => {
    seed("ok");
    const imported = buildScenario("imported").state.plates.slice(0, 1);
    vi.mocked(call).mockResolvedValue({ plates: imported });
    await importFile(new File(["PK"], "Part.GCODE.3MF"));
    await flush();
    expect(call).toHaveBeenCalledWith("import_sliced", { name: "Part.GCODE.3MF", b64: btoa("PK") });
    expect(store.plates).toHaveLength(1);
  });
  test("button is a native file input trigger with .3mf accept", async () => {
    seed("ok");
    await mount(ImportButton);
    expect(root.querySelector("input[type=file]")!.getAttribute("accept")).toBe(".3mf");
    expect(root.querySelector("button")!.textContent).toContain("Import sliced file");
  });
});
