// T5.3 review fixes. Each test was run red before its fix (see the T4.10 report for the per-item log).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BridgeError, call } from "../src/bridge";
import { setLocale } from "../src/i18n";
import { createMockHost } from "../src/mock/host";
import { savedQuotes, settings as fxSettings, spoolman as fxSpoolman } from "../src/mock/fixtures";
import { duplicateQuote, openQuote, saveQuote, useCurrentSlice } from "../src/state/quotes";
import * as S from "../src/state/store";
import { clearToasts } from "../src/state/toast";
import type { HostPlate } from "../src/state/types";

type Sent = { cmd: string; args: Record<string, unknown> };
const sent: Sent[] = [];
const dispatch = (m: unknown) => (window as unknown as { __orcaDispatch: (x: unknown) => void }).__orcaDispatch(m);
const setVisibility = (v: "hidden" | "visible") => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
const saves = (cmd: string) => sent.filter((s) => s.cmd === cmd);

function boot(name: Parameters<typeof createMockHost>[0]): () => void {
  const host = createMockHost(name);
  const post = host.postMessage.bind(host);
  host.postMessage = (m: unknown) => { const x = m as { type: string; cmd: string; args: Record<string, unknown> }; if (x.type === "cmd") sent.push({ cmd: x.cmd, args: x.args }); post(m); };
  window.orca = host;
  return S.init();
}
let stop: (() => void) | null = null;
beforeEach(() => { vi.useFakeTimers(); sent.length = 0; setLocale("en"); clearToasts(); });
afterEach(() => { stop?.(); stop = null; setVisibility("visible"); delete window.orca; vi.useRealTimers(); });

describe("CRITICAL: settings are never saved before a successful get_state", () => {
  test("page hidden after get_state failed sends no save_settings", async () => {
    stop = boot("hostError");
    await vi.advanceTimersByTimeAsync(700);
    expect(S.store.status).toBe("error");
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(100);
    expect(saves("save_settings")).toHaveLength(0);
  });
  test("page hidden while get_state is still loading sends no save_settings", async () => {
    stop = boot("loading");
    await vi.advanceTimersByTimeAsync(100);
    expect(S.store.status).toBe("loading");
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(100);
    expect(saves("save_settings")).toHaveLength(0);
  });
  test("flushSettings itself refuses outside the ready state, and save_quotes too", async () => {
    stop = boot("hostError");
    await vi.advanceTimersByTimeAsync(700);
    await S.flushSettings();
    S.patchSettings({ language: "en" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(saves("save_settings")).toHaveLength(0);
    expect(saves("save_quotes")).toHaveLength(0);
  });
  test("when ready, hidden saves a pending edit exactly once and nothing when nothing is pending", async () => {
    stop = boot("ok");
    await vi.advanceTimersByTimeAsync(700);
    expect(S.store.status).toBe("ready");
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(100);
    expect(saves("save_settings")).toHaveLength(0);
    S.patchSettings({ language: "pt-BR" });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(100);
    expect(saves("save_settings")).toHaveLength(1);
  });
});

describe("MEDIUM: Spoolman fetch replies are matched to their request", () => {
  test("a slow failing reply for an old URL is dropped", async () => {
    const handlers: ((m: unknown) => void)[] = [];
    (window as unknown as { __orcaDispatch: (m: unknown) => void }).__orcaDispatch = (m) => handlers.forEach((h) => h(m));
    const later = (p: unknown, ms: number) => setTimeout(() => dispatch(p), ms);
    window.orca = {
      onMessage: (cb) => { handlers.push(cb); },
      postMessage: (m) => {
        const x = m as { type: string; id: number; cmd: string; args: { url: string } };
        if (x.type !== "cmd") return;
        if (x.cmd === "get_state") return void later({ type: "res", id: x.id, ok: true, data: { host: { projectName: null, printerModel: null, printerVendor: null, pluginVersion: "x" }, plates: [], settings: fxSettings({ spoolman: { url: "" } }), quotes: [], spooler: null } }, 10);
        if (x.cmd === "spoolman_fetch") return void (x.args.url.includes("bad") ? later({ type: "res", id: x.id, ok: false, error: "timeout" }, 15000) : later({ type: "res", id: x.id, ok: true, data: fxSpoolman() }, 100));
        later({ type: "res", id: x.id, ok: true, data: {} }, 10);
      },
    };
    stop = S.init();
    await vi.advanceTimersByTimeAsync(50);
    S.patchSettings({ spoolman: { url: "http://bad.lan:7912" } }); void S.fetchSpoolman(true);
    await vi.advanceTimersByTimeAsync(1000);
    S.patchSettings({ spoolman: { url: "http://good.lan:7912" } }); void S.fetchSpoolman(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(S.store.spoolman.state).toBe("ok");
    await vi.advanceTimersByTimeAsync(15000);
    expect(S.store.spoolman.state).toBe("ok");
    expect(S.store.spoolman.data.filaments.length).toBeGreaterThan(0);
  });
});

describe("MEDIUM: save is single-flight and numbers never repeat", () => {
  test("double save returns the same record and adds one quote", async () => {
    stop = boot("ok");
    await vi.advanceTimersByTimeAsync(700);
    S.resetDraft();
    const before = S.store.quotes.length;
    const p1 = saveQuote(); const p2 = saveQuote();
    await vi.advanceTimersByTimeAsync(200);
    const [a, b] = await Promise.all([p1, p2]);
    expect(S.store.quotes.length - before).toBe(1);
    expect(a?.id).toBe(b?.id);
  });
  test("nextNo is reconciled with the saved quotes on load", async () => {
    stop = boot("ok"); // fixture: nextNo 43, quotes 41 and 42
    await vi.advanceTimersByTimeAsync(700);
    expect(S.store.settings.sheet.nextNo).toBeGreaterThanOrEqual(43);
    stop(); stop = null; delete window.orca;
    const host = createMockHost("ok");
    const original = host.postMessage.bind(host);
    host.postMessage = (m: unknown) => {
      const x = m as { type: string; id: number; cmd: string };
      if (x.type === "cmd" && x.cmd === "get_state") return void setTimeout(() => dispatch({ type: "res", id: x.id, ok: true, data: { host: { projectName: "p", printerModel: null, printerVendor: null, pluginVersion: "x" }, plates: [], settings: fxSettings({ sheet: { shopName: "", footer: "", validityDays: 15, nextNo: 5 } }), quotes: savedQuotes(), spooler: null } }), 10);
      original(m);
    };
    window.orca = host;
    stop = S.init();
    await vi.advanceTimersByTimeAsync(700);
    expect(S.store.settings.sheet.nextNo).toBe(43); // max(5, 42 + 1)
  });
  test("saving a quote also writes the next number straight away (no debounce window)", async () => {
    stop = boot("ok");
    await vi.advanceTimersByTimeAsync(700);
    S.resetDraft();
    sent.length = 0;
    const p = saveQuote();
    await vi.advanceTimersByTimeAsync(200);
    await p;
    const all = saves("save_settings");
    const lastSettings = all[all.length - 1];
    expect(lastSettings).toBeDefined();
    expect((lastSettings!.args.settings as { sheet: { nextNo: number } }).sheet.nextNo).toBe(44);
  });
  test("duplicate uses a number above every existing one", async () => {
    stop = boot("ok");
    await vi.advanceTimersByTimeAsync(700);
    S.patchSettings((s) => ({ sheet: { ...s.sheet, nextNo: 1 } }));
    const p = duplicateQuote(S.store.quotes[0]!.id);
    await vi.advanceTimersByTimeAsync(200);
    await p;
    const nos = S.store.quotes.map((q) => q.no);
    expect(new Set(nos).size).toBe(nos.length);
    expect(Math.max(...nos)).toBeGreaterThan(42); // above every existing number, not nextNo = 1
  });
});

describe("MEDIUM: deleting a plate shifts the draft controls", () => {
  test("a plates event with `deleted` moves later controls down", async () => {
    stop = boot("ok");
    await vi.advanceTimersByTimeAsync(700);
    S.setPlateControl(0, { copies: 5 });
    S.setPlateControl(1, { copies: 1, include: false });
    const rest = S.store.plates.slice(1).map((p, i) => ({ ...p, index: i })) as HostPlate[];
    dispatch({ type: "event", name: "plates", data: { plates: rest, deleted: 0 } });
    expect(S.store.draft.plates[0]).toEqual({ include: false, copies: 1 });
    expect(S.store.draft.plates[1]).toBeUndefined();
  });
  test("without `deleted` the controls stay by index (a normal re-slice)", async () => {
    stop = boot("ok");
    await vi.advanceTimersByTimeAsync(700);
    S.setPlateControl(0, { copies: 5 });
    dispatch({ type: "event", name: "plates", data: { plates: S.store.plates } });
    expect(S.store.draft.plates[0]?.copies).toBe(5);
  });
});

describe("LOW: openQuote keeps a pending live slice", () => {
  test("pendingPlates survives openQuote and wins on Use current slice", async () => {
    stop = boot("ok");
    await vi.advanceTimersByTimeAsync(700);
    const fresh = S.store.plates.slice(0, 1);
    S.store.pendingPlates = fresh;
    openQuote(S.store.quotes[0]!.id);
    expect(S.store.pendingPlates).toEqual(fresh);
    useCurrentSlice();
    expect(S.store.plates).toEqual(fresh);
  });
});

describe("MEDIUM: every command has a timeout", () => {
  test("spoolman_fetch (30 s) and the other commands (25 s) reject with `timeout`; import_sliced waits longer", async () => {
    window.orca = { postMessage: () => undefined, onMessage: () => undefined };
    const p = call("spoolman_fetch", { url: "http://x" });
    const q = call("save_settings", { settings: {} as never });
    const imp = call("import_sliced", { name: "a.3mf", b64: "" });
    const outcomes: unknown[] = [];
    void p.catch((e) => outcomes.push(["spoolman", (e as BridgeError).code]));
    void q.catch((e) => outcomes.push(["save", (e as BridgeError).code]));
    void imp.catch((e) => outcomes.push(["import", (e as BridgeError).code]));
    await vi.advanceTimersByTimeAsync(26_000);
    expect(outcomes).toEqual([["save", "timeout"]]);
    await vi.advanceTimersByTimeAsync(5_000); // spoolman_fetch: 30 s
    expect(outcomes).toEqual([["save", "timeout"], ["spoolman", "timeout"]]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(outcomes).toContainEqual(["import", "timeout"]);
  });
});
