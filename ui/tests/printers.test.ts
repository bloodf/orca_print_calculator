import { describe, expect, test } from "vitest";
import { calculate, DEFAULT_INPUT } from "../src/engine/cost";
import { PRINTER_MANUFACTURERS, PRINTER_PRESETS, printerPresetById } from "../src/engine/printers";

describe("printer presets", () => {
  test("IDs are unique, values are usable, and every manufacturer has profiles", () => {
    expect(new Set(PRINTER_PRESETS.map((p) => p.id)).size).toBe(PRINTER_PRESETS.length);
    for (const manufacturer of PRINTER_MANUFACTURERS) expect(PRINTER_PRESETS.some((p) => p.manufacturer === manufacturer)).toBe(true);
    for (const preset of PRINTER_PRESETS) {
      expect(preset.watts).toBeGreaterThan(0);
      expect(Number.isFinite(preset.watts)).toBe(true);
      expect(preset.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  test("Sovol coverage stops at SV06 and the major requested families exist", () => {
    expect(PRINTER_PRESETS.some((p) => p.id === "sovol-sv01")).toBe(true);
    expect(PRINTER_PRESETS.some((p) => p.id === "sovol-sv06-plus-ace")).toBe(true);
    expect(PRINTER_PRESETS.some((p) => /sovol-sv0[78]/.test(p.id))).toBe(false);
    for (const id of ["bambu-h2c", "bambu-p2s", "creality-k2-plus", "snapmaker-artisan", "prusa-core-one", "prusa-mk4s"]) {
      expect(printerPresetById(id)).toBeDefined();
    }
  });

  test("selecting a preset changes only the energy input and preserves cost arithmetic", () => {
    const preset = printerPresetById("bambu-a1-mini")!;
    const result = calculate({ ...DEFAULT_INPUT, printerWatts: preset.watts });
    const hours = DEFAULT_INPUT.printMinutes / 60;
    expect(result.lines.find((line) => line.id === "energy")?.value).toBeCloseTo((preset.watts / 1000) * hours * DEFAULT_INPUT.kwhPrice);
  });
});
