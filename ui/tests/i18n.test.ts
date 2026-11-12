import { beforeEach, describe, expect, test } from "vitest";
import { resolveLocale, setLocale, t } from "../src/i18n";
import { column, messages } from "../src/i18n/messages";

const en = column(0);
const ptBR = column(1);

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

describe("dictionaries", () => {
  test("column() gives every key in both languages; a one-item row reuses the English text", () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(messages).sort());
    expect(Object.keys(en).sort()).toEqual(Object.keys(messages).sort());
    const same = Object.entries(messages).filter(([, v]) => v.length === 1);
    expect(same.length).toBeGreaterThan(0);
    for (const [k] of same) expect(ptBR[k]).toBe(en[k]);
    expect(en["nav.quotes"]).not.toBe(ptBR["nav.quotes"]);
  });
  test("no empty values", () => {
    for (const d of [en, ptBR]) for (const [k, v] of Object.entries(d)) expect(v.trim(), k).not.toBe("");
  });
  test("placeholders match between languages", () => {
    for (const k of Object.keys(en)) expect(placeholders(ptBR[k] ?? ""), k).toBe(placeholders(en[k] ?? ""));
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
  test("no marketplace names and no exclamation marks", () => {
    for (const d of [en, ptBR]) for (const [k, v] of Object.entries(d)) { expect(v, k).not.toMatch(/Etsy|Shopee|Mercado/); expect(v, k).not.toContain("!"); }
  });
});

describe("locale selection and t()", () => {
  beforeEach(() => setLocale("en"));
  test("saved setting wins, then host locale, then en", () => {
    expect(resolveLocale("pt-BR", "en-US")).toBe("pt-BR");
    expect(resolveLocale("en", "pt-BR")).toBe("en");
    expect(resolveLocale("auto", "pt-PT")).toBe("pt-BR");
    expect(resolveLocale("auto", "de-DE")).toBe("en");
    expect(resolveLocale(null, undefined)).toBe("en");
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
  test("Orca language overrides the browser only for automatic language", () => {
    expect(setLocale("auto", "pt_BR")).toBe("pt-BR");
    expect(setLocale("auto", "pt-BR")).toBe("pt-BR");
    expect(setLocale("en", "pt_BR")).toBe("en");
    expect(setLocale("pt-BR", "en_US")).toBe("pt-BR");
    expect(setLocale("auto", "fr_FR")).toBe("en");
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
