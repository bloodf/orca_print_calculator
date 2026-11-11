import { describe, expect, test } from "vitest";
import {
  matchSlot,
  matchSlots,
  pricePerKg,
  type MatchContext,
  type Slot,
  type SpoolmanFilament,
  type SpoolmanSpool,
} from "../src/engine/match";

const fil = (id: number, o: Partial<SpoolmanFilament> = {}): SpoolmanFilament => ({
  id,
  name: `F${id}`,
  vendor: null,
  material: null,
  price: 25,
  weight: 1000,
  colorHex: null,
  ...o,
});
const spool = (id: number, filamentId: number, o: Partial<SpoolmanSpool> = {}): SpoolmanSpool => ({
  id,
  filamentId,
  price: 20,
  initialWeight: 1000,
  archived: false,
  lastUsed: null,
  ...o,
});
const slot = (o: Partial<Slot> = {}): Slot => ({ n: 1, preset: "PLA Black", costPerKg: null, notes: "", ...o });
const ctx = (o: Partial<MatchContext> = {}): MatchContext => ({
  filaments: [fil(1), fil(2), fil(26)],
  spools: [],
  overrides: {},
  spoolerPresetToFilament: {},
  ...o,
});

describe("rules", () => {
  test("override by filamentId", () => {
    const m = matchSlot(slot(), ctx({ overrides: { "PLA Black": { filamentId: 2 } } }));
    expect(m).toMatchObject({ slot: 1, source: "override", filamentId: 2, spoolId: null, pricePerKg: 25, priceSource: "filament" });
  });
  test("override by spoolId alone derives filament", () => {
    const c = ctx({ spools: [spool(7, 2)], overrides: { "PLA Black": { spoolId: 7 } } });
    expect(matchSlot(slot(), c)).toMatchObject({ source: "override", filamentId: 2, spoolId: 7, pricePerKg: 20, priceSource: "spool" });
  });
  test("spooler mapping exact key", () => {
    const m = matchSlot(slot(), ctx({ spoolerPresetToFilament: { "PLA Black": 2 } }));
    expect(m).toMatchObject({ source: "spooler", filamentId: 2 });
  });
  test("spooler mapping via _local/spooler/ prefix", () => {
    const m = matchSlot(slot(), ctx({ spoolerPresetToFilament: { "_local/spooler/PLA Black": 2 } }));
    expect(m).toMatchObject({ source: "spooler", filamentId: 2 });
  });
  test("spooler ignores inherited prototype keys", () => {
    const m = matchSlot(slot({ preset: "constructor" }), ctx());
    expect(m.source).toBe("none");
  });
  test("(#ID) in preset name", () => {
    const m = matchSlot(slot({ preset: "PLA Black (#26) - Spoolman" }), ctx());
    expect(m).toMatchObject({ source: "name", filamentId: 26 });
  });
  test("Spoolman filament N in notes, case-insensitive", () => {
    const m = matchSlot(slot({ notes: "SKU 9062033; Spoolman filament 26" }), ctx());
    expect(m).toMatchObject({ source: "notes", filamentId: 26 });
    expect(matchSlot(slot({ notes: "SPOOLMAN FILAMENT 2" }), ctx())).toMatchObject({ source: "notes", filamentId: 2 });
  });
  test("preset cost when nothing matches", () => {
    expect(matchSlot(slot({ costPerKg: 30 }), ctx())).toEqual({
      slot: 1, source: "preset", filamentId: null, spoolId: null, pricePerKg: 30, priceSource: "preset",
    });
  });
  test("none when no cost either", () => {
    for (const c of [null, 0, -5, NaN]) {
      expect(matchSlot(slot({ costPerKg: c }), ctx())).toEqual({
        slot: 1, source: "none", filamentId: null, spoolId: null, pricePerKg: null, priceSource: null,
      });
    }
  });
});

describe("precedence", () => {
  const full = (): { s: Slot; c: MatchContext } => ({
    s: slot({ preset: "PLA (#1)", notes: "Spoolman filament 26", costPerKg: 99 }),
    c: ctx({
      overrides: { "PLA (#1)": { filamentId: 2 } },
      spoolerPresetToFilament: { "_local/spooler/PLA (#1)": 26 },
    }),
  });
  test("override > spooler", () => {
    const { s, c } = full();
    expect(matchSlot(s, c).source).toBe("override");
  });
  test("spooler > name", () => {
    const { s, c } = full();
    expect(matchSlot(s, { ...c, overrides: {} })).toMatchObject({ source: "spooler", filamentId: 26 });
  });
  test("name > notes", () => {
    const { s, c } = full();
    expect(matchSlot(s, { ...c, overrides: {}, spoolerPresetToFilament: {} })).toMatchObject({ source: "name", filamentId: 1 });
  });
  test("notes > preset", () => {
    const { s, c } = full();
    const r = matchSlot({ ...s, preset: "PLA" }, { ...c, overrides: {}, spoolerPresetToFilament: {} });
    expect(r).toMatchObject({ source: "notes", filamentId: 26 });
  });
  test("preset last", () => {
    const { s, c } = full();
    const r = matchSlot({ ...s, preset: "PLA", notes: "" }, { ...c, overrides: {}, spoolerPresetToFilament: {} });
    expect(r.source).toBe("preset");
  });
});

describe("dangling ids", () => {
  test("override to unknown filament falls through", () => {
    const m2 = matchSlot(slot({ preset: "P (#2)" }), ctx({ overrides: { "P (#2)": { filamentId: 999 } } }));
    expect(m2).toMatchObject({ source: "name", filamentId: 2 });
  });
  test("override to unknown spool falls through", () => {
    const m = matchSlot(slot({ preset: "P (#2)" }), ctx({ overrides: { "P (#2)": { spoolId: 999 } } }));
    expect(m.source).toBe("name");
  });
  test("spooler, name, notes dangling fall through to next rule", () => {
    const m = matchSlot(
      slot({ preset: "P (#404)", notes: "Spoolman filament 405", costPerKg: 12 }),
      ctx({ spoolerPresetToFilament: { "P (#404)": 406 } }),
    );
    expect(m).toMatchObject({ source: "preset", pricePerKg: 12 });
  });
  test("dangling name falls to valid notes", () => {
    const m = matchSlot(slot({ preset: "P (#404)", notes: "Spoolman filament 2" }), ctx());
    expect(m).toMatchObject({ source: "notes", filamentId: 2 });
  });
});

describe("pricePerKg", () => {
  const f = fil(1, { price: 30, weight: 1000 });
  test("filament price", () => {
    expect(pricePerKg(f, [])).toEqual({ pricePerKg: 30, source: "filament", spoolId: null });
  });
  test("explicit spool wins, uses spool initialWeight", () => {
    const sp = [spool(5, 1, { price: 10, initialWeight: 500 })];
    expect(pricePerKg(f, sp, 5)).toEqual({ pricePerKg: 20, source: "spool", spoolId: 5 });
  });
  test("spool without initialWeight uses filament weight", () => {
    const sp = [spool(5, 1, { price: 10, initialWeight: null })];
    expect(pricePerKg(fil(1, { weight: 800 }), sp, 5)?.pricePerKg).toBeCloseTo(12.5);
  });
  test("explicit archived spool is ignored, latest used instead", () => {
    const sp = [spool(5, 1, { price: 10, archived: true }), spool(6, 1, { price: 22, lastUsed: "2025-01-01T00:00:00Z" })];
    expect(pricePerKg(f, sp, 5)).toEqual({ pricePerKg: 22, source: "spool", spoolId: 6 });
  });
  test("explicit spool of another filament is ignored", () => {
    const sp = [spool(5, 2, { price: 10 })];
    expect(pricePerKg(f, sp, 5)).toEqual({ pricePerKg: 30, source: "filament", spoolId: null });
  });
  test("archived spools never used", () => {
    const sp = [spool(5, 1, { archived: true })];
    expect(pricePerKg(f, sp)?.source).toBe("filament");
  });
  test("latest lastUsed wins, nulls last, tie -> highest id", () => {
    const sp = [
      spool(1, 1, { price: 11, lastUsed: null }),
      spool(2, 1, { price: 12, lastUsed: "2025-03-01T00:00:00Z" }),
      spool(3, 1, { price: 13, lastUsed: "2025-05-01T00:00:00Z" }),
      spool(4, 1, { price: 14, lastUsed: "2025-05-01T00:00:00Z" }),
    ];
    expect(pricePerKg(f, sp)?.spoolId).toBe(4);
    expect(pricePerKg(f, sp.slice(0, 2))?.spoolId).toBe(2);
    expect(pricePerKg(f, [sp[0], spool(9, 1, { lastUsed: null })])?.spoolId).toBe(9);
  });
  test("spool without price skipped", () => {
    const sp = [spool(1, 1, { price: null, lastUsed: "2025-09-01T00:00:00Z" }), spool(2, 1, { price: 15, lastUsed: "2025-01-01T00:00:00Z" })];
    expect(pricePerKg(f, sp)?.spoolId).toBe(2);
  });
  test("zero/negative/NaN guarded", () => {
    expect(pricePerKg(fil(1, { weight: 0 }), [])).toBeNull();
    expect(pricePerKg(fil(1, { weight: -5 }), [])).toBeNull();
    expect(pricePerKg(fil(1, { weight: NaN }), [])).toBeNull();
    expect(pricePerKg(fil(1, { price: 0 }), [])).toBeNull();
    expect(pricePerKg(fil(1, { price: -1 }), [])).toBeNull();
    expect(pricePerKg(fil(1, { price: null }), [])).toBeNull();
    expect(pricePerKg(fil(1, { weight: null }), [])).toBeNull();
    // spool with zero weight and filament weight zero -> unusable, falls to filament (also unusable)
    expect(pricePerKg(fil(1, { weight: 0 }), [spool(1, 1, { initialWeight: 0 })])).toBeNull();
  });
  test("spool zero initialWeight falls back to filament weight", () => {
    const r = pricePerKg(fil(1, { weight: 500 }), [spool(1, 1, { price: 10, initialWeight: 0 })]);
    expect(r).toEqual({ pricePerKg: 20, source: "spool", spoolId: 1 });
  });
});

describe("slot pricing", () => {
  test("matched filament without usable price falls back to preset cost, keeps match", () => {
    const c = ctx({ filaments: [fil(26, { price: null })] });
    const m = matchSlot(slot({ preset: "P (#26)", costPerKg: 40 }), c);
    expect(m).toEqual({ slot: 1, source: "name", filamentId: 26, spoolId: null, pricePerKg: 40, priceSource: "preset" });
  });
  test("matched filament without price or preset cost -> null price", () => {
    const c = ctx({ filaments: [fil(26, { price: 0 })] });
    expect(matchSlot(slot({ preset: "P (#26)" }), c)).toMatchObject({ filamentId: 26, pricePerKg: null, priceSource: null });
  });
  test("override with spool of different filament ignores spool", () => {
    const c = ctx({ spools: [spool(7, 2, { price: 5 })], overrides: { "PLA Black": { filamentId: 1, spoolId: 7 } } });
    expect(matchSlot(slot(), c)).toMatchObject({ source: "override", filamentId: 1, spoolId: null, pricePerKg: 25, priceSource: "filament" });
  });
  test("override with archived spool ignores spool", () => {
    const c = ctx({ spools: [spool(7, 1, { price: 5, archived: true })], overrides: { "PLA Black": { filamentId: 1, spoolId: 7 } } });
    expect(matchSlot(slot(), c)).toMatchObject({ spoolId: null, priceSource: "filament" });
  });
  test("spool price used for non-override match", () => {
    const c = ctx({ spools: [spool(3, 26, { price: 18, lastUsed: "2025-01-01T00:00:00Z" })] });
    expect(matchSlot(slot({ preset: "P (#26)" }), c)).toMatchObject({ spoolId: 3, pricePerKg: 18, priceSource: "spool" });
  });
  test("override spoolId only, spool archived -> falls through", () => {
    const c = ctx({ spools: [spool(7, 2, { archived: true })], overrides: { "PLA Black": { spoolId: 7 } } });
    expect(matchSlot(slot({ costPerKg: 9 }), c).source).toBe("preset");
  });
});

describe("matchSlots + immutability", () => {
  test("maps in order", () => {
    const r = matchSlots([slot({ n: 1 }), slot({ n: 3, costPerKg: 5 })], ctx());
    expect(r.map((m) => [m.slot, m.source])).toEqual([[1, "none"], [3, "preset"]]);
  });
  test("frozen inputs are not mutated", () => {
    const deep = <T>(x: T): T => {
      if (x && typeof x === "object") {
        Object.values(x).forEach(deep);
        Object.freeze(x);
      }
      return x;
    };
    const c = deep(
      ctx({
        spools: [spool(1, 26, { lastUsed: "2025-01-01T00:00:00Z" }), spool(2, 26, { lastUsed: "2025-02-01T00:00:00Z" })],
        overrides: { A: { filamentId: 1 } },
        spoolerPresetToFilament: { "_local/spooler/B": 2 },
      }),
    );
    const slots = deep([slot({ preset: "P (#26)" }), slot({ preset: "A" }), slot({ preset: "B" })]);
    const before = JSON.stringify([slots, c]);
    expect(() => matchSlots(slots, c)).not.toThrow();
    expect(JSON.stringify([slots, c])).toBe(before);
  });
});

describe("review T2.6 L11: spool weight sanity floor", () => {
  test("weights under 50 g are not used to derive price/kg", () => {
    expect(pricePerKg(fil(1, { price: 1, weight: 1 }), [])).toBeNull();
    expect(pricePerKg(fil(1, { price: 1, weight: 49 }), [])).toBeNull();
    expect(pricePerKg(fil(1, { price: 5, weight: 50 }), [])?.pricePerKg).toBe(100);
    // tiny spool initialWeight falls back to the filament weight
    expect(pricePerKg(fil(1, { weight: 500 }), [spool(1, 1, { price: 10, initialWeight: 1 })])).toEqual({ pricePerKg: 20, source: "spool", spoolId: 1 });
  });
});
