// Shared setup for the costs and header tests: seed the real store from the dev fixtures, mount one component.
import { h, nextTick, type App } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";
import { HOST, plates, settings, spoolman } from "../src/mock/fixtures";
import { newDraft } from "../src/state/defaults";
import { store } from "../src/state/store";
import { clearToasts } from "../src/state/toast";
import { setLocale } from "../src/i18n";
import type { HostInfo, Settings } from "../src/state/types";

let app: App | null = null;
let root: HTMLElement | null = null;

export function seed(opts: { lang?: "en" | "pt-BR"; settings?: Partial<Settings>; host?: HostInfo } = {}): void {
  setLocale(opts.lang ?? "en");
  clearToasts();
  store.status = "ready";
  store.host = opts.host ?? HOST;
  store.settings = settings({ language: opts.lang ?? "en", ...opts.settings });
  store.plates = plates();
  store.draft = newDraft(store.settings);
  store.spoolman = { state: "ok", data: spoolman(), error: null };
}

export function mount(Comp: unknown, props: Record<string, unknown> = {}): HTMLElement {
  unmount();
  root = document.createElement("div");
  document.body.appendChild(root);
  app = createApp({ render: () => h(Comp as never, props) });
  app.mount(root);
  return root;
}
export function unmount(): void {
  app?.unmount();
  root?.remove();
  app = null;
  root = null;
}

export const openAll = (): Partial<Settings> => ({ ui: { open: { machine: true, labor: true, extras: true, shipping: true, sales: true }, sheetMode: "summary" } });

export async function type(input: HTMLInputElement, text: string): Promise<void> {
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
}
/** Find a field input by its visible label text. */
export function field(root: HTMLElement, label: string): HTMLInputElement {
  const l = [...root.querySelectorAll("label")].find((x) => x.textContent?.trim() === label);
  if (!l) throw new Error(`no label ${label}`);
  return root.querySelector<HTMLInputElement>(`#${CSS.escape(l.getAttribute("for") ?? "")}`)!;
}
export const click = async (el: Element | null): Promise<void> => { (el as HTMLElement).click(); await nextTick(); };
