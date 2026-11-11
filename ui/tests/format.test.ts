import { describe, expect, test } from "vitest";
import { bytes, count, duration, grams, money, moneyError, moneyPlain, percent, perKwh, quoteNo, slicedTime, watts, currencySymbol } from "../src/format";

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
