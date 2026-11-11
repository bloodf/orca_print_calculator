import { describe, expect, test } from "vitest";
import { computeCost, type EngineInput } from "../src/engine/costs";
import { currencyDigits, formatMoney, kwhE4, parseMoney, parseScaled, separators } from "../src/engine/money";

describe("currencyDigits", () => {
  test.each([["JPY", 0], ["BRL", 2], ["USD", 2], ["EUR", 2], ["KWD", 3]])("%s", (c, d) => expect(currencyDigits(c as string)).toBe(d));
  test("invalid code throws RangeError", () => {
    expect(() => currencyDigits("NOPE1")).toThrow(RangeError);
    expect(() => currencyDigits("")).toThrow(RangeError);
  });
});

describe("parseMoney", () => {
  test.each([
    ["1,5", 2, 150], ["1.5", 2, 150], ["1.234,56", 2, 123456], ["1,234.56", 2, 123456],
    ["  R$ 1,5 ", 2, 150], ["$1,234.56", 2, 123456], ["1,5 €", 2, 150], ["12", 2, 1200],
    ["1.234.567,89", 2, 123456789], ["1,234,567.89", 2, 123456789],
    ["0.05", 2, 5], ["1.99", 2, 199], ["100", 0, 100], ["1.5", 3, 1500], ["0.001", 3, 1],
    [".5", 2, 50], [",5", 2, 50], ["1.234", 0, 1234],
  ])("%s @%i -> %i", (t, d, v) => expect(parseMoney(t as string, d as number)).toBe(v));

  test.each(["", "   ", "abc", "1,2,3", "1.2.3,4", "1,234,56", "1.23,4.5", "--1", "1e5", "1,", "1 2", ".", ","])(
    "garbage %j -> null", (t) => expect(parseMoney(t, 2)).toBeNull());
  test.each(["-1", "-0,5", "R$ -3,00", "(1,00)"])("negative %j -> null", (t) => expect(parseMoney(t, 2)).toBeNull());

  test("never returns an unsafe number", () => {
    expect(parseMoney("90071992547409,91", 2)).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseMoney("90071992547409,92", 2)).toBeNull();
    expect(parseMoney("9007199254740993", 0)).toBeNull();
    expect(parseMoney("99999999999999999999999999", 2)).toBeNull();
  });
});

describe("formatMoney", () => {
  test("round trips", () => {
    for (const [c, locale, text] of [["JPY", "ja-JP", "1234"], ["BRL", "pt-BR", "1234,56"], ["KWD", "en-US", "1234.567"], ["USD", "en-US", "0.07"]] as const) {
      const d = currencyDigits(c);
      const minor = parseMoney(text, d) as number;
      const shown = formatMoney(minor, c, locale);
      expect(parseMoney(shown, d)).toBe(minor);
    }
  });
  test("formats without float drift", () => {
    expect(formatMoney(123456, "BRL", "pt-BR").replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(formatMoney(1234, "JPY", "en-US")).toBe("¥1,234");
    expect(formatMoney(1234567, "KWD", "en-US").replace(/\s/g, " ")).toBe("KWD 1,234.567");
    expect(formatMoney(-5, "USD", "en-US")).toBe("-$0.05");
    expect(formatMoney(0, "USD", "en-US")).toBe("$0.00");
  });
  test("large exact value", () => {
    expect(formatMoney(Number.MAX_SAFE_INTEGER, "USD", "en-US")).toBe("$90,071,992,547,409.91");
  });
});

describe("kwhE4", () => {
  test("scales by digits+2", () => {
    expect(kwhE4("0,85", 2)).toBe(8500);
    expect(kwhE4("0.85", 0)).toBe(85);
    expect(kwhE4("0.850", 3)).toBe(85000);
    expect(kwhE4("x", 2)).toBeNull();
  });

  const energy = (digits: number, price: string) => {
    const input: EngineInput = {
      materials: [], printSeconds: 36000, unitsPerPrint: 1,
      machine: { wattsW10: 10000, acquisitionCents: 0, lifetimeHours: 0 }, kwhE4: kwhE4(price, digits) as number,
      failure: { bp: 0, mode: "markup", includesMachine: false }, depreciationEnabled: false,
      maintenancePerHourCents: 0, labor: { perHourCents: 0, minutes: 0 }, fixedCostPerPrintHourCents: 0, extras: [], quantity: 1,
    };
    return computeCost(input).lines.find((l) => l.id === "energy")?.cents;
  };

  test("same physical inputs agree across 0/2/3-digit currencies (1000 W x 10 h = 10 kWh)", () => {
    expect(energy(0, "1")).toBe(10);
    expect(energy(2, "1,00")).toBe(1000);
    expect(energy(3, "1.000")).toBe(10000);
    expect(energy(2, "0.85")).toBe(850);
    expect(energy(3, "0.850")).toBe(8500);
    expect((energy(2, "0.85") as number) * 10).toBe(energy(3, "0.850"));
  });
});

describe("separators", () => {
  test.each([
    ["en-US", ".", ","], ["pt-BR", ",", "."], ["de-DE", ",", "."], ["fr-FR", ",", "\u202f"], ["de-CH", ".", "'"],
  ])("%s", (l, decimal, group) => expect(separators(l as string)).toEqual({ decimal, group }));
});

describe("parseMoney with locale", () => {
  test.each([
    ["en-US", "1,234.56", 2, 123456], ["en-US", "1234.5", 2, 123450], ["en-US", "1,234", 2, 123400], ["en-US", "$1,234,567.89", 2, 123456789],
    ["pt-BR", "1.234,56", 2, 123456], ["pt-BR", "1,5", 2, 150], ["pt-BR", "R$ 1.234", 2, 123400], ["pt-BR", "1.234.567", 2, 123456700],
    ["pt-BR", "1.5", 2, 150], ["pt-BR", "12.50", 2, 1250], ["pt-BR", "1.234", 2, 123400], ["pt-BR", ",5", 2, 50], ["en-US", ".5", 2, 50], ["pt-BR", "1 234,5", 2, 123450],
    ["de-DE", "1.234,56", 2, 123456], ["de-DE", "1.234", 2, 123400], ["de-DE", "12,5 €", 2, 1250],
    ["fr-FR", "1\u202f234,56", 2, 123456], ["fr-FR", "1\u00a0234,56", 2, 123456], ["fr-FR", "1 234,56", 2, 123456], ["fr-FR", "1,5", 2, 150],
    ["de-CH", "1\u2019234.56", 2, 123456], ["de-CH", "1'234.56", 2, 123456], ["de-CH", "1'234'567", 2, 123456700],
    ["ja-JP", "1,234", 0, 1234], ["ja-JP", "1234", 0, 1234], ["ja-JP", "\u00a51,234,567", 0, 1234567],
  ])("%s %j @%i -> %i", (l, t, d, v) => expect(parseMoney(t as string, d as number, l as string)).toBe(v));

  test.each([
    ["en-US", "1,5"], ["en-US", "1,23"], ["pt-BR", "1.23.4"], ["pt-BR", "1,234,56"], ["pt-BR", "1.234,5,6"], ["pt-BR", "12.34.567"],
    ["fr-FR", "1 23,4"], ["de-CH", "1'23.4"], ["pt-BR", "1,"], ["pt-BR", "abc"], ["pt-BR", ""], ["pt-BR", "1.234,56,7"], ["ja-JP", "1,23"],
  ])("garbage %s %j -> null", (l, t) => expect(parseMoney(t as string, 2, l as string)).toBeNull());

  test.each(["-1", "-0,5", "(1,00)", "R$ -3,00"])("negative %j -> null", (t) => expect(parseMoney(t, 2, "pt-BR")).toBeNull());

  test("no locale: more fraction digits than the currency has is ambiguous", () => {
    expect(parseMoney("1.234", 2)).toBeNull();
    expect(parseMoney("1.234", 2, "pt-BR")).toBe(123400);
  });

  test("kwhE4 with locale", () => {
    expect(kwhE4("0,95", 2, "pt-BR")).toBe(9500);
    expect(kwhE4("1.000", 2, "pt-BR")).toBe(10000000);
    expect(kwhE4("0.12345", 2)).toBe(1235); // 1234.5 -> half-up
    expect(kwhE4("0,123456", 2, "pt-BR")).toBe(1235);
  });
});

describe("parseScaled", () => {
  test.each([
    ["12,5", 100, "pt-BR", 1250], ["12.5", 100, "en-US", 1250], ["2,5", 3600, "pt-BR", 9000], ["110", 10, "pt-BR", 1100],
    ["24,5", 1000, "pt-BR", 24500], ["1.234,5", 1000, "pt-BR", 1234500], ["0,0005", 1000, "pt-BR", 1], ["0,0004", 1000, "pt-BR", 0],
    ["1,5", 1000, undefined, 1500], ["3", 1, "en-US", 3], ["1\u202f000", 10, "fr-FR", 10000],
  ])("%j x%i (%s) -> %i", (t, scale, l, v) => expect(parseScaled(t as string, scale as number, l as string | undefined)).toBe(v));

  test.each(["", "abc", "-1", "1e3", "1,2,3"])("garbage %j -> null", (t) => expect(parseScaled(t, 100, "pt-BR")).toBeNull());
  test("unsafe -> null", () => expect(parseScaled("9007199254740993", 100, "en-US")).toBeNull());
});

describe("review T2.6 H4: extra fraction digits are ambiguous, never silently rounded", () => {
  test.each([
    ["1.234", 2, "en-US"], ["25.000", 2, "en-US"], ["1.234", 2, "ja-JP"], ["1.234", 2, "de-CH"],
    ["1.234", 0, "en-US"], ["1.234", 0, "ja-JP"], ["12.50", 0, "en-US"], ["1.5", 0, "en-US"], ["1.5", 0, "ja-JP"],
    ["1,234", 2, "pt-BR"], ["0.500", 2, "pt-BR"], ["1.0005", 3, "en-US"],
  ])("%j @%i %s -> null", (t, d, l) => expect(parseMoney(t as string, d as number, l as string)).toBeNull());
  test.each([["0.005", 2], ["1.995", 2], ["1,5", 0], ["0.0005", 3]])("no locale %j @%i -> null", (t, d) => expect(parseMoney(t as string, d as number)).toBeNull());
});
