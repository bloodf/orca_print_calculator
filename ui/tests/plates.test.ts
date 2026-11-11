import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn() }));
import { call, BridgeError } from "../src/bridge";
import { newDraft } from "../src/state/defaults";
import { store } from "../src/state/store";
import { clearToasts, toasts } from "../src/state/toast";
import { setLocale } from "../src/i18n";
import { buildScenario, type ScenarioName } from "../src/mock/scenarios";
import { spoolman } from "../src/mock/fixtures";
import PlateList from "../src/components/plates/PlateList.vue";
import ImportButton from "../src/components/plates/ImportButton.vue";
import { importFile, importState, checkFile } from "../src/components/plates/importFlow";

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
  test("ok: one card per plate with name, chips, cost, copies and no amber class", async () => {
    seed("ok");
    await mount(PlateList);
    const cards = root.querySelectorAll("article");
    expect(cards).toHaveLength(3);
    expect(cards[0]!.textContent).toContain("Plate 1");
    expect(cards[2]!.textContent).toContain("Plate 3");
    expect(cards[0]!.querySelectorAll(".chip")).toHaveLength(2);
    expect(cards[0]!.querySelector(".cost")!.textContent).toMatch(/\d/);
    expect(cards[0]!.querySelector("[aria-label='Copies of plate 1']")).not.toBeNull();
    expect(root.textContent).toContain("Desk organizer");
    expect(root.textContent).toContain("3 plates");
    expect(root.querySelector(".stale, [class*=amber]")).toBeNull();
    expect(root.textContent).not.toContain("May be out of date");
  });
  test("stale: badge on every card and a project-wide alert", async () => {
    seed("stale");
    await mount(PlateList);
    expect(root.textContent!.match(/May be out of date/g)).toHaveLength(3);
    expect(root.querySelector("[role=status]")?.textContent).toContain("Plates may be out of date");
  });
  test("unknown: time and grams render as em dash with sr text, never 0", async () => {
    seed("unknown");
    await mount(PlateList);
    const meta = root.querySelector(".meta")!;
    expect(meta.textContent).toContain("—");
    expect(meta.querySelector(".sr-only")?.textContent).toBe("unknown");
    expect(meta.textContent).not.toMatch(/\b0 ?(g|s|m)\b/);
  });
  test("imported: shows from-file provenance and the info alert", async () => {
    seed("imported");
    await mount(PlateList);
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
    root.querySelector<HTMLButtonElement>("article [aria-label='Increase Copies of plate 1']")!.click();
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
  test("picking a spool stores an override; reset removes it and the typed price", async () => {
    seed("ok");
    await mount(PlateList);
    root.querySelector<HTMLButtonElement>(".chip")!.click(); await flush();
    root.querySelector<HTMLButtonElement>(".mrow .actions .btn")!.click(); await flush();
    const opts = document.querySelectorAll<HTMLElement>("[role=option]");
    expect(opts.length).toBeGreaterThan(3);
    const spool = Array.from(opts).find((o) => o.classList.contains("spool"))!;
    spool.click(); await flush();
    expect(Object.keys(store.settings.slotOverrides)).toHaveLength(1);
    const reset = root.querySelector<HTMLButtonElement>(".mrow .actions .btn.icon")!;
    expect(reset).not.toBeNull();
    reset.click(); await flush();
    expect(store.settings.slotOverrides).toEqual({});
  });
  test("picker search filters and keyboard Enter picks a filament", async () => {
    seed("ok");
    await mount(PlateList);
    root.querySelector<HTMLButtonElement>(".chip")!.click(); await flush();
    root.querySelector<HTMLButtonElement>(".mrow .actions .btn")!.click(); await flush();
    const input = document.querySelector<HTMLInputElement>("[role=combobox]")!;
    input.value = "polyterra"; input.dispatchEvent(new Event("input")); await flush();
    expect(document.querySelectorAll("[role=option]:not(.spool)")).toHaveLength(1);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await flush();
    expect(Object.values(store.settings.slotOverrides)[0]).toEqual({ filamentId: 2 });
  });
  test("spoolman unset: note replaces the list, typed price is stored per preset", async () => {
    seed("ok", false);
    await mount(PlateList);
    root.querySelector<HTMLButtonElement>(".chip")!.click(); await flush();
    root.querySelector<HTMLButtonElement>(".mrow .actions .btn")!.click(); await flush();
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
    expect(toasts.list[0]!.tone).toBe("bad");
    expect(store.plates).toBe(before);
  });
  test.each([["not_zip", "Pick a sliced"], ["no_slice_info", "no slice data"], ["too_big", "100 MB"], ["boom", "Couldn't read"]])("host error %s maps to its message and leaves plates", async (code, text) => {
    seed("ok");
    const before = store.plates;
    vi.mocked(call).mockRejectedValue(new BridgeError(code));
    await importFile(new File(["PK"], "x.3mf"));
    await flush();
    expect(toasts.list[0]!.text).toContain(text);
    expect(store.plates).toBe(before);
    expect(importState.phase).toBe("idle");
  });
  test("zero plates in a valid file counts as notSliced", async () => {
    seed("ok");
    vi.mocked(call).mockResolvedValue({ plates: [] });
    await importFile(new File(["PK"], "x.3mf"));
    await flush();
    expect(toasts.list[0]!.text).toContain("no slice data");
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
