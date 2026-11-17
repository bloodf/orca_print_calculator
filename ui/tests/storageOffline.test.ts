// An Orca Cloud install started offline: the host has no storage folder yet, so get_state carries no settings or
// quotes and names both as unloaded. The page must never save its built-in defaults over the real files: it reads
// them again first (before a save, and when the tab is shown again), then saves what was read.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h, nextTick, type App } from "vue";
import PlateNotices from "../src/components/plates/PlateNotices.vue";
import { createOrcaApp as createApp } from "../src/orcaUi";
import { savedQuotes } from "../src/mock/fixtures";
import { toasts } from "../src/state/toast";
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

const recover = async (): Promise<boolean> => { const p = S.recoverState(); await flush(); return p; };

describe("after the files arrive", () => {
  test("settings that differ from the ones shown are announced; equal ones are not", async () => {
    const online = { ...OFFLINE, settings: saved(), quotes: [], unreadable: [], unloaded: [] };
    boot([OFFLINE, online]);
    await flush();
    clearToasts();
    await recover();
    expect(toasts.list.map((x) => x.text)).toEqual(["Your saved settings have loaded and replace the ones shown until now."]);
    stop?.(); stop = null; delete window.orca; S.store.status = "loading"; clearToasts();
    boot([OFFLINE, { ...online, settings: null }]);   // first run: the file holds nothing beyond the built-ins
    await flush();
    await recover();
    expect(toasts.list).toEqual([]);
  });

  test("quote numbers continue after the saved quotes that arrived", async () => {
    const quotes = savedQuotes();
    const top = Math.max(...quotes.map((q) => q.no));
    const online = { ...OFFLINE, settings: { ...saved(), sheet: { ...saved().sheet, nextNo: 1 } }, quotes, unreadable: [], unloaded: [] };
    boot([OFFLINE, online]);
    await flush();
    await recover();
    expect(S.store.settings.sheet.nextNo).toBe(top + 1);
  });
});

describe("the banner", () => {
  let app: App | null = null;
  let root: HTMLElement | null = null;
  afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });
  const show = async (): Promise<HTMLElement> => {
    root = document.createElement("div");
    document.body.append(root);
    app = createApp({ render: () => h(PlateNotices) });
    app.mount(root);
    await flush();
    return root;
  };

  test("files not loaded yet get their own notice, not the permissions error", async () => {
    boot([OFFLINE]);
    await flush();
    const el = await show();
    expect(el.querySelector("[data-not-loaded]")?.textContent).toMatch(/haven't loaded yet/);
    expect(el.querySelector("[data-unreadable]")).toBeNull();
  });

  test("a file that really can't be read keeps the permissions error", async () => {
    boot([{ ...OFFLINE, settings: saved(), unreadable: ["quotes"], unloaded: [] }]);
    await flush();
    const el = await show();
    expect(el.querySelector("[data-unreadable]")?.textContent).toMatch(/file permissions/);
    expect(el.querySelector("[data-not-loaded]")).toBeNull();
  });
});
