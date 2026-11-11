import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp, h, nextTick, ref, type App } from "vue";
import MoneyField from "../src/components/base/MoneyField.vue";
import NumberField from "../src/components/base/NumberField.vue";
import PercentField from "../src/components/base/PercentField.vue";
import Stepper from "../src/components/base/Stepper.vue";
import { setLocale } from "../src/i18n";

let app: App | null = null;
let root: HTMLElement;
beforeEach(() => { root = document.createElement("div"); document.body.appendChild(root); setLocale("en"); vi.useFakeTimers(); });
afterEach(() => { app?.unmount(); app = null; root.remove(); vi.useRealTimers(); });

/** Mount a field with a v-model bound to `model`; returns the ref and the input. */
function mount(Comp: unknown, props: Record<string, unknown>, initial: number | null) {
  const model = ref<number | null>(initial);
  const resets = vi.fn();
  app = createApp({ render: () => h(Comp as never, { ...props, modelValue: model.value, "onUpdate:modelValue": (v: number | null) => (model.value = v), onReset: resets }) });
  app.mount(root);
  return { model, resets, input: () => root.querySelector("input") as HTMLInputElement };
}
async function type(input: HTMLInputElement, text: string) {
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
}
const key = async (input: HTMLInputElement, k: string, init: KeyboardEventInit = {}) => { input.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init })); await nextTick(); };
const money = { label: "Price", digits: 2, currency: "BRL", step: 100 };

describe("MoneyField", () => {
  test("shows the locale text and a currency prefix", () => {
    setLocale("pt-BR");
    const { input } = mount(MoneyField, money, 123450);
    expect(input().value).toBe("1.234,50");
    expect(root.textContent).toContain("R$");
  });
  test("typing a parseable value updates the model on every input; garbage never does", async () => {
    const { model, input } = mount(MoneyField, money, 1000);
    await type(input(), "12.5");
    expect(model.value).toBe(1250);
    await type(input(), "12.5x.");
    expect(model.value).toBe(1250);
    await type(input(), "13");
    expect(model.value).toBe(1300);
  });
  test("error shows after 800 ms idle, not before; decimals message names the count", async () => {
    const { input } = mount(MoneyField, money, 1000);
    await type(input(), "1.234");
    expect(root.querySelector("[role=alert]")).toBeNull();
    vi.advanceTimersByTime(801);
    await nextTick();
    expect(root.querySelector("[role=alert]")?.textContent).toBe("Use at most 2 decimals.");
    expect(input().getAttribute("aria-invalid")).toBe("true");
  });
  test("blur reformats a valid value; invalid text keeps its error", async () => {
    const { input } = mount(MoneyField, money, 1000);
    await type(input(), "5");
    input().dispatchEvent(new Event("blur"));
    await nextTick();
    expect(input().value).toBe("5.00");
    await type(input(), "zzz");
    input().dispatchEvent(new Event("blur"));
    await nextTick();
    expect(input().value).toBe("zzz");
    expect(root.querySelector("[role=alert]")?.textContent).toContain("Enter a number, like 1,234.50.");
  });
  test("JPY: 12.5 gives the no-decimals message", async () => {
    const { input } = mount(MoneyField, { label: "Price", digits: 0, currency: "JPY", step: 1 }, 100);
    await type(input(), "12.5");
    input().dispatchEvent(new Event("blur"));
    await nextTick();
    expect(root.textContent).toContain("JPY has no decimals. Use a whole amount.");
  });
  test("arrow keys step, shift x10, alt x0.1; Escape restores", async () => {
    const { model, input } = mount(MoneyField, money, 1000);
    await key(input(), "ArrowUp");
    expect(model.value).toBe(1100);
    await key(input(), "ArrowUp", { shiftKey: true });
    expect(model.value).toBe(2100);
    await key(input(), "ArrowDown", { altKey: true });
    expect(model.value).toBe(2090);
    await type(input(), "9x9");
    await key(input(), "Escape");
    expect(input().value).toBe("20.90");
  });
  test("clamps at min", async () => {
    const { model, input } = mount(MoneyField, money, 50);
    await key(input(), "ArrowDown");
    expect(model.value).toBe(0);
  });
  test("nullable: empty text sets null and shows the not-set helper", async () => {
    const { model, input } = mount(MoneyField, { ...money, nullable: true }, 1000);
    await type(input(), "");
    expect(model.value).toBeNull();
    expect(root.textContent).toContain("Not set — counted as 0");
  });
  test("override dot and reset appear when the value differs from defaultValue", async () => {
    const { resets } = mount(MoneyField, { ...money, defaultValue: 500 }, 1000);
    const btn = root.querySelector("button.btn.icon") as HTMLButtonElement;
    expect(btn.getAttribute("aria-label")).toBe("Reset Price to default (R$5.00)");
    btn.click();
    expect(resets).toHaveBeenCalledTimes(1);
  });
});

describe("PercentField", () => {
  test("model is basis points", async () => {
    const { model, input } = mount(PercentField, { label: "Target margin" }, 3000);
    expect(input().value).toBe("30");
    await type(input(), "29,7".replace(",", "."));
    expect(model.value).toBe(2970);
    await type(input(), "120");
    expect(model.value).toBe(2970); // above max 9900: not committed
    vi.advanceTimersByTime(801);
    await nextTick();
    expect(root.textContent).toContain("Use 99 or less.");
  });
  test("pt-BR decimal comma", async () => {
    setLocale("pt-BR");
    const { model, input } = mount(PercentField, { label: "Margem" }, 3000);
    await type(input(), "29,7");
    expect(model.value).toBe(2970);
  });
});

describe("NumberField + Stepper", () => {
  test("integer field", async () => {
    const { model, input } = mount(NumberField, { label: "Lifetime", scale: 1, step: 100, unit: "h", max: 200000 }, 5000);
    await key(input(), "PageUp");
    expect(model.value).toBe(6000);
  });
  test("Stepper buttons, clamp and aria labels", async () => {
    const { model, input } = mount(Stepper, { min: 1, max: 3, label: "Quantity" }, 2);
    const [dec, inc] = Array.from(root.querySelectorAll("button")) as HTMLButtonElement[];
    expect(dec?.getAttribute("aria-label")).toBe("Decrease Quantity");
    inc?.click(); await nextTick();
    expect(model.value).toBe(3);
    expect(inc?.getAttribute("aria-disabled")).toBe("true");
    inc?.click(); await nextTick();
    expect(model.value).toBe(3);
    await key(input(), "ArrowDown", { shiftKey: true });
    expect(model.value).toBe(1);
  });
  test("Stepper ignores out-of-range typing", async () => {
    const { model, input } = mount(Stepper, { min: 1, max: 999, label: "Copies" }, 2);
    await type(input(), "5000");
    expect(model.value).toBe(2);
    await type(input(), "12");
    expect(model.value).toBe(12);
  });
});
