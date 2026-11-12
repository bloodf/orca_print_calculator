import { describe, expect, test } from "vitest";
import { h } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";
import FilamentChip from "../src/components/plates/FilamentChip.vue";
import { safeColor } from "../src/format";
import type { HostSlot, SlotMatchView } from "../src/state/types";

describe("safeColor", () => {
  test.each(["#fff", "red", "url(http://x)", "red;background:url(http://x)", "#FFFFFF;x", "#GGGGGG", " #FFFFFF", "", "#ffffff00"])("rejects %j", (v) => { expect(safeColor(v)).toBeNull(); });
  test.each(["#FFFFFF", "#2e6fbf", "#00A0Ff"])("accepts %j", (v) => { expect(safeColor(v)).toBe(v); });
  test("null and undefined are null", () => { expect(safeColor(null)).toBeNull(); expect(safeColor(undefined)).toBeNull(); });
});

describe("FilamentChip swatch", () => {
  const render = (color: string | null): HTMLElement => {
    const slot: HostSlot = { n: 1, preset: "PLA", grams: 10, color, costPerKg: null, notes: "", material: "PLA" };
    const match = { plateIndex: 0, slot, key: "k", source: "none", filamentId: null, spoolId: null, pricePerKg: null, priceSource: null } as SlotMatchView;
    const root = document.createElement("div");
    document.body.appendChild(root);
    createApp({ render: () => h(FilamentChip, { slot, match }) }).mount(root);
    return root;
  };
  test("a valid hex is painted", () => {
    const dot = render("#2E6FBF").querySelector<HTMLElement>(".dot")!;
    expect(dot.style.background).toMatch(/rgb\(46, 111, 191\)|#2e6fbf/i);
    expect(dot.classList.contains("hatched")).toBe(false);
  });
  test.each(["url(http://x)", "red;background:url(http://x/y.png)", "#fff"])("hostile or short value %j is never rendered; the hatched neutral swatch shows", (v) => {
    const dot = render(v).querySelector<HTMLElement>(".dot")!;
    expect(dot.getAttribute("style") ?? "").not.toMatch(/url|red|#fff/i);
    expect(dot.classList.contains("hatched")).toBe(true);
  });
});
