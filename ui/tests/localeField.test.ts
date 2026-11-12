// F07: changing the language reformats a confirmed value in place (same number, new punctuation) and never re-reads an
// invalid or empty edit with the new rules. F08 sits in views.test.ts (focus).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { nextTick, type App } from "vue";
import MoneyField from "../src/components/base/MoneyField.vue";
import NumberField from "../src/components/base/NumberField.vue";
import { setLocale } from "../src/i18n";
import { mount } from "./priceKit";

const mounted: { app: App; root: HTMLElement }[] = [];
const field = (props: Record<string, unknown>, c: Parameters<typeof mount>[0] = MoneyField) => {
  const m = mount(c, props); mounted.push(m);
  const events: unknown[] = [];
  return { input: m.root.querySelector("input")!, events, props };
};
beforeEach(() => setLocale("en"));
afterEach(() => { for (const m of mounted.splice(0)) { m.app.unmount(); m.root.remove(); } setLocale("en"); });

const swap = async (to: "en" | "pt-BR") => { setLocale(to); await nextTick(); await nextTick(); };
const typeInto = (el: HTMLInputElement, text: string) => { el.focus(); el.value = text; el.dispatchEvent(new Event("input", { bubbles: true })); };
const base = { digits: 2, currency: "BRL", label: "price", step: 100 };

describe("F07: language change under a mounted field", () => {
  test("a blurred money field shows 1.234,56 after switching to Portuguese and back", async () => {
    const { input } = field({ ...base, modelValue: 123456 });
    expect(input.value).toBe("1,234.56");
    await swap("pt-BR");
    expect(input.value).toBe("1.234,56");
    await swap("en");
    expect(input.value).toBe("1,234.56");
  });
  test("a focused field whose text is the confirmed value is reformatted too", async () => {
    const { input } = field({ ...base, modelValue: 123456 });
    input.focus();
    await swap("pt-BR");
    expect(input.value).toBe("1.234,56");
  });
  test("the value is not changed: no update is emitted by the switch", async () => {
    const seen: unknown[] = [];
    field({ ...base, modelValue: 123456, "onUpdate:modelValue": (v: unknown) => seen.push(v) });
    await swap("pt-BR");
    await swap("en");
    expect(seen).toEqual([]);
  });
  test("an invalid edit stays as typed: it is not reinterpreted with the other language's rules", async () => {
    const seen: unknown[] = [];
    const { input } = field({ ...base, modelValue: 123456, "onUpdate:modelValue": (v: unknown) => seen.push(v) });
    typeInto(input, "12,3,4");
    await nextTick();
    await swap("pt-BR");
    expect(input.value).toBe("12,3,4");
    expect(seen).toEqual([]);
  });
  test("an empty required field stays empty", async () => {
    const { input } = field({ ...base, modelValue: 100, required: true });
    typeInto(input, "");
    await swap("pt-BR");
    expect(input.value).toBe("");
  });
  test("an empty nullable field stays empty and unset", async () => {
    const { input } = field({ ...base, modelValue: null, nullable: true });
    await swap("pt-BR");
    expect(input.value).toBe("");
  });
  test.each([
    ["no fraction digits (JPY)", { digits: 0, currency: "JPY", modelValue: 1234567 }, "1,234,567", "1.234.567"],
    ["three fraction digits (KWD)", { digits: 3, currency: "KWD", modelValue: 1234567 }, "1,234.567", "1.234,567"],
    ["zero", { digits: 2, currency: "BRL", modelValue: 0 }, "0.00", "0,00"],
  ])("%s", async (_n, extra, en, pt) => {
    const { input } = field({ label: "p", step: 1, ...extra });
    expect(input.value).toBe(en);
    await swap("pt-BR");
    expect(input.value).toBe(pt);
  });
  test("a plain number field (percent scale) follows the language as well", async () => {
    const { input } = field({ modelValue: 1250, label: "pct", scale: 100, step: 25, unit: "%" }, NumberField);
    expect(input.value).toBe("12.5");
    await swap("pt-BR");
    expect(input.value).toBe("12,5");
  });
  test("after the switch, typing in the new language is read with the new rules", async () => {
    const seen: unknown[] = [];
    const { input } = field({ ...base, modelValue: 123456, "onUpdate:modelValue": (v: unknown) => seen.push(v) });
    await swap("pt-BR");
    typeInto(input, "2.000,50");
    await nextTick();
    expect(seen).toEqual([200050]);
  });
});
