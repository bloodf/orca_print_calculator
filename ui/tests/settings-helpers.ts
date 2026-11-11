// Shared harness for settings*.test.ts: mounts a component, fakes window.orca, resets the store.
import { createApp, type App, type Component } from "vue";
import { setLocale } from "../src/i18n";
import { defaultSettings } from "../src/state/defaults";
import { store } from "../src/state/store";
import { clearToasts } from "../src/state/toast";

export type Call = { cmd: string; args: Record<string, unknown> };
type Handler = (args: Record<string, unknown>) => unknown;

export function installHost(handlers: Record<string, Handler> = {}): Call[] {
  const calls: Call[] = [];
  // real injected shape: onMessage registers, delivery goes through __orcaDispatch
  const handlers_: ((m: unknown) => void)[] = [];
  const deliver = (m: unknown): void => handlers_.forEach((fn) => fn(m));
  (window as unknown as { __orcaDispatch: typeof deliver }).__orcaDispatch = deliver;
  const host = {
    onMessage(cb: (m: unknown) => void): void { handlers_.push(cb); },
    postMessage(msg: unknown) {
      const m = msg as { type: string; id: number; cmd: string; args: Record<string, unknown> };
      if (m.type !== "cmd") return;
      calls.push({ cmd: m.cmd, args: m.args });
      queueMicrotask(() => {
        try {
          const data = handlers[m.cmd] ? handlers[m.cmd]!(m.args) : {};
          deliver({ type: "res", id: m.id, ok: true, data });
        } catch (e) {
          deliver({ type: "res", id: m.id, ok: false, error: (e as Error).message });
        }
      });
    },
  };
  window.orca = host;
  return calls;
}

export function resetStore(): void {
  store.status = "ready";
  setLocale("en");
  store.settings = defaultSettings("USD", "Direct");
  store.spoolman = { state: "unset", data: { currency: null, filaments: [], spools: [] }, error: null };
  store.spooler = null;
  store.saveStatus = "idle";
  store.host = { projectName: null, printerModel: null, printerVendor: null, pluginVersion: "0.1.0" };
  clearToasts();
}

let app: App | null = null;
let root: HTMLElement | null = null;
export function mountComponent(c: Component, props: Record<string, unknown> = {}): HTMLElement {
  unmountComponent();
  root = document.createElement("div");
  document.body.appendChild(root);
  app = createApp(c, props);
  app.mount(root);
  return root;
}
export function unmountComponent(): void {
  app?.unmount();
  root?.remove();
  app = null;
  root = null;
}

export const flush = async (n = 4): Promise<void> => { for (let i = 0; i < n; i++) await Promise.resolve(); };
export function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
export const byText = (root: ParentNode, sel: string, text: string): HTMLElement | undefined =>
  [...root.querySelectorAll<HTMLElement>(sel)].find((e) => e.textContent?.trim() === text);
import { toasts } from "../src/state/toast";
/** Newest toast (Array.prototype.at is outside the Safari 14 floor). */
export const lastToast = () => toasts.list[toasts.list.length - 1];
