// A settings file with any wrong-typed or absurd value must never break boot, blank the price, or hide what was reset.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h, nextTick, type App } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";
import PricePanel from "../src/components/price/PricePanel.vue";
import { setLocale } from "../src/i18n";
import { HOST, plates, settings as fxSettings, spoolman as fxSpoolman } from "../src/mock/fixtures";
import { defaultDefaults } from "../src/state/defaults";
import * as S from "../src/state/store";
import { clearToasts } from "../src/state/toast";

const BAD: unknown[] = [null, "x", "5", -1, 1e18, 0.5, {}, [], true, [{ minQty: "a" }], { mode: "weird", minor: "x" }];
let app: App | null = null;
let root: HTMLElement | null = null;
const flush = async () => { for (let i = 0; i < 6; i++) { await vi.advanceTimersByTimeAsync(50); await nextTick(); } };

function boot(settings: unknown): () => void {
  const handlers: ((m: unknown) => void)[] = [];
  (window as unknown as { __orcaDispatch: (m: unknown) => void }).__orcaDispatch = (m) => handlers.forEach((fn) => fn(m));
  window.orca = {
    onMessage: (cb) => { handlers.push(cb); },
    postMessage: (m) => {
      const x = m as { type: string; id: number; cmd: string };
      if (x.type !== "cmd") return;
      const data = x.cmd === "get_state" ? { host: HOST, plates: plates(), settings, quotes: [], spooler: null } : x.cmd === "spoolman_fetch" ? fxSpoolman() : {};
      setTimeout(() => (window as unknown as { __orcaDispatch: (m: unknown) => void }).__orcaDispatch({ type: "res", id: x.id, ok: true, data }), 5);
    },
  };
  return S.init();
}
let stop: (() => void) | null = null;
beforeEach(() => { vi.useFakeTimers(); setLocale("en"); clearToasts(); S.store.status = "loading"; });
afterEach(() => { stop?.(); stop = null; app?.unmount(); root?.remove(); app = null; root = null; delete window.orca; vi.useRealTimers(); });

describe("every defaults key, set to something wrong", () => {
  const keys = Object.keys(defaultDefaults());
  for (const key of keys) {
    test(`${key}: boots, names what was reset, and still shows a price`, async () => {
      for (const bad of BAD) {
        const s = fxSettings();
        (s.defaults as Record<string, unknown>)[key] = bad;
        stop = boot(s);
        await flush();
        expect(S.store.status, `${key}=${JSON.stringify(bad)}`).toBe("ready");
        const sel = S.derived.value.selected;
        expect(sel && sel.ok, `${key}=${JSON.stringify(bad)} price`).toBe(true);
        if (JSON.stringify(bad) !== JSON.stringify((defaultDefaults() as Record<string, unknown>)[key]) && JSON.stringify(bad) !== JSON.stringify((fxSettings().defaults as Record<string, unknown>)[key])) {
          // either it was accepted as valid (e.g. a number in range) or it is named in the one-time notice
          const accepted = JSON.stringify((S.store.settings.defaults as Record<string, unknown>)[key]) === JSON.stringify(bad);
          expect(accepted || S.store.settingsReset.includes(key), `${key}=${JSON.stringify(bad)} named`).toBe(true);
        }
        stop(); stop = null; delete window.orca; S.store.status = "loading";
      }
    });
  }
});

describe("the notice", () => {
  test("a bad file shows one dismissible notice naming the reset settings", async () => {
    const s = fxSettings();
    (s.defaults as Record<string, unknown>).discountTiers = null;
    (s.defaults as Record<string, unknown>).failureBp = "5";
    stop = boot(s);
    await flush();
    expect(S.store.settingsReset.sort()).toEqual(["discountTiers", "failureBp"]);
    const { default: PlatesArea } = await import("../src/views/PlatesArea.vue");
    root = document.createElement("div");
    document.body.appendChild(root);
    app = createApp({ render: () => h(PlatesArea) });
    app.mount(root);
    await nextTick();
    const note = root.querySelector("[data-settings-reset]")!;
    expect(note.textContent).toMatch(/reset to defaults/i);
    (note.querySelector("button") as HTMLButtonElement).click();
    await nextTick();
    expect(S.store.settingsReset).toEqual([]);
    expect(root.querySelector("[data-settings-reset]")).toBeNull();
  });
  test("an untouched file shows no notice", async () => {
    stop = boot(fxSettings());
    await flush();
    expect(S.store.settingsReset).toEqual([]);
  });
});

describe("a render-time failure in the derived quote is an inline error, never a blank price", () => {
  test("a corrupted draft or setting that makes deriveQuote throw shows a sentence in the hero", async () => {
    stop = boot(fxSettings());
    await flush();
    S.store.settings = { ...S.store.settings, defaults: { ...S.store.settings.defaults, shipping: null as never } };
    expect(() => S.derived.value).not.toThrow();
    expect(S.derived.value.result.ok).toBe(false);
    root = document.createElement("div");
    document.body.appendChild(root);
    app = createApp({ render: () => h(PricePanel) });
    app.mount(root);
    await nextTick();
    expect(root.querySelector('[data-testid="hero-sentence"]')!.textContent!.length).toBeGreaterThan(10);
  });
});
