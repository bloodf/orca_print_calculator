import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { call, on, ready } from "../src/bridge";
import { installMockOrca } from "./echoHost";

beforeEach(() => {
  delete window.orca;
  installMockOrca();
});

test("mock host answers a cmd with a matching res", async () => {
  const data = await call("get_state", { a: 1 });
  expect(data).toEqual({ cmd: "get_state", args: { a: 1 } });
});

test("ready is a one-way hello: the host pushes no state (the page loads through get_state)", async () => {
  const got: unknown[] = [];
  on("state", (d) => got.push(d));
  ready();
  await Promise.resolve();
  await Promise.resolve();
  expect(got).toEqual([]);
});

// ---- the REAL injected bridge shape (Orca 2.5): onMessage REGISTERS a callback; host -> page goes through __orcaDispatch ----
import { BridgeError } from "../src/bridge";

type Msg = Record<string, unknown>;
function installRealShape(onPost: (m: Msg, deliver: (x: unknown) => void) => void): { registrations: () => number } {
  const handlers: ((m: unknown) => void)[] = [];
  const deliver = (m: unknown): void => handlers.forEach((h) => h(m));
  (window as unknown as { __orcaDispatch: typeof deliver }).__orcaDispatch = deliver;
  window.orca = {
    postMessage: (m: unknown) => onPost(m as Msg, deliver),
    onMessage: (cb: (m: unknown) => void) => { handlers.push(cb); },
  } as never;
  return { registrations: () => handlers.length };
}
afterEach(() => { delete window.orca; });

describe("real injected bridge shape", () => {
  test("onMessage is called as a registration, exactly once per host object, however many calls", async () => {
    const reg = installRealShape((m, deliver) => { if (m.type === "cmd") queueMicrotask(() => deliver({ type: "res", id: m.id, ok: true, data: { n: m.cmd } })); });
    await call("get_state", {});
    await call("save_settings", { settings: {} as never });
    ready();
    await call("save_quotes", { quotes: [] });
    expect(reg.registrations()).toBe(1);
  });
  test("cmd -> res round-trip (object payloads)", async () => {
    installRealShape((m, deliver) => { if (m.type === "cmd") queueMicrotask(() => deliver({ type: "res", id: m.id, ok: true, data: { echoed: m.args } })); });
    expect(await call("spoolman_fetch", { url: "http://x" })).toEqual({ echoed: { url: "http://x" } });
  });
  test("cmd -> res round-trip (JSON string payloads)", async () => {
    installRealShape((m, deliver) => { if (m.type === "cmd") queueMicrotask(() => deliver(JSON.stringify({ type: "res", id: m.id, ok: true, data: { s: 1 } }))); });
    expect(await call("get_state", {})).toEqual({ s: 1 });
  });
  test("unsolicited event reaches listeners (object and string)", async () => {
    installRealShape(() => undefined);
    const got: unknown[] = [];
    on("plates", (d) => got.push(d));
    ready();
    (window as unknown as { __orcaDispatch: (x: unknown) => void }).__orcaDispatch({ type: "event", name: "plates", data: { plates: [1] } });
    (window as unknown as { __orcaDispatch: (x: unknown) => void }).__orcaDispatch(JSON.stringify({ type: "event", name: "plates", data: { plates: [2] } }));
    expect(got).toEqual([{ plates: [1] }, { plates: [2] }]);
  });
  test("error shape: res {ok:false, error:<code>, detail?} rejects with a BridgeError carrying the code", async () => {
    installRealShape((m, deliver) => { if (m.type === "cmd") queueMicrotask(() => deliver({ type: "res", id: m.id, ok: false, error: "unreachable", detail: "ECONNREFUSED" })); });
    await expect(call("spoolman_fetch", { url: "u" })).rejects.toMatchObject({ code: "unreachable" });
    await expect(call("spoolman_fetch", { url: "u" })).rejects.toBeInstanceOf(BridgeError);
  });
  test("a second host object (reload) gets its own single registration", async () => {
    const a = installRealShape((m, d) => { if (m.type === "cmd") queueMicrotask(() => d({ type: "res", id: m.id, ok: true, data: 1 })); });
    await call("get_state", {});
    const b = installRealShape((m, d) => { if (m.type === "cmd") queueMicrotask(() => d({ type: "res", id: m.id, ok: true, data: 2 })); });
    expect(await call("get_state", {})).toBe(2);
    expect([a.registrations(), b.registrations()]).toEqual([1, 1]);
  });
  test("the dev mock host uses the real shape", async () => {
    const { createMockHost } = await import("../src/mock/host");
    delete window.orca;
    delete (window as unknown as { __orcaDispatch?: unknown }).__orcaDispatch;
    window.orca = createMockHost("ok");
    vi.useFakeTimers();
    const p = call("get_state", {});
    await vi.advanceTimersByTimeAsync(200);
    expect(await p).toMatchObject({ host: { projectName: expect.anything() } });
    vi.useRealTimers();
    expect(typeof (window as unknown as { __orcaDispatch?: unknown }).__orcaDispatch).toBe("function");
  });
});
