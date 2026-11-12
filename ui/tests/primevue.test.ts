// The Vue + PrimeVue migration, as properties of the code and of the running app (not of any particular markup):
// no hand-made controls left in the shipped components, PrimeVue strings follow the plugin language, the host theme drives the shared
// palette, and dialogs hand focus back to something that still exists.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { defineComponent, h, nextTick, type App as VueApp } from "vue";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import AppRoot from "../src/App.vue";
import { useDialogFocus } from "../src/components/base/dialogFocus";
import { setLocale } from "../src/i18n";
import { createMockHost } from "../src/mock/host";
import { createOrcaApp, syncHostTheme } from "../src/orcaUi";
import { closeHelp, openHelp } from "../src/state/help";
import { setLanguage, store } from "../src/state/store";
import { settle } from "./pv";

const SRC = join(process.cwd(), "src") + "/";
function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === "mock" ? [] : vueFiles(p)) : n.endsWith(".vue") ? [p] : [];
  });
}
const files = vueFiles(SRC);
const text = (p: string): string => readFileSync(p, "utf8");

describe("no hand-made controls in the shipped components", () => {
  test.each(["<button", "<select", "<textarea", "<dialog", "<details", "v-html", 'class="btn', "type=\"checkbox\"", "type=\"radio\"", "type=\"color\"", "<option"])("none of %s", (needle) => {
    const hits = files.filter((f) => text(f).includes(needle)).map((f) => f.replace(SRC, ""));
    expect(hits).toEqual([]);
  });
  test("the only native <input> are the two hidden file pickers a PrimeVue button opens", () => {
    const hits = files.flatMap((f) => [...text(f).matchAll(/<input\b[^>]*>/g)].map((m) => `${f.replace(SRC, "")}: ${m[0]}`));
    expect(hits).toHaveLength(2);
    for (const h of hits) expect(h).toMatch(/type="file"[^>]*class="hidden"[^>]*aria-hidden="true"/);
  });
  test("native tables remain only for read-only grids and the printable quote sheet", () => {
    const hits = files.filter((f) => text(f).includes("<table")).map((f) => f.replace(SRC, "")).sort();
    expect(hits).toEqual(["components/price/BatchTable.vue", "components/price/ChannelComparison.vue", "components/quotes/QuoteSheet.vue", "views/QuotesView.vue", "views/StockView.vue"]);
  });
  test("PrimeVue is imported component by component (no barrel, no add-on libraries)", () => {
    for (const f of files) for (const m of text(f).matchAll(/from "(primevue[^"]*|@primevue[^"]*|primeflex[^"]*)"/g)) expect(m[1], f).toMatch(/^primevue\/[a-z]+$/);
  });
  test("no remote assets or sibling-plugin imports", () => {
    for (const f of files) {
      expect(text(f), f).not.toMatch(/https?:\/\/(cdn|fonts)\./);
      expect(text(f), f).not.toMatch(/orca_(organizer|spooler|u1)|from "\.\.\/\.\.\/\.\.\/\.\./);
    }
  });
});

describe("language and theme reach PrimeVue", () => {
  let app: VueApp | null = null;
  let root: HTMLElement | null = null;
  beforeEach(() => { vi.useRealTimers(); setLocale("en"); });
  afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; delete window.orca; closeHelp(); document.body.innerHTML = ""; store.view = "calc"; });

  test("returning from Quotes focuses the Calculator content title", async () => {
    window.orca = createMockHost("ok");
    root = document.body.appendChild(document.createElement("div"));
    app = createOrcaApp({ render: () => h(AppRoot) });
    app.mount(root);
    await settle(60);
    document.querySelector<HTMLElement>('[role=tab][aria-label="Quotes"]')?.click();
    await settle(60);
    document.querySelector<HTMLElement>('[role=tab][aria-label="Calculator"]')?.click();
    await settle(60);
    expect(document.activeElement?.id).toBe("plates-title");
    const opener = root.querySelector<HTMLElement>('[data-testid=help-open]');
    expect(opener).not.toBeNull();
    opener?.focus();
    opener?.click();
    await settle(60);
    expect(document.querySelector('[role=dialog]')).not.toBeNull();
    closeHelp();
    await vi.waitFor(() => expect(document.querySelector('[role=dialog]')).toBeNull());
    await settle(60);
    expect(document.activeElement).toBe(opener);
  });

  test("changing the language in Settings changes PrimeVue's own strings too (dialog close button)", async () => {
    window.orca = createMockHost("ok");
    root = document.body.appendChild(document.createElement("div"));
    app = createOrcaApp({ render: () => h(AppRoot) });
    app.mount(root);
    await settle(60);
    openHelp();
    await settle(60);
    expect(document.querySelector('[role=dialog] button[aria-label="Close"]')).not.toBeNull();
    closeHelp();
    await vi.waitFor(() => expect(document.querySelector("[role=dialog]")).toBeNull(), { timeout: 3000 });
    setLanguage("pt-BR");
    await settle(60);
    openHelp();
    await settle(60);
    expect(document.querySelector('[role=dialog] button[aria-label="Fechar"]')).not.toBeNull();
    expect(document.querySelector("[role=dialog]")!.textContent).toContain("Como funciona");
  });

  test("the host theme attribute drives the shared palette and the dark class, and follows changes", async () => {
    document.documentElement.removeAttribute("data-orca-theme");
    const stop = syncHostTheme();
    expect(document.documentElement.classList.contains("orca-dark")).toBe(false);
    const light = document.documentElement.style.getPropertyValue("--oui-primary");
    document.documentElement.setAttribute("data-orca-theme", "dark");
    await nextTick(); await new Promise((r) => setTimeout(r, 0));
    expect(document.documentElement.classList.contains("orca-dark")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--oui-primary")).not.toBe(light);
    stop();
    document.documentElement.setAttribute("data-orca-theme", "light");
    await new Promise((r) => setTimeout(r, 0));
    expect(document.documentElement.classList.contains("orca-dark")).toBe(true); // stopped: no longer followed
    document.documentElement.removeAttribute("data-orca-theme");
    document.documentElement.classList.remove("orca-dark");
  });

  test("the body carries the shared base class so the preset typography applies", () => {
    document.body.className = "";
    root = document.body.appendChild(document.createElement("div"));
    app = createOrcaApp(defineComponent({ render: () => h("div") }));
    app.mount(root);
    expect(document.body.classList.contains("orca-ui")).toBe(true);
  });
});

describe("dialog focus", () => {
  test("goes back to the opener while it exists, else to the view title, never to <body>", () => {
    document.body.innerHTML = '<button id="o">open</button><h1 data-view-title tabindex="-1">Title</h1>';
    const f = useDialogFocus();
    const o = document.getElementById("o")!;
    o.focus();
    f.capture();
    (document.querySelector("[data-view-title]") as HTMLElement).focus();
    f.restore();
    expect(document.activeElement).toBe(o);
    o.focus();
    f.capture();
    o.remove();
    f.restore();
    expect(document.activeElement?.hasAttribute("data-view-title")).toBe(true);
    document.body.innerHTML = "";
  });
});
