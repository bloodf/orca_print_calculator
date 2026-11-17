// An Orca Cloud install started offline: the host has no storage folder yet, so get_state carries no settings or
// quotes and names both as unloaded. The page must never save its built-in defaults over the real files: it reads
// them again first (before a save, and when the tab is shown again), then saves what was read.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import { setLocale } from "../src/i18n";
import { HOST, plates, settings as fxSettings } from "../src/mock/fixtures";
import * as S from "../src/state/store";
import { clearToasts } from "../src/state/toast";

type Sent = { cmd: string; args: Record<string, unknown> };
const flush = async () => { for (let i = 0; i < 8; i++) { await vi.advanceTimersByTimeAsync(50); await nextTick(); } };
const OFFLINE = { host: HOST, plates: plates(), settings: null, quotes: null, spooler: null, unreadable: ["settings", "quotes"], unloaded: ["settings", "quotes"] };
const saved = () => ({ ...fxSettings(), currency: "EUR" });

function boot(states: unknown[]): { sent: Sent[] } {
  const sent: Sent[] = [];
  const handlers: ((m: unknown) => void)[] = [];
  window.orca = {
    onMessage: (cb) => { handlers.push(cb); },
    postMessage: (m) => {
      const x = m as { type: string; id: number; cmd: string; args: Record<string, unknown> };
      if (x.type !== "cmd") return;
      sent.push({ cmd: x.cmd, args: x.args });
      const data = x.cmd === "get_state" ? (states.length > 1 ? states.shift() : states[0]) : {};
      setTimeout(() => handlers.forEach((fn) => fn({ type: "res", id: x.id, ok: true, data })), 5);
    },
  };
  stop = S.init();
  return { sent };
}
let stop: (() => void) | null = null;
beforeEach(() => { vi.useFakeTimers(); setLocale("en"); clearToasts(); S.store.status = "loading"; });
afterEach(() => { stop?.(); stop = null; delete window.orca; vi.useRealTimers(); });

describe("storage not available when the page loaded", () => {
  test("a settings edit reads the files again and never saves the defaults over them", async () => {
    const online = { ...OFFLINE, settings: saved(), quotes: [], unreadable: [], unloaded: [] };
    const { sent } = boot([OFFLINE, online]);
    await flush();
    expect(S.store.unloaded).toEqual(["settings", "quotes"]);
    S.patchSettings({ onboarded: true });
    await vi.advanceTimersByTimeAsync(700);
    await flush();
    expect(sent.map((s) => s.cmd)).toEqual(["get_state", "get_state", "save_settings"]);
    expect((sent[2]!.args.settings as { currency: string }).currency).toBe("EUR");   // the file's, not the defaults
    expect(S.store.unloaded).toEqual([]);
  });

  test("while storage is still missing nothing is saved", async () => {
    const { sent } = boot([OFFLINE]);
    await flush();
    S.patchSettings({ onboarded: true });
    await vi.advanceTimersByTimeAsync(700);
    await flush();
    expect(sent.some((s) => s.cmd === "save_settings")).toBe(false);
  });

  test("showing the tab again reads the files once storage is there", async () => {
    const online = { ...OFFLINE, settings: saved(), quotes: [], unreadable: [], unloaded: [] };
    const { sent } = boot([OFFLINE, online]);
    await flush();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(sent.filter((s) => s.cmd === "get_state")).toHaveLength(2);
    expect(S.store.settings.currency).toBe("EUR");
    expect(S.store.unreadable).toEqual([]);
  });
});
