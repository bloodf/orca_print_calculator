// Helpers for driving PrimeVue overlays (Select, Menu) in jsdom: they render into <body>, animate in and out, and need a few ticks.
import { vi } from "vitest";
import { nextTick } from "vue";

/** Works under real and fake timers (the animations of overlays finish on timers either way). */
export const settle = async (ms = 40): Promise<void> => {
  for (let i = 0; i < 3; i++) {
    await nextTick();
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(ms);
    else await new Promise((r) => setTimeout(r, ms));
  }
};
export const combo = (root: ParentNode, nth = 0): HTMLElement => [...root.querySelectorAll<HTMLElement>("[role=combobox]")][nth]!;
const optionEls = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>("[role=option]")];
/** Open a PrimeVue Select, read its option labels, close it again. */
export async function optionLabels(root: ParentNode, nth = 0): Promise<string[]> {
  const c = combo(root, nth);
  (c.closest(".p-select") as HTMLElement).click();
  await settle();
  const labels = optionEls().map((o) => (o.textContent ?? "").trim());
  c.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
  await settle();
  return labels;
}
/** Open a PrimeVue Select and pick the option with this visible label. */
export async function choose(root: ParentNode, label: string, nth = 0): Promise<void> {
  (combo(root, nth).closest(".p-select") as HTMLElement).click();
  await settle();
  const o = optionEls().find((x) => (x.textContent ?? "").trim() === label);
  if (!o) throw new Error(`no option "${label}" among ${optionEls().map((x) => x.textContent?.trim()).join(", ")}`);
  o.click(); // PrimeVue 5 selects an option on click
  await settle();
}
export const selectedLabel = (root: ParentNode, nth = 0): string => (combo(root, nth).textContent ?? "").trim();
