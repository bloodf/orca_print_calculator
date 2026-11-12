import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BridgeError, call, errorCode, on, ready } from "../src/bridge";
import { createMockHost } from "../src/mock/host";
import { SCENARIO_NAMES, buildScenario, isScenario } from "../src/mock/scenarios";
import { deriveQuote } from "../src/state/derive";
import { newDraft, mergeSettings, defaultSettings } from "../src/state/defaults";
import { spoolman } from "../src/mock/fixtures";
// host -> page delivery in the real injected shape (window.__orcaDispatch calls every registered callback)
const dispatchToPage = (m: unknown): void => (window as unknown as { __orcaDispatch: (x: unknown) => void }).__orcaDispatch(m);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { delete window.orca; vi.useRealTimers(); });
const use = (name: (typeof SCENARIO_NAMES)[number]) => { window.orca = createMockHost(name); };
const run = async <T>(p: Promise<T>, ms = 1000): Promise<T> => { const out = p.then((v) => ({ v }), (e: unknown) => ({ e })); await vi.advanceTimersByTimeAsync(ms); const r = await out; if ("e" in r) throw r.e; return r.v; };

describe("mock host: every ?state= is defined", () => {
  test("names", () => {
    expect([...SCENARIO_NAMES]).toEqual(["ok", "loading", "hostError", "empty", "stale", "noSpoolman", "offline", "unmatched", "impossible", "savedQuote", "firstRun", "narrow", "unknown", "imported", "legacyQuote"]);
    expect(isScenario("unknown")).toBe(true);
    expect(isScenario("nope")).toBe(false);
  });
  test.each(SCENARIO_NAMES.filter((n) => n !== "loading" && n !== "hostError"))("%s: get_state round-trips and prices without throwing", async (name) => {
    use(name);
    const s = await run(call("get_state", {}));
    expect(Array.isArray(s.plates)).toBe(true);
    const settings = mergeSettings(s.settings, defaultSettings(null, "Direct"));
    const d = deriveQuote({ settings, draft: newDraft(settings), plates: s.plates, host: s.host, spoolman: spoolman(), spooler: s.spooler, currency: "BRL" });
    if (name === "empty") expect(d.result.ok).toBe(false);
    else expect(d.result.ok).toBe(true);
  });
  test("scenario specifics", () => {
    expect(buildScenario("stale").state.plates.every((p) => p.stale)).toBe(true);
    expect(buildScenario("imported").state.plates.every((p) => p.source === "file" && p.fileName && p.slicedAt === null)).toBe(true);
    const u = buildScenario("unknown").state.plates;
    expect(u).toHaveLength(1);
    expect(u[0]!.seconds).toBeNull();
    expect(u[0]!.slots.some((s) => s.grams === null)).toBe(true);
    expect(buildScenario("firstRun").state.settings).toBeNull();
    expect(buildScenario("empty").state.host.projectName).toBeNull();
    expect(buildScenario("ok").state.quotes?.length).toBe(2);
  });
});

describe("mock host: commands", () => {
  test("loading never answers; the bridge times get_state out at 10 s", async () => {
    use("loading");
    await expect(run(call("get_state", {}), 10_001)).rejects.toMatchObject({ code: "timeout" });
  });
  test("hostError rejects with a code, not prose", async () => {
    use("hostError");
    const e = await run(call("get_state", {})).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(BridgeError);
    expect(errorCode(e)).toBe("host_error");
  });
  test("save_settings and save_quotes persist in memory for the next get_state", async () => {
    use("ok");
    const s = await run(call("get_state", {}));
    await run(call("save_settings", { settings: { ...s.settings!, onboarded: false } }));
    await run(call("save_quotes", { quotes: [] }));
    const again = await run(call("get_state", {}));
    expect(again.settings?.onboarded).toBe(false);
    expect(again.quotes).toEqual([]);
  });
  test("spoolman_fetch: data, or unreachable when offline", async () => {
    use("ok");
    const data = await run(call("spoolman_fetch", { url: "http://x" }));
    expect(data.currency).toBe("BRL");
    expect(data.spools.length).toBe(14);
    use("offline");
    await expect(run(call("spoolman_fetch", { url: "http://x" }))).rejects.toMatchObject({ code: "unreachable" });
  });
  test("import_sliced: file name picks the result", async () => {
    use("ok");
    await expect(run(call("import_sliced", { name: "plain.3mf", b64: "AA==" }))).rejects.toMatchObject({ code: "no_slice_info" });
    await expect(run(call("import_sliced", { name: "x.zip", b64: "AA==" }))).rejects.toMatchObject({ code: "not_zip" });
    const r = await run(call("import_sliced", { name: "bracket.gcode.3mf", b64: "AA==" }));
    expect(r.plates).toHaveLength(3);
    expect(r.plates[0]).toMatchObject({ source: "file", fileName: "bracket.gcode.3mf", slicedAt: null });
  });
  test("export_file returns a path; unknown commands fail with a code", async () => {
    use("ok");
    expect(await run(call("export_file", { name: "quote-0042.csv", text: "a" }))).toEqual({ path: "/mock/exports/quote-0042.csv" });
    await expect(run(call("nope" as never, {} as never))).rejects.toMatchObject({ code: "unknown_command" });
  });
  test("no host at all rejects with no_host", async () => {
    await expect(call("get_state", {})).rejects.toMatchObject({ code: "no_host" });
  });
  test("events reach listeners; unsubscribe stops them", () => {
    use("ok");
    ready();
    const got: unknown[] = [];
    const off = on("plates", (d) => got.push(d));
    dispatchToPage({ type: "event", name: "plates", data: 1 });
    off();
    dispatchToPage({ type: "event", name: "plates", data: 2 });
    expect(got).toEqual([1]);
  });
  test("string frames are parsed, garbage ignored", () => {
    use("ok");
    ready();
    const got: unknown[] = [];
    on("x", (d) => got.push(d));
    dispatchToPage(JSON.stringify({ type: "event", name: "x", data: "s" }));
    dispatchToPage("{not json");
    expect(got).toEqual(["s"]);
  });
});
