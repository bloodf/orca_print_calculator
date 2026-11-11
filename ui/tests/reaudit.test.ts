// T4.10 round 2: defects from the T4.9 re-audit. Each test was run red before its fix.
import cardSrc from "../src/components/plates/PlateCard.vue?raw";
import fieldSrc from "../src/components/settings/TextField.vue?raw";
import themeCss from "../src/theme.css?raw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn(async () => ({ path: "/out/x" })) }));
import { call } from "../src/bridge";
import MoneyField from "../src/components/base/MoneyField.vue";
import LanguageCurrency from "../src/components/settings/LanguageCurrency.vue";
import TextField from "../src/components/settings/TextField.vue";
import PlateList from "../src/components/plates/PlateList.vue";
import PricePanel from "../src/components/price/PricePanel.vue";
import OrderControls from "../src/components/price/OrderControls.vue";
import QuoteActions from "../src/components/quotes/QuoteActions.vue";
import { setLocale } from "../src/i18n";
import { exportQuote, isDirty, sheetFor } from "../src/quoteFlow";
import { patchDraft, patchSettings, setView, store } from "../src/state/store";
import { clearToasts, toasts } from "../src/state/toast";
import { load, mount, txt } from "./priceKit";

const mounted: { unmount: () => void; root: HTMLElement }[] = [];
const show = async (c: Parameters<typeof mount>[0], props?: Record<string, unknown>): Promise<HTMLElement> => {
  const m = mount(c, props);
  mounted.push({ unmount: () => m.app.unmount(), root: m.root });
  for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
  return m.root;
};
const saves = () => vi.mocked(call).mock.calls.filter((c) => c[0] === "save_quotes").length;
beforeEach(() => { setLocale("en"); clearToasts(); vi.mocked(call).mockClear(); });
afterEach(() => { for (const m of mounted.splice(0)) { m.unmount(); m.root.remove(); } });

describe("1. a reopened saved quote is not dirty", () => {
  test("freshly opened: not dirty", () => {
    load("savedQuote");
    expect(store.draft.quoteId).not.toBeNull();
    expect(isDirty()).toBe(false);
  });
  test("a real edit makes it dirty; undoing the edit makes it clean again", () => {
    load("savedQuote");
    const q = store.draft.quantity;
    patchDraft({ quantity: q + 1 });
    expect(isDirty()).toBe(true);
    patchDraft({ quantity: q });
    expect(isDirty()).toBe(false);
    patchDraft({ customer: `${store.draft.customer}x` });
    expect(isDirty()).toBe(true);
  });
  test("Print on an unchanged reopened quote does not save; date and frozen shop details stay", async () => {
    load("savedQuote");
    store.quotes = store.quotes.map((q) => ({ ...q, sheet: { shopName: "Old Shop", footer: "Old footer", validityDays: 7 } }));
    const before = JSON.stringify(store.quotes[0]);
    patchSettings((s) => ({ sheet: { ...s.sheet, shopName: "CHANGED SHOP" } }));
    const el = await show(QuoteActions);
    const print = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Print"))!;
    print.click();
    for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
    expect(saves()).toBe(0);
    expect(store.preview).toBe(true);
    expect(JSON.stringify(store.quotes[0])).toBe(before);
    expect(sheetFor(store.quotes[0]!)?.shop).toBe("Old Shop");
    store.preview = false;
  });
  test("CSV on an unchanged reopened quote does not save", async () => {
    load("savedQuote");
    await exportQuote("csv");
    expect(saves()).toBe(0);
  });
  test("panel says Saved as, not Save changes", async () => {
    load("savedQuote");
    const el = await show(QuoteActions);
    expect(txt(el)).toContain("Saved as");
    expect(txt(el)).not.toContain("Save changes");
  });
});

describe("2. field ids are unique", () => {
  test("two TextFields get distinct ids and each label binds to its own input", async () => {
    const el = await show(defineComponent({ render: () => h("div", [h(TextField, { modelValue: "a", label: "Shop name" }), h(TextField, { modelValue: "b", label: "Footer note" })]) }));
    const ids = [...el.querySelectorAll("input")].map((i) => i.id);
    expect(new Set(ids).size).toBe(2);
    for (const label of el.querySelectorAll("label")) expect(el.querySelector<HTMLInputElement>(`#${label.htmlFor}`)?.closest(".tf")).toBe(label.closest(".tf"));
  });
  test("no counter declared inside a <script setup> block anywhere", () => {
    for (const [f, src] of [["TextField.vue", fieldSrc], ["PlateCard.vue", cardSrc]] as const) expect(src, f).not.toMatch(/^let (uid|seq)\b/m);
  });
});

describe("3. no number animation on the hero price", () => {
  test("a price change adds no animation class and the stylesheet has no tick", async () => {
    load("ok");
    const el = await show(PricePanel);
    patchDraft({ quantity: 3 });
    await nextTick(); await nextTick();
    expect(el.querySelector('[data-testid="hero-price"]')!.classList.contains("tick")).toBe(false);
    expect(themeCss).not.toMatch(/opc-tick|\.tick\b/);
  });
});

describe("4. changing the currency code without Spoolman", () => {
  test("records the previous code so the mismatch alert shows", async () => {
    load("noSpoolman");
    store.settings = { ...store.settings, defaultsCurrency: null };
    const el = await show(LanguageCurrency);
    const input = el.querySelector<HTMLInputElement>("input")!;
    input.value = "JPY";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick(); await nextTick();
    expect(store.settings.currency).toBe("JPY");
    expect(store.settings.defaultsCurrency).toBe("BRL");
    expect(txt(el)).toContain("Defaults were entered in BRL");
  });
  test("an already-set defaultsCurrency is kept (it names where the numbers were entered)", async () => {
    load("noSpoolman");
    store.settings = { ...store.settings, currency: "BRL", defaultsCurrency: "USD" };
    const el = await show(LanguageCurrency);
    const input = el.querySelector<HTMLInputElement>("input")!;
    input.value = "JPY";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    expect(store.settings.defaultsCurrency).toBe("USD");
  });
  test("a mounted money field reformats when the currency digits change", async () => {
    const digits = ref(2);
    const el = await show(defineComponent({ render: () => h(MoneyField, { modelValue: 3000, label: "Labor", digits: digits.value, currency: digits.value === 2 ? "BRL" : "JPY", step: 1 }) }));
    const input = el.querySelector<HTMLInputElement>("input")!;
    expect(input.value).toMatch(/30[.,]00/);
    digits.value = 0;
    await nextTick(); await nextTick();
    expect(input.value).toBe("3,000");
  });
});

describe("5. Target margin reset uses the shared helper", () => {
  test("toast with Undo; Undo restores the override", async () => {
    load("ok");
    const base = store.settings.defaults.targetMarginBp;
    patchDraft({ overrides: { targetMarginBp: base + 500 } });
    const el = await show(OrderControls);
    const reset = el.querySelector<HTMLButtonElement>(".nf-head button")!;
    reset.click();
    await nextTick();
    expect(store.draft.overrides.targetMarginBp).toBeUndefined();
    const t0 = toasts.list[toasts.list.length - 1]!;
    expect(t0.action?.label).toBe("Undo");
    t0.action!.run();
    expect(store.draft.overrides.targetMarginBp).toBe(base + 500);
  });
});

describe("6. NITs", () => {
  test("chips come before the copies stepper in DOM order (docs/ux.md §7.7)", async () => {
    load("ok");
    const el = await show(PlateList);
    const card = el.querySelector("article")!;
    const chip = card.querySelector(".chip")!;
    const stepper = card.querySelector(".stepper input")!;
    expect(chip.compareDocumentPosition(stepper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  test("opening Settings never flashes Saved, even when a save was pending", async () => {
    load("ok");
    store.saveStatus = "idle";
    patchSettings({ language: "en" });
    setView("settings");
    for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
    expect(vi.mocked(call).mock.calls.some((c) => c[0] === "save_settings")).toBe(true); // still persisted
    expect(store.saveStatus).toBe("idle");
    setView("calc");
  });
  test("Machine and Labor headers carry a summary in the empty state", async () => {
    load("empty");
    const { default: Sections } = await import("../src/views/SectionsArea.vue");
    const el = await show(Sections);
    for (const id of ["machine", "labor"]) expect(txt(el.querySelector(`[data-section=${id}] .sec-sum`)), id).not.toBe("");
  });
});
