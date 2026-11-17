import { beforeEach, describe, expect, test } from "vitest";
import { currentLocale, intlLocale, LOCALES, resolveLocale, setLocale, t, type Locale } from "../src/i18n";
import { de } from "../src/i18n/de";
import { es } from "../src/i18n/es";
import { column, messages } from "../src/i18n/messages";
import { pl } from "../src/i18n/pl";
import { zhCN } from "../src/i18n/zh-CN";

const en = column(0);
const ptBR = column(1);
const DICTS: Record<Locale, Record<string, string>> = { en, "pt-BR": ptBR, es, de, "zh-CN": zhCN, pl };
const ADDED = ["es", "de", "zh-CN", "pl"] as const;

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

describe("dictionaries", () => {
  test("there is one dictionary per language the plugin offers", () => {
    expect(Object.keys(DICTS).sort()).toEqual([...LOCALES].sort());
  });
  test("column() gives every key in both languages; a one-item row reuses the English text", () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(messages).sort());
    expect(Object.keys(en).sort()).toEqual(Object.keys(messages).sort());
    const same = Object.entries(messages).filter(([, v]) => v.length === 1);
    expect(same.length).toBeGreaterThan(0);
    for (const [k] of same) expect(ptBR[k]).toBe(en[k]);
    expect(en["nav.quotes"]).not.toBe(ptBR["nav.quotes"]);
  });
  // Polish adds _few and _many next to every _one / _other pair (also enforced by the PluralExtraKey type).
  const polishForms = Object.keys(messages).filter((k) => k.endsWith("_one")).flatMap((k) => [k.replace(/_one$/, "_few"), k.replace(/_one$/, "_many")]);
  test.each(LOCALES)("%s has exactly the keys of the table (also enforced by the MessageKey type)", (lang) => {
    expect(Object.keys(DICTS[lang]).sort()).toEqual([...Object.keys(messages), ...(lang === "pl" ? polishForms : [])].sort());
  });
  test("pl: every _few and _many form has the placeholders of its _other form", () => {
    expect(polishForms.length).toBeGreaterThan(20);
    for (const k of polishForms) expect(placeholders(pl[k as keyof typeof pl]), k).toBe(placeholders(en[k.replace(/_(few|many)$/, "_other")]!));
  });
  test.each(LOCALES)("%s: no empty values", (lang) => {
    for (const [k, v] of Object.entries(DICTS[lang])) expect(v.trim(), k).not.toBe("");
  });
  test.each(LOCALES)("%s: placeholders match English", (lang) => {
    for (const k of Object.keys(en)) expect(placeholders(DICTS[lang][k] ?? ""), k).toBe(placeholders(en[k] ?? ""));
  });
  test("every _one has an _other and vice versa", () => {
    for (const k of Object.keys(en)) {
      if (k.endsWith("_one")) expect(en[k.replace(/_one$/, "_other")], k).toBeDefined();
      if (k.endsWith("_other")) expect(en[k.replace(/_other$/, "_one")], k).toBeDefined();
    }
  });
  test("engine pretty ids and channel codes have labels; dropped engine codes do not", () => {
    for (const id of ["none", "round", "ending9", "step5"]) expect(en[`pretty.${id}`], id).toBeDefined();
    for (const code of ["name_empty", "no_tiers", "too_many_tiers", "not_natural", "first_tier_not_zero", "tiers_not_ascending", "pct_plus_tax_too_high", "duplicate_id"]) expect(en[`channel.def.${code}`], code).toBeDefined();
    expect(en["channel.def.rates_missing"]).toBeUndefined();
    expect(en["channel.def.currency_mismatch"]).toBeUndefined();
  });
  test.each(LOCALES)("%s: no marketplace names and no exclamation marks", (lang) => {
    for (const [k, v] of Object.entries(DICTS[lang])) { expect(v, k).not.toMatch(/Etsy|Shopee|Mercado/); expect(v, k).not.toMatch(/[!！¡]/); }
  });
  test("each language is listed under its own name, the same in every language", () => {
    for (const lang of LOCALES) {
      expect(DICTS[lang]["lang.en"]).toBe("English");
      expect(DICTS[lang]["lang.pt"]).toBe("Português (Brasil)");
      expect(DICTS[lang]["lang.es"]).toBe("Español");
      expect(DICTS[lang]["lang.de"]).toBe("Deutsch");
      expect(DICTS[lang]["lang.zh"]).toBe("简体中文");
      expect(DICTS[lang]["lang.pl"]).toBe("Polski");
    }
  });
});

// Text that is rightly the same as English: names, symbols-only rows and words the language shares with English.
const NAMES = ["app.name", "app.short", "lang.en", "lang.pt", "lang.es", "lang.de", "lang.zh", "lang.pl", "plates.meta", "quote.csv", "settings.group.spoolman", "channel.feeSummary"];
const SAME_AS_ENGLISH: Record<(typeof ADDED)[number], string[]> = {
  es: [...NAMES, "summary.labor", "field.margin", "extras.add", "line.extras", "quotes.col.total", "sheet.subtotal", "sheet.total", "setup.timeDone", "common.labelValue"],
  de: [...NAMES, "spoolman.offline", "match.source.name", "summary.labor", "field.extraName", "extras.add", "line.filament", "line.extras", "bar.details", "field.name",
    "sheet.logo", "sheet.website", "stock.col.name", "about.version", "common.labelValue", "help.filament.title", "req.optional"],
  "zh-CN": NAMES,
  pl: [...NAMES, "spoolman.offline", "match.source.name", "match.price.filament", "summary.labor", "line.filament", "stock.col.name", "help.filament.title",
    "sheet.logo", "common.labelValue"],
};

describe("Spanish, German, Chinese and Polish leave nothing in English", () => {
  test.each(ADDED)("%s: every value is translated, bar the listed names and shared words", (lang) => {
    const same = Object.keys(en).filter((k) => DICTS[lang][k] === en[k]);
    expect(same.sort()).toEqual([...SAME_AS_ENGLISH[lang]].sort());
  });
  test("zh-CN: every translated value is written in Chinese", () => {
    const wordless = (k: string) => !/[a-z]/i.test(en[k]!.replace(/\{\w+\}/g, "")); // "{label}: {value}" has only its punctuation to translate
    for (const [k, v] of Object.entries(zhCN)) if (!NAMES.includes(k) && !wordless(k)) expect(v, k).toMatch(/\p{Script=Han}/u);
  });
  test("zh-CN: punctuation is Chinese (no ASCII comma, colon, semicolon, question mark, brackets or sentence stop)", () => {
    for (const [k, v] of Object.entries(zhCN)) {
      if (NAMES.includes(k)) continue;
      const text = v.replace(/https?:\/\//g, "").replace(/\{\w+\}/g, "x");
      expect(text, k).not.toMatch(/[,;:?()]|\.(\s|$)|\.\.\./);
    }
  });
  test("de: formal address only (Sie, never du)", () => {
    for (const [k, v] of Object.entries(de)) expect(v, k).not.toMatch(/\b(du|dich|dir|dein|deine|deinen|deinem|deiner|euch|euer|eure)\b/i);
  });
  test("es: formal address only (usted: no tú or vosotros pronouns, no sentence opening with a tú imperative)", () => {
    for (const [k, v] of Object.entries(es)) {
      expect(v, k).not.toMatch(/(^|[\s¿«“"(])(tú|tu|tus|ti|contigo|vosotros|vuestr[oa]s?)(?=[\s.,:;?»”")]|$)/i);
      expect(v, k).not.toMatch(/(^|[.:] )(Usa|Elige|Lamina|Guarda|Introduce|Revisa|Añade|Corrige|Conecta|Comprueba|Haz|Abre|Pon|Define|Reduce)\s/);
    }
  });
  test("pl: informal address (ty), never Pan / Pani", () => {
    for (const [k, v] of Object.entries(pl)) expect(v, k).not.toMatch(/\b(Pan|Pani|Państwo|Pana|Panu|Pańsk\w*)\b/);
  });
  test("pl: Polish quotation marks, never English curly quotes", () => {
    for (const [k, v] of Object.entries(pl)) expect(v, k).not.toMatch(/[“"]/);
  });
  test("pl: shared terms follow OrcaSlicer's own Polish", () => {
    expect([pl["plate.title"], pl["line.filament"], pl["settings.group.printers"], pl["nav.settings"], pl["plates.refresh"], pl["plates.importCancel"], pl["quotes.delete"], pl["common.undo"]])
      .toEqual(["Płyta {n}", "Filament", "Drukarki", "Ustawienia", "Odśwież", "Anuluj", "Usuń", "Cofnij"]);
    expect(pl["help.plates.body"]).toContain("„Potnij wszystkie płyty”");
    expect(pl["import.error.notSliced"]).toContain("Plik › Eksportuj › Eksportuj wszystkie pocięte płyty");
  });
  test("shared terms follow OrcaSlicer's own translations", () => {
    // OrcaSlicer.mo: Plate, Slice all, Filament, Preset (as "profile" in es/de), Printers, Settings, Refresh, Cancel, Delete, Undo
    expect([es["plate.title"], de["plate.title"], zhCN["plate.title"]]).toEqual(["Cama {n}", "Platte {n}", "盘 {n}"]);
    expect(es["help.plates.body"]).toContain("Laminar todo");
    expect(de["help.plates.body"]).toContain("Alle Platten slicen");
    expect(zhCN["help.plates.body"]).toContain("切片所有盘");
    expect([es["line.filament"], de["line.filament"], zhCN["line.filament"]]).toEqual(["Filamento", "Filament", "耗材丝"]);
    expect([es["match.source.preset"], de["match.source.preset"], zhCN["match.source.preset"]]).toEqual(["Precio del perfil", "Profilpreis", "预设价格"]);
    expect([es["settings.group.printers"], de["settings.group.printers"], zhCN["settings.group.printers"]]).toEqual(["Impresoras", "Drucker", "打印机"]);
    expect([es["nav.settings"], de["nav.settings"], zhCN["nav.settings"]]).toEqual(["Ajustes", "Einstellungen", "设置"]);
    expect([es["plates.refresh"], de["plates.refresh"], zhCN["plates.refresh"]]).toEqual(["Actualizar", "Aktualisieren", "刷新"]);
    expect([es["plates.importCancel"], de["plates.importCancel"], zhCN["plates.importCancel"]]).toEqual(["Cancelar", "Abbrechen", "取消"]);
    expect([es["quotes.delete"], de["quotes.delete"], zhCN["quotes.delete"]]).toEqual(["Eliminar", "Löschen", "删除"]);
    expect([es["stock.col.spools"], de["stock.col.spools"], zhCN["stock.col.spools"]]).toEqual(["Carretes", "Spulen", "料盘"]);
    // the menu path is the one OrcaSlicer shows in that language
    expect(es["import.error.notSliced"]).toContain("Archivo › Exportar › Exportar todos los objetos laminados a un archivo");
    expect(de["import.error.notSliced"]).toContain("Datei › Exportieren › Exportiere alle Platten als STL Dateien");
    expect(zhCN["import.error.notSliced"]).toContain("文件 › 导出 › 导出所有切片文件");
  });
});

describe("locale selection and t()", () => {
  beforeEach(() => setLocale("en"));
  test("saved setting wins, then host locale, then en", () => {
    expect(resolveLocale("pt-BR", "en-US")).toBe("pt-BR");
    expect(resolveLocale("en", "pt-BR")).toBe("en");
    expect(resolveLocale("auto", "pt-PT")).toBe("pt-BR");
    expect(resolveLocale("auto", "fr-FR")).toBe("en");
    expect(resolveLocale(null, undefined)).toBe("en");
  });
  test.each([
    ["es", "es"], ["es_ES", "es"], ["es-MX", "es"], ["ES", "es"],
    ["de", "de"], ["de_DE", "de"], ["de-AT", "de"],
    ["pl", "pl"], ["pl_PL", "pl"], ["pl-PL", "pl"], ["PL", "pl"], [" pl_pl ", "pl"],
    ["zh_CN", "zh-CN"], ["zh-CN", "zh-CN"], ["zh", "zh-CN"], ["zh-Hans", "zh-CN"], ["zh_TW", "zh-CN"], ["zh-Hant-HK", "zh-CN"],
    ["pt_BR", "pt-BR"], ["pt", "pt-BR"], ["en", "en"], ["en_US", "en"],
  ] as const)("OrcaSlicer or browser language %s selects %s", (code, locale) => {
    expect(resolveLocale("auto", code)).toBe(locale);
  });
  test.each(["fr", "ja", "ko_KR", "it_IT", "nl", "dev", "esperanto", "", "  ", "constructor", "__proto__", "toString"])("unknown language %j falls back to English", (code) => {
    expect(resolveLocale("auto", code)).toBe("en");
  });
  test.each(ADDED)("a manual choice of %s wins over any OrcaSlicer language, and a saved value that is no language is ignored", (lang) => {
    expect(resolveLocale(lang, "pt_BR")).toBe(lang);
    expect(setLocale(lang, "en")).toBe(lang);
    expect(currentLocale()).toBe(lang);
    expect(document.documentElement.lang).toBe(lang);
    expect(resolveLocale("klingon" as never, lang)).toBe(lang);
  });
  test("each language formats with its own Intl tag", () => {
    const tags = LOCALES.map((l) => { setLocale(l); return intlLocale(); });
    expect(tags).toEqual(["en-US", "pt-BR", "es", "de-DE", "zh-CN", "pl-PL"]);
    for (const tag of tags) expect(Intl.NumberFormat.supportedLocalesOf(tag), tag).toEqual([tag]);
  });
  test("params and plurals", () => {
    expect(t("plate.title", { n: 2 })).toBe("Plate 2");
    expect(t("plates.count", { n: 1 })).toBe("1 plate");
    expect(t("plates.count", { n: 3 })).toBe("3 plates");
    setLocale("pt-BR");
    expect(t("plates.count", { n: 1 })).toBe("1 placa");
    expect(t("plates.count", { n: 2 })).toBe("2 placas");
    expect(t("nav.quotes")).toBe("Orçamentos");
  });
  test("plurals in Spanish, German and Chinese", () => {
    setLocale("es");
    expect([t("plates.count", { n: 1 }), t("plates.count", { n: 2 }), t("plates.count", { n: 0 })]).toEqual(["1 cama", "2 camas", "0 camas"]);
    expect(t("plates.count", { n: 1_000_000 })).toBe("1000000 camas"); // CLDR "many" in Spanish reads the _other text
    setLocale("de");
    expect([t("qty.runs", { n: 1 }), t("qty.runs", { n: 2 }), t("qty.runs", { n: 0 })]).toEqual(["1 Durchlauf", "2 Durchläufe", "0 Durchläufe"]);
    expect([t("qty.pieces", { n: 1 }), t("qty.pieces", { n: 5 })]).toEqual(["1 Stück", "5 Stück"]);
    setLocale("zh-CN");
    expect([t("plates.count", { n: 1 }), t("plates.count", { n: 3 })]).toEqual(["1 个盘", "3 个盘"]);
    expect(t("nav.quotes")).toBe("报价列表");
    expect(t("sheet.quote", { no: "#0001" })).toBe("报价单 #0001"); // the sheet keeps its name; the list is 报价列表
  });
  test("Polish plurals: one, few and many (1, 2, 5, 12, 22)", () => {
    setLocale("pl");
    const forms = (key: string) => [1, 2, 5, 12, 22].map((n) => t(key, { n }));
    expect(forms("plates.count")).toEqual(["1 płyta", "2 płyty", "5 płyt", "12 płyt", "22 płyty"]);
    expect(forms("qty.pieces")).toEqual(["1 sztuka", "2 sztuki", "5 sztuk", "12 sztuk", "22 sztuki"]);
    expect(forms("quotes.count")).toEqual(["1 wycena", "2 wyceny", "5 wycen", "12 wycen", "22 wyceny"]);
    expect(forms("qty.runs")).toEqual(["1 cykl", "2 cykle", "5 cykli", "12 cykli", "22 cykle"]);
    expect([t("plates.count", { n: 0 }), t("plates.count", { n: 112 }), t("plates.count", { n: 1.5 })]).toEqual(["0 płyt", "112 płyt", "1.5 płyty"]);
    setLocale("de");
    expect(t("qty.runs", { n: 5 })).toBe("5 Durchläufe"); // a language without _many reads _other
  });
  test("Orca language overrides the browser only for automatic language", () => {
    expect(setLocale("auto", "pt_BR")).toBe("pt-BR");
    expect(setLocale("auto", "pt-BR")).toBe("pt-BR");
    expect(setLocale("en", "pt_BR")).toBe("en");
    expect(setLocale("pt-BR", "en_US")).toBe("pt-BR");
    expect(setLocale("auto", "fr_FR")).toBe("en");
    expect(setLocale("auto", "es")).toBe("es");
    expect(setLocale("auto", "de")).toBe("de");
    expect(setLocale("auto", "pl_PL")).toBe("pl");
    expect(setLocale("auto", "zh_CN")).toBe("zh-CN");
    expect(setLocale("auto", " zh_TW ")).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(setLocale("auto", null)).toBe(resolveLocale("auto", navigator.language));
    expect(setLocale("auto", " ")).toBe(resolveLocale("auto", navigator.language));
  });
  test("missing key renders the key", () => {
    expect(t("no.such.key")).toBe("no.such.key");
  });
});

// ---- every key is used, and every key a component asks for exists ----
const SOURCES = import.meta.glob("../src/**/*.{ts,vue}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const code = Object.entries(SOURCES).filter(([f]) => !f.includes("/i18n/messages.ts") && !f.includes("/mock/") && !f.includes("/engine/")).map(([, v]) => v).join("\n");

describe("key usage", () => {
  const keys = Object.keys(messages);
  const base = (k: string) => k.replace(/_(one|other)$/, "");
  const staticKeys = [...code.matchAll(/\bt\(\s*["']([A-Za-z0-9_.]+)["']/g)].map((m) => m[1]!);
  const prefixes = [...code.matchAll(/\bt\(\s*`([A-Za-z0-9_.]+?)\$\{/g)].map((m) => m[1]!);
  test("every static t('...') key exists", () => {
    const missing = staticKeys.filter((k) => !(k in messages) && !(`${k}_other` in messages));
    expect(missing).toEqual([]);
  });
  test("every dynamic t(`prefix.${...}`) has at least one key under its prefix", () => {
    expect(prefixes.filter((p) => !keys.some((k) => k.startsWith(p)))).toEqual([]);
  });
  test("no unused keys (named literally, under a dynamic prefix, or listed in a table)", () => {
    const unused = keys.filter((k) => {
      const b = base(k);
      if (code.includes(`"${b}"`) || code.includes(`'${b}'`) || code.includes(`\`${b}\``)) return false;
      return !prefixes.some((p) => b.startsWith(p));
    });
    expect(unused).toEqual([]);
  });
});
