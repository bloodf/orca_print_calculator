// The mounted page in Spanish, German and Simplified Chinese: every tab, the help dialog (PrimeVue's own strings), the quote
// sheet and its HTML export, and the sentences built from parts. Driven through the real bridge by the dev mock host.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { h, nextTick, type App as VueApp } from "vue";
import AppRoot from "../src/App.vue";
import { lead } from "../src/components/base/lead";
import { filesText } from "../src/files";
import { date, quoteNo } from "../src/format";
import { currentLocale, setLocale, t, type Locale } from "../src/i18n";
import { de } from "../src/i18n/de";
import { es } from "../src/i18n/es";
import { column } from "../src/i18n/messages";
import { zhCN } from "../src/i18n/zh-CN";
import { createMockHost } from "../src/mock/host";
import { buildScenario, type ScenarioName } from "../src/mock/scenarios";
import { createOrcaApp, primeLocale } from "../src/orcaUi";
import { sampleSheetModel, sheetHtml } from "../src/quoteExport";
import { setLanguage, store } from "../src/state/store";
import { clearToasts } from "../shared/src/components/toast";

// host -> page delivery in the real injected shape (window.__orcaDispatch calls every registered callback)
const dispatchToPage = (m: unknown): void => (window as unknown as { __orcaDispatch: (x: unknown) => void }).__orcaDispatch(m);
const en = column(0);
const ADDED = { es, de, "zh-CN": zhCN } as const;
type Added = keyof typeof ADDED;
const LANGS = Object.keys(ADDED) as Added[];

let app: VueApp | null = null;
let root: HTMLElement | null = null;
const tick = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); } };
/** Boot the app; `appLanguage` is what OrcaSlicer reports as its own language in get_state. */
async function boot(name: ScenarioName, appLanguage?: string): Promise<HTMLElement> {
  const host = createMockHost(name);
  if (appLanguage !== undefined) {
    const state = buildScenario(name).state;
    const post = host.postMessage.bind(host);
    host.postMessage = (message) => {
      if (typeof message === "object" && message !== null && "cmd" in message && message.cmd === "get_state" && "id" in message) {
        dispatchToPage({ type: "res", id: message.id, ok: true, data: { ...state, host: { ...state.host, appLanguage } } });
      } else post(message);
    };
  }
  window.orca = host;
  root = document.body.appendChild(document.createElement("div"));
  app = createOrcaApp({ render: () => h(AppRoot) });
  app.mount(root);
  await tick(700);
  return root;
}
const tab = (name: string): HTMLElement => {
  const found = [...document.querySelectorAll<HTMLElement>("[role=tab]")].find((b) => b.querySelector("span")?.textContent?.trim() === name);
  if (!found) throw new Error(`no tab "${name}"`);
  return found;
};
/** Everything a user can read or a screen reader says: text nodes and the naming attributes. */
function shownText(): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { const s = n.textContent?.replace(/\s+/g, " ").trim(); if (s) out.push(s); }
  for (const el of document.body.querySelectorAll("*")) for (const a of ["aria-label", "title", "placeholder", "alt"]) { const s = el.getAttribute(a)?.trim(); if (s) out.push(s); }
  return out;
}
/** English texts that are a different text in `lang`: none of them may be on the page. The mock's own data ("Direct" is a saved channel name) is not UI text. */
const englishOnly = (lang: Added): Set<string> => new Set(Object.keys(en).filter((k) => ADDED[lang][k as keyof typeof es] !== en[k] && !en[k]!.includes("{") && en[k] !== "Direct").map((k) => en[k]!));
const leftovers = (lang: Added): string[] => { const bad = englishOnly(lang); return [...new Set(shownText().filter((s) => bad.has(s)))]; };

beforeEach(() => { Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined); vi.useFakeTimers(); setLocale("en"); clearToasts(); });
/** Let the debounced settings save finish, so the next boot starts from its own scenario and not from this one's unsaved change. */
async function shutDown(): Promise<void> {
  await tick(1500);
  app?.unmount(); root?.remove(); app = null; root = null; delete window.orca; document.body.innerHTML = ""; clearToasts(); setLocale("en");
}
afterEach(async () => { await shutDown(); store.preview = false; store.view = "calc"; vi.useRealTimers(); });

describe.each(LANGS)("the page in %s", (lang) => {
  const d = ADDED[lang];
  test("picked in Settings: every tab is in that language and no English text is left", async () => {
    await boot("ok");
    expect(leftovers(lang).length, "the English page is full of the texts this test looks for").toBeGreaterThan(20);
    setLanguage(lang);
    await tick(50);
    expect(currentLocale()).toBe(lang);
    expect(document.documentElement.lang).toBe(lang);
    expect(store.settings.language).toBe(lang);
    expect([...document.querySelectorAll("[role=tab]")].map((b) => b.querySelector("span")?.textContent?.trim()).slice(0, 4)).toEqual([d["nav.calc"], d["nav.quotes"], d["nav.stock"], d["nav.settings"]]);
    expect(document.body.textContent).toContain(d["breakdown.title"]);
    expect(document.body.textContent).toContain(d["quote.save"]);
    expect(leftovers(lang)).toEqual([]);
    for (const [name, mark] of [["nav.quotes", "quotes.search"], ["nav.stock", "stock.col.spools"], ["nav.settings", "settings.group.language"]] as const) {
      tab(d[name]).click();
      await tick(50);
      expect(shownText(), name).toContain(d[mark]);
      expect(leftovers(lang), name).toEqual([]);
    }
  });
  test("the language list names each language in its own words", async () => {
    await boot("ok");
    setLanguage(lang);
    await tick(50);
    tab(d["nav.settings"]).click();
    await tick(50);
    const select = [...document.querySelectorAll<HTMLElement>("[role=combobox]")].find((c) => c.textContent?.trim() === d[`lang.${lang === "zh-CN" ? "zh" : lang}`]);
    expect(select, "the select shows the chosen language").toBeDefined();
    select!.closest<HTMLElement>(".p-select")!.click();
    await tick(50);
    expect([...document.querySelectorAll("[role=option]")].map((o) => o.textContent?.trim())).toEqual([d["lang.auto"], "English", "Português (Brasil)", "Español", "Deutsch", "简体中文"]);
  });
  test("the help dialog and PrimeVue's own strings follow", async () => {
    await boot("ok");
    setLanguage(lang);
    await tick(50);
    document.querySelector<HTMLElement>("[data-testid=help-open]")!.click();
    await tick(100);
    const dialog = document.querySelector("[role=dialog]")!;
    expect(dialog.textContent).toContain(d["help.title"]);
    expect(dialog.textContent).toContain(d["help.plates.body"]);
    expect(dialog.querySelector(`button[aria-label="${primeLocale(lang)!.aria!.close}"]`)).not.toBeNull();
    expect(dialog.querySelector('button[aria-label="Close"]')).toBeNull();
    expect(leftovers(lang)).toEqual([]);
  });
  test("first run, an empty project and a lost host are in that language too", async () => {
    for (const scenario of ["firstRun", "empty", "hostError", "unknown", "offline"] as const) {
      await boot(scenario);
      setLanguage(lang);
      setLocale(lang); // the host-error screen has no settings to save: the language is set directly
      await tick(50);
      expect(leftovers(lang), scenario).toEqual([]);
      await shutDown();
    }
  });
  test("the quote sheet and its HTML export", () => {
    setLocale(lang);
    const html = sheetHtml(sampleSheetModel({ shopName: "Studio Layer", footer: "", validityDays: 15, payment: "30" }, "EUR"));
    expect(html).toContain(`<html lang="${lang}">`);
    for (const key of ["sheet.date", "sheet.validUntil", "sheet.for", "sheet.item", "sheet.qty", "sheet.unitPrice", "sheet.amount", "sheet.subtotal", "sheet.total", "sheet.payment", "sheet.made", "sheet.sampleCustomer"] as const) expect(html, key).toContain(d[key]);
    expect(html).toContain({ es: "Presupuesto n.º 0001", de: "Angebot Nr. 0001", "zh-CN": "报价单 #0001" }[lang]);
    expect(html.replace(/[\u00a0\u202f]/g, " ")).toContain({ es: "90,00 €", de: "90,00 €", "zh-CN": "€90.00" }[lang]);
    expect(html).not.toMatch(/Quote|Valid until|Unit price|Amount|Made with/);
  });
});

describe("OrcaSlicer's language is followed while the setting is Auto", () => {
  test.each([["es", "es"], ["de", "de"], ["zh_CN", "zh-CN"], ["zh_TW", "zh-CN"], ["ja", "en"]] as const)("OrcaSlicer in %s opens the page in %s", async (appLanguage, locale) => {
    await boot("ok", appLanguage);
    expect(store.settings.language).toBe("auto");
    expect(currentLocale()).toBe(locale);
    expect(document.documentElement.lang).toBe(locale);
    expect(tab(t("nav.quotes"))).toBeDefined();
    if (locale !== "en") expect(leftovers(locale)).toEqual([]);
  });
  test("a manual choice stays when OrcaSlicer reports another language", async () => {
    await boot("ok", "de");
    setLanguage("zh-CN");
    await tick(50);
    dispatchToPage({ type: "event", name: "host", data: { kind: "PresetSelected", host: { ...store.host, appLanguage: "es" } } });
    await tick(50);
    expect(currentLocale()).toBe("zh-CN");
    setLanguage("auto");
    await tick(50);
    expect(currentLocale()).toBe("es");
  });
});

describe("sentences built from parts", () => {
  const names = (lang: Locale): string => { setLocale(lang); return filesText(["settings", "quotes"]); };
  test("the names of the saved files are joined in each language", () => {
    expect(names("en")).toBe("settings and quotes");
    expect(names("pt-BR")).toBe("ajustes e orçamentos");
    expect(names("es")).toBe("ajustes y presupuestos");
    expect(names("de")).toBe("Einstellungen und Angebote"); // German nouns keep their capital
    expect(names("zh-CN")).toBe("设置和报价列表");
    expect(filesText(["quotes"])).toBe("报价列表");
    expect(filesText([])).toBe("");
  });
  test("a banner takes its title from the first sentence, also with a Chinese full stop", () => {
    setLocale("zh-CN");
    expect(lead(t("plates.staleAlert"))).toEqual(["盘的数据可能已过期。", "上次切片后 OrcaSlicer 中有改动，但它没有说明是哪个盘。请重新切片以刷新。"]);
    expect(lead(t("plates.newSlice"))).toEqual(["OrcaSlicer 有新的切片。", ""]);
    expect(lead(t("spoolman.offlineAlert", { url: "http://spool.example:7912" }))[0]).toBe("Spoolman 在 http://spool.example:7912 无响应。");
    setLocale("de");
    expect(lead(t("plates.staleAlert"))[0]).toBe("Die Platten sind möglicherweise veraltet.");
    expect(lead("v1.2 is out. Update")).toEqual(["v1.2 is out.", "Update"]);
    // "Nr. 0042" is an abbreviation before a number, not the end of the title.
    expect(lead(t("quote.openBanner", { no: quoteNo(42, "de-DE"), date: date("2026-11-16T10:00:00Z", "de-DE") })))
      .toEqual(["Angebot Nr. 0042 · gespeichert am 16.11.2026.", "Platten und Preise sind wie gespeichert."]);
    setLocale("es");
    expect(lead(t("quote.openBanner", { no: quoteNo(42, "es"), date: "16 nov 2026" }))[0]).toBe("Presupuesto n.º 0042 · guardado el 16 nov 2026.");
  });
});
