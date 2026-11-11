// Host <-> UI contract: replays messages the REAL Python host produced (tests/contract/*.json, written by
// scripts/gen_contract.py and checked for drift by tests/test_contract.py) through the real bridge, in Orca's
// injected shape (onMessage registers; delivery through window.__orcaDispatch, as JSON text), into the real store.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { call, errorCode } from "../src/bridge";
import { failText } from "../src/hostError";
import { errorText, importFile, importState } from "../src/components/plates/importFlow";
import { spoolmanErrorMessage } from "../src/components/settings/spoolmanError";
import { setLocale, t } from "../src/i18n";
import { plates } from "../src/mock/fixtures";
import { createMockHost } from "../src/mock/host";
import { SCENARIO_NAMES } from "../src/mock/scenarios";
import { exportBlock, exportQuote } from "../src/quoteFlow";
import { saveQuote } from "../src/state/quotes";
import { EMPTY_BRAND } from "../src/state/sheet";
import * as S from "../src/state/store";
import { clearToasts, toasts } from "../src/state/toast";
import type { HostPlate, SavedQuote, Settings } from "../src/state/types";

type Msg = Record<string, unknown>;
type Step = { in: Msg; out: Msg[] };
// Vite inlines the JSON at test time (no node types needed); a copy per load() so a test cannot mutate another's input.
const FILES = import.meta.glob("../../tests/contract/**/*.json", { eager: true, import: "default" });
const file = (rel: string): unknown => {
  const v = FILES[`../../tests/contract/${rel}`];
  if (v === undefined) throw new Error(`missing tests/contract/${rel}: run python3 scripts/gen_contract.py`);
  return JSON.parse(JSON.stringify(v));
};
const load = (name: string): Step[] => file(`${name}.json`) as Step[];
const SCENARIOS = ["first_run", "saved_spooler", "slice_single", "slice_all", "slice_bambu", "spoolman", "import_sliced", "export_misc", "unreadable_quotes"] as const;
const inputSettings = (): Settings => file("inputs/settings.json") as Settings;
const inputQuotes = (): SavedQuote[] => file("inputs/quotes.json") as SavedQuote[];

// ---------------------------------------------------------------- structural validator (from state/types.ts)
type Check = (v: unknown, at: string, errs: string[]) => void;
const isObj = (v: unknown): v is Msg => typeof v === "object" && v !== null && !Array.isArray(v);
const str: Check = (v, at, e) => { if (typeof v !== "string") e.push(`${at}: string expected, got ${JSON.stringify(v)}`); };
const num: Check = (v, at, e) => { if (typeof v !== "number" || !Number.isFinite(v)) e.push(`${at}: finite number expected, got ${JSON.stringify(v)}`); };
const bool: Check = (v, at, e) => { if (typeof v !== "boolean") e.push(`${at}: boolean expected`); };
const nul = (c: Check): Check => (v, at, e) => { if (v !== null) c(v, at, e); };
const opt = (c: Check): Check => (v, at, e) => { if (v !== undefined) c(v, at, e); };
const oneOf = (...xs: unknown[]): Check => (v, at, e) => { if (!xs.includes(v)) e.push(`${at}: one of ${xs.join("|")} expected, got ${JSON.stringify(v)}`); };
const hex: Check = (v, at, e) => { if (typeof v !== "string" || !/^#[0-9A-F]{6}$/.test(v)) e.push(`${at}: #RRGGBB expected, got ${JSON.stringify(v)}`); };
const iso: Check = (v, at, e) => { if (typeof v !== "string" || Number.isNaN(Date.parse(v))) e.push(`${at}: ISO time expected`); };
const list = (c: Check): Check => (v, at, e) => { if (!Array.isArray(v)) e.push(`${at}: array expected`); else v.forEach((x, i) => c(x, `${at}[${i}]`, e)); };
const any: Check = () => undefined;
/** Exact object: every listed key present (unless opt) and no unlisted key. */
const obj = (shape: Record<string, Check>): Check => (v, at, e) => {
  if (!isObj(v)) { e.push(`${at}: object expected`); return; }
  for (const k of Object.keys(v)) if (!(k in shape)) e.push(`${at}.${k}: unexpected key`);
  for (const [k, c] of Object.entries(shape)) c(v[k], `${at}.${k}`, e);
};
const record = (c: Check): Check => (v, at, e) => { if (!isObj(v)) e.push(`${at}: object expected`); else for (const [k, x] of Object.entries(v)) c(x, `${at}.${k}`, e); };

const HostInfo = obj({ projectName: nul(str), printerModel: nul(str), printerVendor: nul(str), pluginVersion: str });
const HostSlot = obj({ n: num, preset: str, grams: nul(num), color: nul(hex), costPerKg: nul(num), notes: str, material: nul(str) });
const HostPlate = obj({
  index: num, name: nul(str), seconds: nul(num), stale: bool, thumb: nul(str), slicedAt: nul(iso),
  source: oneOf("slice", "file"), fileName: nul(str), slots: list(HostSlot),
});
const SpoolerInfo = nul(obj({ url: nul(str), presetToFilament: record(num) }));
const SpoolmanData = obj({
  currency: nul(str),
  filaments: list(obj({ id: num, name: str, vendor: nul(str), material: nul(str), price: nul(num), weight: nul(num), colorHex: nul(hex) })),
  spools: list(obj({ id: num, filamentId: num, price: nul(num), initialWeight: nul(num), remainingWeight: opt(nul(num)), archived: bool, lastUsed: nul(iso) })),
});
// settings/quotes are written by the UI and handed back unchanged: object / array, contents owned by the UI.
const HostState = obj({ host: HostInfo, plates: list(HostPlate), settings: nul(record(any)), quotes: nul(list(any)), spooler: SpoolerInfo, unreadable: opt(list(str)) });
const DATA: Record<string, Check> = {
  get_state: HostState, save_settings: obj({}), save_quotes: obj({}), spoolman_fetch: SpoolmanData,
  import_sliced: obj({ plates: list(HostPlate) }), export_file: obj({ path: str }),
};
const EVENTS: Record<string, Check> = {
  plates: obj({ plates: list(HostPlate), deleted: opt(num) }),
  host: obj({ kind: oneOf("PresetSelected", "ProjectOpened", "NewProject", "ProjectClosed"), host: HostInfo }),
};

function validate(msg: Msg, cmd: string | undefined): string[] {
  const e: string[] = [];
  if (msg.type === "res") {
    num(msg.id, "id", e);
    if (msg.ok === true) {
      obj({ type: any, id: any, ok: any, data: any })(msg, "res", e);
      const c = cmd ? DATA[cmd] : undefined;
      if (c) c(msg.data, `res(${cmd}).data`, e);
      else e.push(`res for unknown cmd ${cmd} was ok`);
    } else {
      obj({ type: any, id: any, ok: oneOf(false), error: str, detail: opt(str) })(msg, "res", e);
      if (typeof msg.error === "string" && !/^[a-z][a-z0-9_]*$/.test(msg.error)) e.push(`error is not a code: ${msg.error}`);
    }
  } else if (msg.type === "event") {
    obj({ type: any, name: str, data: any })(msg, "event", e);
    const c = EVENTS[msg.name as string];
    if (c) c(msg.data, `event(${String(msg.name)}).data`, e);
    else e.push(`event ${String(msg.name)} has no listener in the store`);
  } else e.push(`unknown message type ${String(msg.type)}`);
  return e;
}

// ---------------------------------------------------------------- Orca's injected bridge, replaying the host
type Replay = { sent: Msg[]; unanswered: Msg[] };
function installReplay(...scenarios: Step[][]): Replay {
  const handlers: ((m: unknown) => void)[] = [];
  const deliver = (m: unknown): void => handlers.forEach((h) => h(m));
  (window as unknown as { __orcaDispatch: typeof deliver }).__orcaDispatch = deliver;
  const queue = scenarios.flat().filter((s) => s.in.type === "cmd");
  const r: Replay = { sent: [], unanswered: [] };
  window.orca = {
    onMessage: (cb) => { handlers.push(cb); },
    postMessage: (raw) => {
      const m = raw as Msg;
      r.sent.push(m);
      if (m.type !== "cmd") return;
      const i = queue.findIndex((s) => s.in.cmd === m.cmd);
      if (i < 0) { r.unanswered.push(m); return; }
      const [step] = queue.splice(i, 1);
      step!.out.forEach((o) => queueMicrotask(() => deliver(JSON.stringify(o.type === "res" ? { ...o, id: m.id } : o))));
    },
  };
  return r;
}
const last = <T>(xs: T[]): T => xs[xs.length - 1]!;
const lifecycleIndex = (steps: Step[], name: string, nth = 0): number => steps.map((s, i) => [s, i] as const).filter(([s]) => s.in.lifecycle === name)[nth]![1];
const settle = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); await vi.advanceTimersByTimeAsync(10); };

let stop: (() => void) | null = null;
async function boot(...scenarios: Step[][]): Promise<Replay> {
  const r = installReplay(...scenarios);
  stop = S.init();
  await settle();
  return r;
}
beforeEach(() => { vi.useFakeTimers(); clearToasts(); setLocale("en"); });
afterEach(() => { stop?.(); stop = null; delete window.orca; vi.useRealTimers(); });

// ---------------------------------------------------------------- tests
describe("every host message has the shape the UI types declare", () => {
  test.each(SCENARIOS)("%s", (name) => {
    const errs: string[] = [];
    for (const step of load(name)) for (const m of step.out) errs.push(...validate(m, step.in.cmd as string | undefined));
    expect(errs).toEqual([]);
  });
  test("the validator is not a rubber stamp", () => {
    expect(validate({ type: "event", name: "state", data: {} }, undefined)).not.toEqual([]);
    expect(validate({ type: "res", id: 1, ok: false, error: { code: "x" } }, "get_state")).not.toEqual([]);
    const plate = last(load("slice_single")).out[0]!;
    const bad = JSON.parse(JSON.stringify(plate).replace('"grams":1.12', '"grams":"1.12"')) as Msg;
    expect(validate(bad, undefined).join()).toMatch(/grams: finite number/);
  });
  test("the dev mock host answers with the same shapes in every scenario", async () => {
    for (const name of SCENARIO_NAMES) {
      if (name === "loading") continue;
      delete window.orca;
      const host = createMockHost(name);
      const got: Msg[] = [];
      host.onMessage((m) => got.push(m as Msg));
      for (const [id, cmd, args] of [[1, "get_state", {}], [2, "spoolman_fetch", { url: "http://h" }], [3, "export_file", { name: "quote-0001.csv", text: "a" }], [4, "import_sliced", { name: "a.gcode.3mf", b64: "UEs=" }]] as const) {
        host.postMessage({ type: "cmd", id, cmd, args });
        await vi.advanceTimersByTimeAsync(1000);
        const res = got.find((m) => m.id === id)!;
        expect(validate(res, cmd), `${name} ${cmd}`).toEqual([]);
      }
    }
  });
});

describe("boot through get_state", () => {
  test("first run: no settings, no quotes, no Spooler; ready is sent and nothing is left unanswered", async () => {
    const r = await boot(load("first_run"));
    expect(r.sent[0]).toEqual({ type: "ready" });
    expect(load("first_run")[0]!.out).toEqual([]); // the host answers ready with nothing: get_state is the one load path
    expect(S.store.status).toBe("ready");
    expect(S.store.settings.onboarded).toBe(false);
    expect(S.store.quotes).toEqual([]);
    expect(S.store.spooler).toBeNull();
    expect(S.store.host).toEqual({ projectName: "Desk organizer", printerModel: "Snapmaker U1", printerVendor: "Snapmaker", pluginVersion: "0.0.0-dev" });
    expect(r.unanswered).toEqual([]); // no Spoolman URL yet: no fetch
  });
  test("saved settings + quotes + Spooler round-trip; Spoolman data loads", async () => {
    const r = await boot(load("saved_spooler"), load("spoolman"));
    expect(S.store.status).toBe("ready");
    expect(S.store.settings).toEqual({ ...inputSettings(), ...S.store.settings, channels: inputSettings().channels, defaults: inputSettings().defaults });
    expect(S.store.settings.sheet).toEqual({ ...EMPTY_BRAND, ...inputSettings().sheet }); // an older file without brand fields gets the empty brand
    expect(S.store.quotes).toEqual(inputQuotes());
    expect(S.store.spooler).toEqual({ url: "http://192.168.1.10:7912", presetToFilament: { "Generic PLA @U1": 3, "Generic PETG (#12)": 12 } });
    expect(r.sent.filter((m) => m.type === "cmd").map((m) => m.cmd)).toEqual(["get_state", "spoolman_fetch"]);
    expect(S.store.spoolman.state).toBe("ok");
    expect(S.currency.value).toBe("BRL");
    expect(S.store.spoolman.data.spools.map((s) => s.id)).toEqual([1, 2, 3]); // malformed row dropped by the host
    expect(S.store.spoolman.data.spools[0]!.remainingWeight).toBe(412.5);
  });
  test("Spoolman match uses the spool price over the filament price and skips the archived spool", async () => {
    await boot(load("saved_spooler"), load("spoolman"));
    const plate = { ...(last(load("slice_single")).out[0]!.data as { plates: HostPlate[] }).plates[0]!, slots: [{ n: 1, preset: "Generic PLA @U1", grams: 10, color: null, costPerKg: 24, notes: "", material: "PLA" }] };
    S.setPlates([plate]);
    const m = S.slotMatches.value[0]![0]!;
    expect([m.source, m.filamentId, m.spoolId, m.pricePerKg, m.priceSource]).toEqual(["spooler", 3, 1, 95, "spool"]);
  });
  test("save_settings sends what get_state later returns", async () => {
    const r = await boot(load("saved_spooler"));
    S.setLanguage("en");
    await vi.advanceTimersByTimeAsync(700);
    const save = r.sent.find((m) => m.cmd === "save_settings")!;
    expect(Object.keys(save.args as Msg)).toEqual(["settings"]);
    expect(load("saved_spooler")[2]!.out[0]).toMatchObject({ ok: true, data: {} });
    expect(S.store.saveStatus).toBe("saved");
  });
  test("a host failure on get_state shows the error screen with the code", async () => {
    await boot(load("export_misc").filter((s) => s.in.cmd === "get_state")); // handler raised -> host_error
    expect(S.store.status).toBe("error");
    expect(S.store.error).toBe("host_error");
  });
});

describe("plates from real slices", () => {
  const platesOf = (): { seconds: number | null; grams: (number | null)[] }[] => S.store.plates.map((p) => ({ seconds: p.seconds, grams: p.slots.map((s) => s.grams) }));
  test("single slice: the Snapmaker U1 fixture's time and grams reach the store and price", async () => {
    const steps = load("slice_single");
    await boot(steps);
    steps.slice(1).forEach((_, i) => installedEmit(steps, i + 1));
    expect(platesOf()).toEqual([{ seconds: 607, grams: [1.12, 0.92, 1.05] }]);
    expect(S.store.plates[0]!.slots.map((s) => [s.costPerKg, s.color])).toEqual([[83.1, "#FFFFFF"], [83.1, "#000000"], [83.1, "#0000FF"]]);
    const res = S.result.value;
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.printSeconds).toBe(607);
    expect(res.materials.reduce((a, m) => a + m.gramsMg, 0)).toBe(3090);
    const sel = S.selected.value!;
    expect(sel.ok).toBe(true);
    if (!sel.ok) return;
    // 3.09 g at 83.10 /kg = 0.26 of material; with the first-run defaults the price must be finite, positive, small.
    expect(Number.isFinite(sel.price)).toBe(true);
    expect(sel.price).toBeGreaterThan(0);
    expect(sel.price).toBeLessThan(100_00);
  });
  test("slice all (3 plates), stale, re-slice, delete, preset change, project open", async () => {
    const steps = load("slice_all");
    await boot(steps);
    const jobs = steps.map((s, i) => [s, i] as const).filter(([s]) => s.in.lifecycle === "SlicingJobComplete").map(([, i]) => i);
    for (const i of jobs.slice(0, 3)) installedEmit(steps, i);
    expect(platesOf()).toEqual([
      { seconds: 607, grams: [1.12, 0.92, 1.05] },
      { seconds: 18315, grams: [53.08, 19.05, 36.98, 0.5] },
      { seconds: 607, grams: [1.12, 0.92, 1.05] },
    ]);
    expect(S.store.plates.map((p) => [p.index, p.source, p.slicedAt, p.stale])).toEqual([[0, "slice", "2026-11-10T12:00:00Z", false], [1, "slice", "2026-11-10T12:00:00Z", false], [2, "slice", "2026-11-10T12:00:00Z", false]]);
    const res = S.result.value;
    expect(res.ok && res.printSeconds).toBe(607 + 18315 + 607);
    expect(res.ok && res.materials.reduce((a, m) => a + m.gramsMg, 0)).toBe(3090 + 109610 + 3090);
    expect(S.selected.value?.ok && Number.isFinite(S.selected.value.price) && S.selected.value.price > 0).toBe(true);

    installedEmit(steps, lifecycleIndex(steps, "ObjectTransformed"));
    expect(S.store.plates.map((p) => p.stale)).toEqual([true, true, true]);
    expect(steps[lifecycleIndex(steps, "ObjectChanged")]!.out).toEqual([]); // already stale: the host stays quiet
    installedEmit(steps, jobs[3]!);
    expect(S.store.plates.map((p) => p.stale)).toEqual([true, false, true]);
    installedEmit(steps, lifecycleIndex(steps, "PlateDeleted"));
    expect(S.store.plates.map((p) => [p.index, p.seconds])).toEqual([[0, 607], [1, 607]]);
    S.setPlateControl(1, { copies: 2 });
    installedEmit(steps, lifecycleIndex(steps, "PresetSelected"));
    expect(S.store.host.printerModel).toBe("Bambu Lab X1 Carbon");
    expect(S.store.plates).toHaveLength(2); // a printer switch alone keeps the plates (they are marked stale)
    installedEmit(steps, lifecycleIndex(steps, "ProjectOpened"));
    expect(S.store.plates).toEqual([]);
    expect(S.store.host.projectName).toBe("Gridfinity bins");
    expect(S.store.draft.plates).toEqual({});
  });
  test("Bambu (synthetic) plate, and a plate whose time and grams are unknown: null, never 0", async () => {
    const steps = load("slice_bambu");
    await boot(steps);
    steps.forEach((s, i) => { if (s.in.lifecycle === "SlicingJobComplete") installedEmit(steps, i); });
    expect(S.store.host.printerModel).toBe("Bambu Lab X1 Carbon");
    expect(platesOf()).toEqual([{ seconds: 4180, grams: [14.92, 3.67] }, { seconds: null, grams: [null] }]);
    expect(S.store.plates[0]!.slots.map((s) => s.preset)).toEqual(["Bambu PLA Basic @BBL X1C", "Generic PETG; special @BBL X1C"]);
    // NotCounted.plate is the 1-based plate number the user sees (index 1 -> "Plate 2")
    expect(S.notCounted.value).toEqual(expect.arrayContaining([{ kind: "time", plate: 2 }, { kind: "grams", plate: 2, slot: 1 }]));
    expect(exportBlock()).toBe("quote.blockedUnknown"); // an unknown is never priced as 0 and exported
  });
});

// The test above emits through window.__orcaDispatch exactly like Orca would after a lifecycle event.
function installedEmit(steps: Step[], i: number): void {
  steps[i]!.out.forEach((o) => (window as unknown as { __orcaDispatch: (m: unknown) => void }).__orcaDispatch(JSON.stringify(o)));
}

describe("every host error code has copy in en and pt-BR", () => {
  const errors = (name: string): string[] => load(name).flatMap((s) => s.out.filter((o) => o.ok === false).map((o) => o.error as string));
  const looksRaw = (s: string): boolean => /^[a-z]+(\.[A-Za-z_]+)+$/.test(s) || s.includes("[object") || s.includes("undefined") || s.trim() === "";
  for (const lang of ["en", "pt-BR"] as const) {
    test(`${lang}: import codes`, () => {
      setLocale(lang);
      const codes = errors("import_sliced");
      expect(codes.sort()).toEqual(["bad_b64", "bad_xml", "no_slice_info", "not_zip", "too_big", "too_large"]);
      for (const c of codes) {
        const text = errorText(c, 123_456_789);
        expect(looksRaw(text), `${c}: ${text}`).toBe(false);
        expect(text).not.toContain(c);
      }
      expect(errorText("not_zip", 1)).toBe(t("import.error.notThreeMf"));
      expect(errorText("no_slice_info", 1)).toBe(t("import.error.notSliced"));
    });
    test(`${lang}: Spoolman codes`, () => {
      setLocale(lang);
      const codes = errors("spoolman");
      expect(codes.sort()).toEqual(["bad_url", "denied", "http_503", "redirected", "timeout", "too_large", "unreachable"]);
      for (const c of codes) {
        const text = spoolmanErrorMessage(c);
        expect(looksRaw(text), `${c}: ${text}`).toBe(false);
        expect(text, c).not.toMatch(/^Spoolman failed|^Falha/); // every code the host sends has its own sentence
      }
      expect(spoolmanErrorMessage("http_503")).toContain("503");
    });
    test(`${lang}: other commands fail with a generic, translated toast`, () => {
      setLocale(lang);
      expect(errors("export_misc").sort()).toEqual(["bad_args", "bad_name", "host_error", "too_large", "unknown_command"]);
      for (const text of [t("export.failed"), t("host.cmdFailed", { action: t("settings.title") }), t("host.errorTitle")]) expect(looksRaw(text), text).toBe(false);
      for (const c of ["bad_name", "io", "too_large"]) expect(failText("x", c), c).not.toBe("x"); // actionable codes add their own sentence
    });
  }
});

describe("an unreadable quotes file (real host answers)", () => {
  test("get_state names it, the page shows no quotes and keeps the settings, and saving says why it cannot", async () => {
    const steps = load("unreadable_quotes");
    await boot(steps);
    expect(S.store.status).toBe("ready");
    expect(S.store.unreadable).toEqual(["quotes"]);
    expect(S.store.quotes).toEqual([]);
    expect(S.store.settings.channels.map((c) => c.id)).toContain("store"); // the readable file is used as is
    S.setPlates(plates());
    S.resetDraft();
    const saved = saveQuote();
    await settle();
    expect(await saved).toBeNull();
    expect(toasts.list[toasts.list.length - 1]!.text).toMatch(/can't be read|not being saved/i);
  });
});

describe("import and export flows with real host answers", () => {
  const fileOf = (name: string): File => new File([new Uint8Array([0x50, 0x4b, 3, 4])], name);
  const runImport = async (f: File): Promise<void> => { const p = importFile(f); await vi.advanceTimersByTimeAsync(50); await settle(); await p; };
  test("import success replaces plates with file plates; a later live slice waits as pending", async () => {
    const live = load("slice_single");
    const r = await boot(live, load("import_sliced"));
    installedEmit(live, live.length - 1);
    await runImport(fileOf("desk.gcode.3mf"));
    const sent = r.sent.find((m) => m.cmd === "import_sliced")!;
    expect(sent.args).toEqual({ name: "desk.gcode.3mf", b64: "UEsDBA==" });
    expect(importState.phase).toBe("idle");
    expect(S.store.plates.map((p) => [p.index, p.source, p.fileName, p.seconds, p.slicedAt])).toEqual([[0, "file", "desk.gcode.3mf", 4180, null], [1, "file", "desk.gcode.3mf", 600, null]]);
    expect(S.store.plates[0]!.slots[0]).toEqual({ n: 1, preset: "Bambu PLA Basic @BBL X1C", grams: 14.92, color: "#FF0000", costPerKg: 25.5, notes: "Spoolman filament 7", material: "PLA" });
    expect(S.plateOrigin.value).toBe("import");
    installedEmit(live, live.length - 1);
    expect(S.store.pendingPlates).toHaveLength(1);
    expect(S.store.plates[0]!.source).toBe("file");
  });
  test("each import error leaves plates untouched and toasts its message", async () => {
    const steps = load("import_sliced");
    await boot(steps.slice(1)); // skip the success answer
    const before = S.store.plates;
    for (const step of steps.slice(1)) {
      clearToasts();
      await runImport(fileOf("x.gcode.3mf"));
      expect(toasts.list[0]?.tone).toBe("bad");
      expect(toasts.list[0]!.text).toBe(errorText(step.out[0]!.error as string, 4));
      expect(S.store.plates).toBe(before);
    }
  });
  test("export: a saved quote goes out as export_file {name, text}; the host path is shown; bad_name fails cleanly", async () => {
    const misc = load("export_misc"); // save_quotes {} -> export_file {path} -> export_file bad_name
    const r = await boot(load("saved_spooler"), misc);
    const live = load("slice_single");
    installedEmit(live, live.length - 1);
    S.patchDraft({ title: "Desk organizer", customer: "Ana Souza" });
    const saving = saveQuote();
    await settle();
    const rec = await saving;
    expect(r.sent.filter((m) => m.cmd === "save_quotes").map((m) => Object.keys(m.args as Msg))).toEqual([["quotes"]]);
    expect(rec).not.toBeNull();
    clearToasts();
    const p = exportQuote("csv", rec);
    await settle();
    await p;
    const sent = last(r.sent.filter((m) => m.cmd === "export_file"));
    expect(Object.keys(sent.args as Msg).sort()).toEqual(["name", "text"]);
    expect((sent.args as { name: string }).name).toMatch(/^quote-\d{4}\.csv$/);
    expect(toasts.list[0]!.text).toBe(t("export.saved", { path: "/orca-data/orca_plugins/plugin_data/orca_print_calculator/exports/quote-0042.csv" }));
    clearToasts();
    const q = exportQuote("csv", rec);
    await settle();
    await q;
    expect(toasts.list[0]).toMatchObject({ text: failText(t("export.failed"), "bad_name"), tone: "bad" }); // the host's bad_name gets its own sentence
  });
});

test("bridge errors keep the host code", async () => {
  installReplay(load("export_misc").filter((s) => s.in.cmd === "nope"));
  await expect(call("nope" as never, {} as never)).rejects.toSatisfy((e: unknown) => errorCode(e) === "unknown_command");
});
