import { expect, test } from "vitest";
import { MAX_MARGIN_BP, MAX_MARKUP_BP, marginOf, markupOf, presetFor } from "../src/state/markup";
import { mergeSettings, defaultSettings } from "../src/state/defaults";

test("markup <-> margin: round values stay round and every margin survives the round trip", () => {
  expect([marginOf(10000), marginOf(5000), marginOf(0), marginOf(MAX_MARKUP_BP)]).toEqual([5000, 3333, 0, MAX_MARGIN_BP]);
  expect([markupOf(5000), markupOf(3333), markupOf(2308), markupOf(0)]).toEqual([10000, 5000, 3000, 0]);
  for (let m = 0; m <= MAX_MARGIN_BP; m++) if (marginOf(markupOf(m)) !== m) throw new Error(`margin ${m}`);
});
test("a saved 95% margin (price = cost x 20) is out of range and resets to 100% markup", () => {
  const base = defaultSettings(null, "Direct", "BRL");
  const s = mergeSettings({ defaults: { targetMarginBp: 9500, energyPerKwh: null, laborPerHourMinor: 4000 } }, base);
  expect(s.defaults.targetMarginBp).toBe(5000);
  expect(s.defaults.energyPerKwh).toBe("0.95"); // "not set" takes the built-in value
  expect(s.defaults.laborPerHourMinor).toBe(4000); // a typed value wins
});
test("presets only for currencies with known typical values", () => {
  expect(presetFor("BRL")?.printerMinor).toBe(500000);
  expect([presetFor("JPY"), presetFor(null), presetFor("constructor")]).toEqual([null, null, null]);
});
