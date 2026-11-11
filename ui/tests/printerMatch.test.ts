import { describe, expect, test } from "vitest";
import { DEFAULT_WATTS, matchPrinter, resolveWatts } from "../src/engine/printerMatch";

// Orca machine_model_list[].name from upstream resources/profiles/{BBL,Creality,Prusa,Sovol,Snapmaker}.json
const ORCA_MODELS: Record<string, string[]> = {
  "Bambu Lab": ["Bambu Lab A1", "Bambu Lab A1 mini", "Bambu Lab A2L", "Bambu Lab H2C", "Bambu Lab H2D", "Bambu Lab H2D Pro", "Bambu Lab H2S", "Bambu Lab P1P", "Bambu Lab P1S", "Bambu Lab P2S", "Bambu Lab X1", "Bambu Lab X1 Carbon", "Bambu Lab X1E", "Bambu Lab X2D"],
  Creality: ["Creality CR-10", "Creality CR-10 Max", "Creality CR-10 SE", "Creality CR-10 Smart", "Creality CR-10 Smart Pro", "Creality CR-10 V2", "Creality CR-10 V3", "Creality CR-10S Pro V2", "Creality CR-20 Pro", "Creality CR-6 Max", "Creality CR-6 SE", "Creality CR-M4", "Creality CR-M4 SE", "Creality Ender-2 Pro", "Creality Ender-3", "Creality Ender-3 Max", "Creality Ender-3 Max Neo", "Creality Ender-3 Neo", "Creality Ender-3 Pro", "Creality Ender-3 S1", "Creality Ender-3 S1 Plus", "Creality Ender-3 S1 Pro", "Creality Ender-3 S1 Sonic", "Creality Ender-3 V2", "Creality Ender-3 V2 Neo", "Creality Ender-3 V3", "Creality Ender-3 V3 KE", "Creality Ender-3 V3 Plus", "Creality Ender-3 V3 SE", "Creality Ender-3 V4", "Creality Ender-5", "Creality Ender-5 Max", "Creality Ender-5 Plus", "Creality Ender-5 Pro (2019)", "Creality Ender-5 S1", "Creality Ender-5 S1 Sonic", "Creality Ender-5S", "Creality Ender-6", "Creality Hi", "Creality K1", "Creality K1 Max", "Creality K1 Max_CFS-C", "Creality K1 SE", "Creality K1 SE_CFS-C", "Creality K1C", "Creality K1C_CFS-C", "Creality K1_CFS-C", "Creality K2", "Creality K2 Plus", "Creality K2 Pro", "Creality K2 SE", "Creality SPARKX i7", "Creality Sermoon D3", "Creality Sermoon D3 Pro", "Creality Sermoon M300", "Creality Sermoon V1", "Creality Sermoon V1 Pro"],
  Prusa: ["Prusa CORE One", "Prusa CORE One HF", "Prusa CORE One INDX 4T", "Prusa CORE One INDX 8T", "Prusa CORE One L", "Prusa CORE One L HF", "Prusa CORE One MMU3", "Prusa MINI", "Prusa MINI IS", "Prusa MK3.5", "Prusa MK3S", "Prusa MK4", "Prusa MK4 MMU3", "Prusa MK4 MMU3 HF", "Prusa MK4S", "Prusa MK4S HF", "Prusa XL", "Prusa XL 5T"],
  Sovol: ["Sovol SV01", "Sovol SV01 Pro", "Sovol SV02", "Sovol SV05", "Sovol SV06", "Sovol SV06 ACE", "Sovol SV06 Plus", "Sovol SV06 Plus ACE", "Sovol SV07", "Sovol SV07 Plus", "Sovol SV08", "Sovol SV08 MAX", "Sovol Zero"],
  Snapmaker: ["Snapmaker A250", "Snapmaker A250 BKit", "Snapmaker A250 Dual", "Snapmaker A250 Dual BKit", "Snapmaker A250 Dual QS+B Kit", "Snapmaker A250 Dual QSKit", "Snapmaker A250 QS+B Kit", "Snapmaker A250 QSKit", "Snapmaker A350", "Snapmaker A350 BKit", "Snapmaker A350 Dual", "Snapmaker A350 Dual BKit", "Snapmaker A350 Dual QS+B Kit", "Snapmaker A350 Dual QSKit", "Snapmaker A350 QS+B Kit", "Snapmaker A350 QSKit", "Snapmaker Artisan", "Snapmaker J1", "Snapmaker U1"],
};

// Orca models with no sensible preset (none exists in printers.ts); they must fall to default.
const EXPECTED_MISSES = [
  "Bambu Lab A2L", "Bambu Lab X1", "Bambu Lab X2D",
  "Creality CR-10", "Creality CR-10 Max", "Creality CR-10 SE", "Creality CR-10 Smart", "Creality CR-10 Smart Pro", "Creality CR-10 V2", "Creality CR-10 V3", "Creality CR-10S Pro V2", "Creality CR-20 Pro", "Creality CR-6 Max", "Creality CR-6 SE", "Creality CR-M4", "Creality CR-M4 SE", "Creality Ender-2 Pro", "Creality Ender-3", "Creality Ender-3 Max", "Creality Ender-3 Max Neo", "Creality Ender-3 Neo", "Creality Ender-3 Pro", "Creality Ender-3 S1", "Creality Ender-3 S1 Plus", "Creality Ender-3 S1 Pro", "Creality Ender-3 S1 Sonic", "Creality Ender-3 V2", "Creality Ender-3 V2 Neo", "Creality Ender-3 V4", "Creality Ender-5", "Creality Ender-5 Plus", "Creality Ender-5 Pro (2019)", "Creality Ender-5 S1", "Creality Ender-5 S1 Sonic", "Creality Ender-5S", "Creality Ender-6", "Creality SPARKX i7", "Creality Sermoon D3", "Creality Sermoon D3 Pro", "Creality Sermoon M300", "Creality Sermoon V1", "Creality Sermoon V1 Pro",
  "Sovol SV07", "Sovol SV07 Plus", "Sovol SV08", "Sovol SV08 MAX", "Sovol Zero",
  "Snapmaker U1",
];

describe("matchPrinter", () => {
  test("user's real cases: Sovol SV06 hits, Snapmaker U1 has no preset", () => {
    expect(matchPrinter("Sovol SV06")).toMatchObject({ how: "exact", watts: 100, estimated: true });
    expect(matchPrinter("Sovol SV06")?.preset?.id).toBe("sovol-sv06");
    expect(matchPrinter("Snapmaker U1", "Snapmaker")).toEqual({ preset: null, watts: DEFAULT_WATTS, estimated: true, how: "default" });
  });

  test("Bambu", () => {
    expect(matchPrinter("Bambu Lab X1 Carbon").preset?.id).toBe("bambu-x1-carbon");
    expect(matchPrinter("Bambu Lab A1 mini", "Bambu Lab").preset?.id).toBe("bambu-a1-mini");
    expect(matchPrinter("Bambu Lab A1").preset?.id).toBe("bambu-a1");
    expect(matchPrinter("Bambu Lab P1S").preset?.id).toBe("bambu-p1s");
    expect(matchPrinter("Bambu Lab P1S 0.4 nozzle", "Bambu Lab").preset?.id).toBe("bambu-p1s");
    expect(matchPrinter("Bambu Lab P1S (0.4 nozzle)").preset?.id).toBe("bambu-p1s");
    expect(matchPrinter("bambu lab x1 carbon", "BBL").preset?.id).toBe("bambu-x1-carbon");
  });

  test("Prusa", () => {
    expect(matchPrinter("Prusa MK4").preset?.id).toBe("prusa-mk4");
    expect(matchPrinter("Prusa MK4S HF").preset?.id).toBe("prusa-mk4s");
    expect(matchPrinter("Original Prusa MK4").preset?.id).toBe("prusa-mk4");
    expect(matchPrinter("Prusa CORE One").preset?.id).toBe("prusa-core-one");
    expect(matchPrinter("Prusa CORE One L HF").preset?.id).toBe("prusa-core-one-l");
    expect(matchPrinter("Prusa MK3S").preset?.id).toBe("prusa-i3-mk3s");
    expect(matchPrinter("MK3S+", "Prusa")).toMatchObject({ how: "alias", watts: 80, estimated: false });
    expect(matchPrinter("MK3S+", "Prusa").preset?.id).toBe("prusa-i3-mk3s-plus");
    expect(matchPrinter("Prusa MK3.5").preset?.id).toBe("prusa-mk35");
    expect(matchPrinter("Prusa MINI").preset?.id).toBe("prusa-mini");
    expect(matchPrinter("Prusa XL").preset?.id).toBe("prusa-xl-single");
    expect(matchPrinter("Prusa XL 5T").preset?.id).toBe("prusa-xl-five");
  });

  test("Creality: K1 and K1 Max never cross-match", () => {
    expect(matchPrinter("Creality K1").preset?.id).toBe("creality-k1");
    expect(matchPrinter("Creality K1 Max").preset?.id).toBe("creality-k1-max");
    expect(matchPrinter("K1 Max", "Creality").preset?.id).toBe("creality-k1-max");
    expect(matchPrinter("K1", "Creality").preset?.id).toBe("creality-k1");
    expect(matchPrinter("Creality K1 Max_CFS-C").preset?.id).toBe("creality-k1-max");
    expect(matchPrinter("Creality K1_CFS-C").preset?.id).toBe("creality-k1");
    expect(matchPrinter("Creality K1 SE").preset?.id).toBe("creality-k1-se");
    expect(matchPrinter("Creality K1C").preset?.id).toBe("creality-k1c");
    expect(matchPrinter("Creality Ender-3 V3").preset?.id).toBe("creality-ender-3-v3");
    expect(matchPrinter("Creality Ender-3 V3 SE").preset?.id).toBe("creality-ender-3-v3-se");
    expect(matchPrinter("Creality Ender-3 V3 Plus").preset?.id).toBe("creality-ender-3-v3-plus");
    expect(matchPrinter("Creality Ender-3 V3 KE 0.4 nozzle").preset?.id).toBe("creality-ender-3-v3-ke");
    expect(matchPrinter("Creality Ender-3 V4").preset).toBeNull();
  });

  test("Snapmaker aliases for Orca names", () => {
    expect(matchPrinter("Snapmaker A250").preset?.id).toBe("snapmaker-2-a250");
    expect(matchPrinter("Snapmaker A350 Dual QSKit").preset?.id).toBe("snapmaker-2-a350");
    expect(matchPrinter("Snapmaker Artisan").preset?.id).toBe("snapmaker-artisan");
  });

  test("never matches on a single generic token", () => {
    for (const s of ["Unknown Brand Pro", "Foo Plus", "Bar Max", "V3", "Mini", "Some Mini", "Brand SE"]) {
      expect(matchPrinter(s), s).toEqual({ preset: null, watts: DEFAULT_WATTS, estimated: true, how: "default" });
    }
  });

  test("garbage and empty inputs fall to default", () => {
    const def = { preset: null, watts: DEFAULT_WATTS, estimated: true, how: "default" };
    expect(DEFAULT_WATTS).toBe(120);
    expect(matchPrinter("")).toEqual(def);
    expect(matchPrinter("   \t\n ")).toEqual(def);
    expect(matchPrinter("!!!???")).toEqual(def);
    expect(matchPrinter("x".repeat(100_000) + " ü ñ ".repeat(5000))).toEqual(def);
  });

  test("diacritics and case are normalized", () => {
    expect(matchPrinter("  SOVOL   sv06  ").preset?.id).toBe("sovol-sv06");
  });

  test("Orca model fixture hit rate and misses", () => {
    const all = Object.entries(ORCA_MODELS).flatMap(([vendor, models]) => models.map((m) => ({ vendor, m })));
    const misses = all.filter(({ vendor, m }) => matchPrinter(m, vendor).preset === null).map(({ m }) => m);
    expect(misses.sort()).toEqual([...EXPECTED_MISSES].sort());
    console.info(`orca hit rate ${all.length - misses.length}/${all.length}`);
  });
});

describe("resolveWatts", () => {
  test("saved value for exact printer_model wins", () => {
    const r = resolveWatts("Sovol SV06", "Sovol", { "Sovol SV06": { watts: 77 } });
    expect(r).toMatchObject({ watts: 77, source: "saved" });
  });
  test("saved value for a different model is ignored", () => {
    expect(resolveWatts("Sovol SV06", "Sovol", { "Sovol SV05": { watts: 77 } })).toMatchObject({ watts: 100, source: "match" });
  });
  test("invalid saved watts are ignored", () => {
    for (const w of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, "90" as unknown as number]) {
      expect(resolveWatts("Sovol SV06", "Sovol", { "Sovol SV06": { watts: w } }), String(w)).toMatchObject({ watts: 100, source: "match" });
    }
  });
  test("unknown model without saved value uses default", () => {
    expect(resolveWatts("Snapmaker U1", "Snapmaker", {})).toMatchObject({ watts: DEFAULT_WATTS, source: "match" });
  });
  test("saved lookup is safe against prototype keys", () => {
    expect(resolveWatts("constructor", undefined, {})).toMatchObject({ watts: DEFAULT_WATTS, source: "match" });
  });
});
