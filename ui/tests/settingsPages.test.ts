// Settings as pages: opening a page (click, link), Back to the list, the page kept for the next visit, the invalid flag.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h, nextTick, type App } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({})) }));
import SettingsView from "../src/views/SettingsView.vue";
import { setLocale } from "../src/i18n";
import { openSettingsTab, settingsLinked } from "../src/state/settingsTab";
import { store } from "../src/state/store";
import { clearToasts } from "../shared/src/components/toast";
import { load } from "./priceKit";

let app: App | null = null;
let root: HTMLElement | null = null;
const settle = async (): Promise<void> => { for (let i = 0; i < 3; i++) { await nextTick(); await new Promise((r) => setTimeout(r, 20)); } };
async function mount(): Promise<void> {
  root = document.createElement("div");
  document.body.appendChild(root);
  app = createApp({ render: () => h(SettingsView) });
  app.mount(root);
  await settle();
}
function unmount(): void { app?.unmount(); root?.remove(); app = null; root = null; }
const link = (id: string): HTMLElement => root!.querySelector<HTMLElement>(`.oui-settings-link[data-section="settings-${id}"]`)!;
const selected = (): string | undefined => root!.querySelector<HTMLElement>('.oui-settings-link[aria-selected="true"]')?.dataset.section;
const isOpen = (): boolean => root!.querySelector(".spg")!.hasAttribute("data-open");
const heading = (id: string): HTMLElement => root!.querySelector<HTMLElement>(`#settings-${id} .oui-panel-title`)!;

beforeEach(async () => {
  setLocale("en"); clearToasts(); load("ok"); localStorage.clear(); settingsLinked.value = false;
  store.status = "ready";
  await mount();
});
afterEach(unmount);

describe("settings pages", () => {
  test("a plain visit shows the list (narrow) on the first page; nothing takes focus", () => {
    expect(selected()).toBe("settings-spoolman");
    expect(isOpen()).toBe(false);
    expect(root!.contains(document.activeElement)).toBe(false);
  });

  test("a click opens the page and moves focus to its heading; Back returns to the list and that page's entry", async () => {
    link("printers").click();
    await settle();
    expect(selected()).toBe("settings-printers");
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(heading("printers"));
    expect(heading("printers").textContent?.trim()).toBe("Printers");
    root!.querySelector<HTMLElement>("[data-test=settings-back]")!.click();
    await settle();
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(link("printers"));
  });

  test("a link from elsewhere opens its page, focused, also on a page other than the remembered one", async () => {
    link("about").click();
    await settle();
    openSettingsTab("settings-costs");
    await settle();
    expect(selected()).toBe("settings-costs");
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(heading("costs"));
    expect(settingsLinked.value).toBe(false);
  });

  test("a link made before Settings is shown opens that page when it is shown", async () => {
    unmount();
    openSettingsTab("settings-language");
    await mount();
    expect(selected()).toBe("settings-language");
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(heading("language"));
  });

  test("the last page is kept for the next visit, and an old link does not override it", async () => {
    openSettingsTab("settings-costs");
    await settle();
    link("sheet").click();
    await settle();
    unmount();
    await mount();
    expect(selected()).toBe("settings-sheet");
    expect(isOpen()).toBe(false);
  });

  test("#<page id> in the address opens that page, focused", async () => {
    location.hash = "#settings-printers";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await settle();
    expect(selected()).toBe("settings-printers");
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(heading("printers"));
    history.replaceState(null, "", location.pathname);
  });

  test("a page with an invalid value is flagged in the list, in words too", async () => {
    store.settings = { ...store.settings, sheet: { ...store.settings.sheet, accent: "nope" } };
    await settle();
    expect(link("sheet").dataset.state).toBe("error");
    expect(link("sheet").getAttribute("aria-label")).toBe("Quote sheet, has a value to fix");
    expect(link("costs").dataset.state).toBeUndefined();
    expect(link("costs").hasAttribute("aria-label")).toBe(false);
    store.settings = { ...store.settings, sheet: { ...store.settings.sheet, accent: "#112233" } };
    await settle();
    expect(link("sheet").dataset.state).toBeUndefined();
    expect(link("sheet").hasAttribute("aria-label")).toBe(false);
  });

  test("the Back label and the flag text exist in every language", async () => {
    for (const [lang, back] of [["pt-BR", "Voltar"], ["es", null], ["de", null], ["zh-CN", null], ["pl", null]] as const) {
      setLocale(lang);
      await settle();
      const label = root!.querySelector("[data-test=settings-back]")!.textContent!.trim();
      expect(label, lang).not.toBe("");
      expect(label, lang).not.toBe("Back");
      if (back) expect(label).toBe(back);
    }
  });
});
