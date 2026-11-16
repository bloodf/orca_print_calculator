// "2.5" typed or pasted into a decimal field means two and a half in every language, also where the decimal sign is ","
// (de, es, pt-BR). The fields are plain text inputs parsed by engine/money.ts, not PrimeVue InputNumber, so no key is dropped.
import { afterEach, describe, expect, test } from "vitest";
import { nextTick, type App, type Component } from "vue";
import MoneyField from "../src/components/base/MoneyField.vue";
import NumberField from "../src/components/base/NumberField.vue";
import PercentField from "../src/components/base/PercentField.vue";
import Stepper from "../src/components/base/Stepper.vue";
import { setLocale, type Locale } from "../src/i18n";
import { mount } from "./priceKit";

const mounted: { app: App; root: HTMLElement }[] = [];
afterEach(() => { for (const m of mounted.splice(0)) { m.app.unmount(); m.root.remove(); } setLocale("en"); });

function field(c: Component, props: Record<string, unknown>) {
  const seen: unknown[] = [];
  const m = mount(c, { ...props, "onUpdate:modelValue": (v: unknown) => seen.push(v) });
  mounted.push(m);
  return { input: m.root.querySelector("input")!, seen };
}
/** Key by key, as a keyboard would: a "." keydown must not be cancelled, then the browser inserts it. */
function typeKeys(el: HTMLInputElement, text: string): void {
  el.focus();
  el.value = "";
  for (const ch of text) {
    const down = new KeyboardEvent("keydown", { key: ch, bubbles: true, cancelable: true });
    el.dispatchEvent(down);
    if (down.defaultPrevented) continue;
    el.value += ch;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ch }));
  }
}
function paste(el: HTMLInputElement, text: string): void {
  el.focus();
  const ev = new Event("paste", { bubbles: true, cancelable: true }); // jsdom has no DataTransfer; no field reads clipboardData
  el.dispatchEvent(ev);
  if (ev.defaultPrevented) return;
  el.value = text;
  el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
}

const LOCALES: Locale[] = ["en", "de", "es", "pt-BR"];
const CASES: [string, Component, Record<string, unknown>, number][] = [
  ["money per kg (2 digits)", MoneyField, { modelValue: 0, digits: 2, currency: "EUR", label: "per kg", step: 100 }, 250],
  ["energy price (4 digits)", NumberField, { modelValue: 0, scale: 10000, label: "kWh", step: 100 }, 25000],
  ["percent (margin, failure rate)", PercentField, { modelValue: 0, label: "margin" }, 250],
  ["grams (weight, scale 1000)", NumberField, { modelValue: 0, scale: 1000, label: "g", step: 1000, max: 1e9 }, 2500],
];

describe.each(LOCALES)("decimal fields in %s", (lang) => {
  test.each(CASES)("%s: typed 2.5 is two and a half", async (_n, c, props, want) => {
    setLocale(lang);
    const { input, seen } = field(c, props);
    typeKeys(input, "2.5");
    await nextTick();
    expect(input.value).toBe("2.5");
    expect(seen[seen.length - 1]).toBe(want);
  });
  test.each(CASES)("%s: pasted 2.5 is two and a half", async (_n, c, props, want) => {
    setLocale(lang);
    const { input, seen } = field(c, props);
    paste(input, "2.5");
    await nextTick();
    expect(seen[seen.length - 1]).toBe(want);
  });
  test.each(CASES)("%s: the language's own decimal sign works too, and the display stays localised", async (_n, c, props, want) => {
    setLocale(lang);
    const { input, seen } = field(c, props);
    const sign = lang === "en" ? "." : ",";
    typeKeys(input, `2${sign}5`);
    await nextTick();
    expect(seen[seen.length - 1]).toBe(want);
    input.dispatchEvent(new Event("blur"));
    const shown = field(c, { ...props, modelValue: want }).input.value;
    expect(shown.replace(/[^\d.,]/g, "")).toMatch(lang === "en" ? /^2\.50?$/ : /^2,50?$/);
  });
});

describe("whole-number steppers (copies, quantity) never read 2.5 as 25", () => {
  test.each(LOCALES)("%s: typed or pasted 2.5 is refused and the count is restored on blur; 1.000 / 1,000 still read as a thousand", async (lang) => {
    setLocale(lang);
    const { input, seen } = field(Stepper, { modelValue: 3, min: 1, max: 100000, label: "Quantity" });
    typeKeys(input, "2.5");
    await nextTick(); // separate user actions render in between
    paste(input, "2.5");
    await nextTick();
    expect(seen).not.toContain(25);
    input.dispatchEvent(new Event("blur"));
    await nextTick();
    expect(seen).not.toContain(25); // "2" on the way is a valid count; "2.5" is not, and is never read as 25
    expect(input.value).toBe("3");
    paste(input, lang === "en" ? "1,000" : "1.000");
    expect(seen[seen.length - 1]).toBe(1000);
  });
});
