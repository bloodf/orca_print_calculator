import { describe, expect, test } from "vitest";
import { checkText, clamp, formatNum, keyDelta, type NumSpec } from "../src/components/base/numeric";

const money2: NumSpec = { scale: 100, money: { digits: 2, currency: "BRL" } };
const money0: NumSpec = { scale: 1, money: { digits: 0, currency: "JPY" } };
const pct: NumSpec = { scale: 100 };

describe("formatNum", () => {
  test("locale grouping and fixed money decimals", () => {
    expect(formatNum(123450, money2, "pt-BR")).toBe("1.234,50");
    expect(formatNum(123450, money2, "en-US")).toBe("1,234.50");
    expect(formatNum(1235, money0, "en-US")).toBe("1,235");
  });
  test("percent trims zeros", () => {
    expect(formatNum(3000, pct, "en-US")).toBe("30");
    expect(formatNum(2970, pct, "pt-BR")).toBe("29,7");
  });
  test("non power-of-ten scale uses division", () => {
    expect(formatNum(7200, { scale: 3600 }, "en-US")).toBe("2");
  });
});

describe("checkText", () => {
  const b = { min: 0, max: 9900 };
  test("pt-BR 1.234,5 and en-US 1,234.5 both parse", () => {
    expect(checkText("1.234,5", money2, {}, "pt-BR").value).toBe(123450);
    expect(checkText("1,234.5", money2, {}, "en-US").value).toBe(123450);
  });
  test("leading symbol and trailing unit are stripped", () => {
    expect(checkText("R$ 12,50", money2, {}, "pt-BR").value).toBe(1250);
    expect(checkText("30 %", pct, b, "en-US").value).toBe(3000);
  });
  test("too many decimals is its own error (pt-BR 1,234 at 2 digits)", () => {
    const r = checkText("1,234", money2, {}, "pt-BR");
    expect(r.value).toBeUndefined();
    expect(r.error).toEqual({ key: "field.error.decimals", params: { n: 2 } });
  });
  test("JPY 12.5 gives the no-decimals message", () => {
    const r = checkText("12.5", money0, {}, "en-US");
    expect(r.error).toEqual({ key: "field.error.noDecimals", params: { currency: "JPY" } });
  });
  test("garbage and negatives give the number error with a locale example", () => {
    expect(checkText("abc", money2, {}, "en-US").error?.key).toBe("field.error.number");
    expect(checkText("-3", money2, {}, "pt-BR").error).toEqual({ key: "field.error.number", params: { example: "1.234,50" } });
  });
  test("empty: required errors, nullable gives null, otherwise required", () => {
    expect(checkText("", money2, { required: true }, "en-US").error?.key).toBe("field.error.required");
    expect(checkText("  ", money2, { nullable: true }, "en-US")).toEqual({ value: null });
    expect(checkText("", pct, {}, "en-US").error?.key).toBe("field.error.required");
  });
  test("range errors name the bound in the locale", () => {
    expect(checkText("120", pct, b, "en-US").error).toEqual({ key: "field.error.max", params: { max: "99" } });
    expect(checkText("5", { scale: 1 }, { min: 10 }, "en-US").error).toEqual({ key: "field.error.min", params: { min: "10" } });
  });
  test("non-money fields round half-up and never show a decimals error", () => {
    expect(checkText("12,345", pct, { max: 99999 }, "pt-BR").value).toBe(1235);
  });
});

describe("keys", () => {
  const e = (key: string, shiftKey = false, altKey = false) => ({ key, shiftKey, altKey });
  test("step, shift x10, alt x0.1 (when allowed), page x10", () => {
    expect(keyDelta(e("ArrowUp"), 100, true)).toBe(100);
    expect(keyDelta(e("ArrowDown", true), 100, true)).toBe(-1000);
    expect(keyDelta(e("ArrowUp", false, true), 100, true)).toBe(10);
    expect(keyDelta(e("ArrowUp", false, true), 100, false)).toBe(100);
    expect(keyDelta(e("PageUp"), 100, true)).toBe(1000);
    expect(keyDelta(e("a"), 100, true)).toBeNull();
    expect(keyDelta(e("ArrowUp", false, true), 1, true)).toBe(1);
  });
  test("clamp", () => {
    expect(clamp(5, 10, 20)).toBe(10);
    expect(clamp(25, 10, 20)).toBe(20);
    expect(clamp(5)).toBe(5);
  });
});
