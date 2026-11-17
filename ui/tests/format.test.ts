import { describe, expect, test } from "vitest";
import { bytes, count, date, duration, grams, money, moneyError, moneyPlain, percent, perKwh, quoteNo, slicedTime, watts, currencySymbol } from "../src/format";

describe("format", () => {
  test("money per locale and currency digits", () => {
    expect(money(123450, "BRL", "pt-BR").replace(/\s/g, " ")).toBe("R$ 1.234,50");
    expect(money(123450, "USD", "en-US")).toBe("$1,234.50");
    expect(money(1235, "JPY", "en-US")).toContain("1,235");
    expect(money(1500, "KWD", "en-US")).toContain("1.500");
  });
  test("moneyPlain field text", () => {
    expect(moneyPlain(123450, 2, "pt-BR")).toBe("1.234,50");
    expect(moneyPlain(123450, 2, "en-US")).toBe("1,234.50");
    expect(moneyPlain(5, 2, "en-US")).toBe("0.05");
    expect(moneyPlain(1235, 0, "en-US")).toBe("1,235");
    expect(currencySymbol("BRL", "pt-BR")).toBe("R$");
  });
  test("perKwh keeps two extra digits, trims zeros to currency digits", () => {
    expect(perKwh(9500, "BRL", "pt-BR").replace(/\s/g, " ")).toBe("R$ 0,95/kWh");
    expect(perKwh(9512, "BRL", "pt-BR").replace(/\s/g, " ")).toBe("R$ 0,9512/kWh");
    expect(perKwh(1450, "USD", "en-US")).toBe("$0.145/kWh");
  });
  test("percent", () => {
    expect(percent(2970, "en-US")).toBe("29.7%");
    expect(percent(2970, "pt-BR").replace(/\s/g, "")).toBe("29,7%");
    expect(percent(3000, "en-US")).toBe("30%");
  });
  test("duration: two largest units; pt-BR says min", () => {
    expect(duration(8040, "en-US")).toBe("2h 14m");
    expect(duration(8040, "pt-BR")).toBe("2h 14min");
    expect(duration(97200, "en-US")).toBe("1d 3h");
    expect(duration(2700, "en-US")).toBe("45m");
    expect(duration(30, "en-US")).toBe("30s");
    expect(duration(7200, "en-US")).toBe("2h");
  });
  test("grams / watts / count / bytes", () => {
    expect(grams(41, "en-US")).toBe("41 g");
    expect(grams(4.6, "en-US")).toBe("4.6 g");
    expect(grams(4.6, "pt-BR")).toBe("4,6 g");
    expect(grams(1240, "en-US")).toBe("1.24 kg");
    expect(grams(1240, "pt-BR")).toBe("1,24 kg");
    expect(watts(120, "en-US")).toBe("120 W");
    expect(count(1000, "en-US")).toBe("1,000");
    expect(count(1000, "pt-BR")).toBe("1.000");
    expect(bytes(2_621_440, "en-US")).toBe("2.5 MB");
  });
  test("quote number", () => {
    expect(quoteNo(42, "en-US")).toBe("#0042");
    expect(quoteNo(42, "pt-BR")).toBe("nº 0042");
  });
  test("slicedTime: time today, date and time on other days", () => {
    const now = new Date(2026, 10, 10, 18, 0);
    expect(slicedTime(new Date(2026, 10, 10, 14, 32).toISOString(), "en-US", now)).toMatch(/2:32/);
    expect(slicedTime(new Date(2026, 10, 9, 14, 32).toISOString(), "en-US", now)).toMatch(/11\/9\/26/);
    expect(slicedTime("garbage", "en-US", now)).toBe("");
  });
  test("moneyError separates decimals from garbage", () => {
    expect(moneyError("1,234", 2, "pt-BR")).toBe("decimals");
    expect(moneyError("12.50", 2, "en-US")).toBeNull();
    expect(moneyError("12.5", 0, "en-US")).toBe("decimals");
    expect(moneyError("abc", 2, "en-US")).toBe("number");
    expect(moneyError("-3", 2, "en-US")).toBe("number");
  });
});

// Spanish ("es"), German ("de-DE") and Simplified Chinese ("zh-CN"): the Intl tags i18n.ts gives those languages.
// Intl separates number and symbol with a no-break space; `sp` makes it an ordinary one.
const sp = (s: string): string => s.replace(/[\u00a0\u202f]/g, " ");
describe("format in Spanish, German and Chinese", () => {
  test("money keeps the chosen currency and takes the language's separators and symbol place", () => {
    expect(sp(money(123450, "EUR", "de-DE"))).toBe("1.234,50 €");
    expect(sp(money(123450, "USD", "de-DE"))).toBe("1.234,50 $");
    expect(sp(money(123450, "BRL", "de-DE"))).toBe("1.234,50 R$");
    expect(sp(money(1235, "JPY", "de-DE"))).toBe("1.235 ¥");
    expect(sp(money(1234550, "EUR", "es"))).toBe("12.345,50 €");
    expect(sp(money(123450, "EUR", "es"))).toBe("1234,50 €"); // Spanish groups from five digits
    expect(sp(money(1234550, "USD", "es"))).toBe("12.345,50 US$");
    expect(money(123450, "CNY", "zh-CN")).toBe("¥1,234.50");
    expect(money(123450, "USD", "zh-CN")).toBe("US$1,234.50");
    expect(money(123450, "EUR", "zh-CN")).toBe("€1,234.50");
    expect(money(1500, "KWD", "zh-CN")).toContain("1.500");
  });
  test("field text and currency symbol", () => {
    expect(moneyPlain(123450, 2, "de-DE")).toBe("1.234,50");
    expect(moneyPlain(1234550, 2, "es")).toBe("12.345,50");
    expect(moneyPlain(123450, 2, "zh-CN")).toBe("1,234.50");
    expect(moneyPlain(5, 2, "de-DE")).toBe("0,05");
    expect([currencySymbol("EUR", "de-DE"), currencySymbol("EUR", "es"), currencySymbol("CNY", "zh-CN"), currencySymbol("USD", "zh-CN")]).toEqual(["€", "€", "¥", "US$"]);
  });
  test("energy price and percent", () => {
    expect(sp(perKwh(3550, "EUR", "de-DE"))).toBe("0,355 €/kWh");
    expect(sp(perKwh(1450, "EUR", "es"))).toBe("0,145 €/kWh");
    expect(perKwh(6000, "CNY", "zh-CN")).toBe("¥0.60/kWh");
    expect(sp(percent(2970, "de-DE"))).toBe("29,7 %");
    expect(sp(percent(2970, "es"))).toBe("29,7 %");
    expect(percent(2970, "zh-CN")).toBe("29.7%");
    expect(sp(percent(-500, "de-DE"))).toBe("\u22125 %");
  });
  test("duration: min in Spanish, spaced units in German, words without spaces in Chinese", () => {
    const l = "es";
    expect([duration(8040, l), duration(97200, l), duration(2700, l), duration(30, l), duration(7200, l), duration(86400, l)]).toEqual(["2h 14min", "1d 3h", "45min", "30s", "2h", "1d"]);
    const g = "de-DE";
    expect([duration(8040, g), duration(97200, g), duration(2700, g), duration(30, g), duration(7200, g), duration(86400, g)]).toEqual(["2 h 14 min", "1 d 3 h", "45 min", "30 s", "2 h", "1 d"]);
    expect([duration(8040, "zh-CN"), duration(97200, "zh-CN"), duration(2700, "zh-CN"), duration(30, "zh-CN"), duration(7200, "zh-CN"), duration(86400, "zh-CN")])
      .toEqual(["2小时14分钟", "1天3小时", "45分钟", "30秒", "2小时", "1天"]);
  });
  test("grams, watts, count and bytes", () => {
    expect([grams(4.6, "de-DE"), grams(1240, "de-DE"), grams(41, "de-DE")]).toEqual(["4,6 g", "1,24 kg", "41 g"]);
    expect([grams(4.6, "es"), grams(1240, "es")]).toEqual(["4,6 g", "1,24 kg"]);
    expect([grams(4.6, "zh-CN"), grams(1240, "zh-CN")]).toEqual(["4.6 g", "1.24 kg"]);
    expect([count(10000, "de-DE"), count(10000, "es"), count(10000, "zh-CN")]).toEqual(["10.000", "10.000", "10,000"]);
    expect([watts(1200, "de-DE"), watts(1200, "zh-CN")]).toEqual(["1.200 W", "1,200 W"]);
    expect([bytes(2_621_440, "de-DE"), bytes(2_621_440, "es"), bytes(2_621_440, "zh-CN")]).toEqual(["2,5 MB", "2,5 MB", "2.5 MB"]);
  });
  test("quote number", () => {
    expect([quoteNo(42, "es"), quoteNo(42, "de-DE"), quoteNo(42, "zh-CN")]).toEqual(["n.º 0042", "Nr. 0042", "#0042"]);
  });
  test("dates", () => {
    const day = new Date(2026, 10, 16, 12).toISOString();
    expect(date(day, "de-DE")).toBe("16.11.2026");
    expect(date(day, "es")).toBe("16 nov 2026");
    expect(date(day, "zh-CN")).toBe("2026年11月16日");
    const now = new Date(2026, 10, 10, 18, 0);
    const sliced = new Date(2026, 10, 9, 14, 32).toISOString();
    expect(slicedTime(new Date(2026, 10, 10, 14, 32).toISOString(), "de-DE", now)).toBe("14:32");
    expect(slicedTime(sliced, "de-DE", now)).toBe("09.11.26, 14:32");
    expect(slicedTime(sliced, "es", now)).toBe("9/11/26, 14:32");
    expect(slicedTime(sliced, "zh-CN", now)).toBe("2026/11/9 14:32");
  });
  test("typed money is read with the language's separators, and garbage is still refused", () => {
    expect(moneyError("1.234,50", 2, "de-DE")).toBeNull();
    expect(moneyError("1234,50", 2, "es")).toBeNull();
    expect(moneyError("12.345,50", 2, "es")).toBeNull();
    expect(moneyError("1,234.50", 2, "zh-CN")).toBeNull();
    expect(moneyError("1,234", 2, "de-DE")).toBe("decimals");
    expect(moneyError("abc", 2, "zh-CN")).toBe("number");
  });
});

// Polish ("pl-PL"): decimal comma, space-grouped thousands, złoty after the number, spaced units.
describe("format in Polish", () => {
  const l = "pl-PL";
  test("money, field text, symbol, energy price and percent", () => {
    expect(sp(money(1234550, "PLN", l))).toBe("12 345,50 zł");
    expect(sp(money(123450, "PLN", l))).toBe("1234,50 zł"); // Polish, like Spanish, groups from five digits
    expect(sp(money(123450, "EUR", l))).toBe("1234,50 €");
    expect(sp(moneyPlain(1234550, 2, l))).toBe("12 345,50");
    expect(currencySymbol("PLN", l)).toBe("zł");
    expect(sp(perKwh(11500, "PLN", l))).toBe("1,15 zł/kWh");
    expect(sp(percent(2970, l))).toBe("29,7%");
  });
  test("duration, grams, quote number and dates", () => {
    expect([duration(8040, l), duration(97200, l), duration(2700, l), duration(30, l)]).toEqual(["2 h 14 min", "1 d 3 h", "45 min", "30 s"]);
    expect([grams(4.6, l), grams(1240, l)]).toEqual(["4,6 g", "1,24 kg"]);
    expect(quoteNo(42, l)).toBe("nr 0042");
    expect(date(new Date(2026, 10, 16, 12).toISOString(), l)).toBe("16 lis 2026");
    expect(slicedTime(new Date(2026, 10, 9, 14, 32).toISOString(), l, new Date(2026, 10, 10, 18, 0))).toBe("9.11.2026, 14:32");
  });
  test("typed money is read with Polish separators", () => {
    expect(moneyError("1234,50", 2, l)).toBeNull();
    expect(moneyError("1 234,50", 2, l)).toBeNull();
    expect(moneyError("abc", 2, l)).toBe("number");
  });
});
