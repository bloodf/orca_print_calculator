import { describe, expect, test } from "vitest";
import { deadZones, feeFor } from "../src/engine/costs";
import {
  DEFAULT_CHANNELS, MAX_TIERS, defaultChannels, newCustomChannel, toChannelInput, validateChannelDef, validateChannelList, type ChannelDef,
} from "../src/engine/channels";

const tier = (minMinor: number, pctBp = 0, fixedMinor = 0, shippingMinor = 0) => ({ minMinor, pctBp, fixedMinor, shippingMinor });
const def = (over: Partial<ChannelDef> = {}): ChannelDef => ({ ...newCustomChannel("X"), ...over });
const codes = (d: ChannelDef) => validateChannelDef(d).map((p) => p.code);
// A user-typed tiered channel (same numbers as the engine's dead-zone fixture).
const tiered = def({
  name: "My tiered channel",
  tiers: [tier(0, 7000), tier(900, 2000, 450), tier(8000, 1400, 1600), tier(10000, 1400, 2000), tier(20000, 1400, 2600)],
});

describe("defaults", () => {
  test("only Direct ships: zero fees, valid, deep-frozen", () => {
    expect(DEFAULT_CHANNELS.map((c) => c.id)).toEqual(["direct"]);
    const r = toChannelInput(DEFAULT_CHANNELS[0]!);
    if (!r.ok) throw new Error("invalid");
    expect(feeFor(r.input, 12345).totalCents).toBe(0);
    expect(Object.isFrozen(DEFAULT_CHANNELS)).toBe(true);
    expect(DEFAULT_CHANNELS.every((c) => Object.isFrozen(c) && Object.isFrozen(c.tiers) && c.tiers.every(Object.isFrozen))).toBe(true);
  });
  test("defaultChannels: fresh Direct plus a blank custom channel to type fees into", () => {
    const list = defaultChannels();
    expect(list.map((c) => c.id)).toEqual(["direct", "custom-1"]);
    expect(Object.isFrozen(list[0])).toBe(false);
    expect(validateChannelList(list)).toEqual([]);
    list.forEach((c) => expect(validateChannelDef(c)).toEqual([]));
  });
  test("a user-typed tiered channel converts with tiers and dead zones intact", () => {
    const r = toChannelInput(tiered);
    if (!r.ok) throw new Error("invalid");
    expect(r.input.tiers[1]).toEqual({ minPriceCents: 900, pctBp: 2000, fixedCents: 450, shippingCents: 0 });
    expect(deadZones(r.input)).toEqual([
      { fromCents: 8000, untilCents: 8777 }, { fromCents: 10000, untilCents: 10463 }, { fromCents: 20000, untilCents: 20695 },
    ]);
    expect(feeFor(r.input, 4990).totalCents).toBe(1448);
  });
});

describe("validateChannelDef", () => {
  test("first tier must start at 0", () => expect(codes(def({ tiers: [tier(100)] }))).toContain("first_tier_not_zero"));
  test("tiers strictly ascending", () => {
    expect(codes(def({ tiers: [tier(0), tier(500), tier(500)] }))).toEqual(["tiers_not_ascending"]);
    expect(codes(def({ tiers: [tier(0), tier(900), tier(500)] }))).toEqual(["tiers_not_ascending"]);
  });
  test("no tiers", () => expect(codes(def({ tiers: [] }))).toEqual(["no_tiers"]));
  test("max 8 tiers", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => tier(i * 100));
    expect(codes(def({ tiers: many(MAX_TIERS) }))).toEqual([]);
    expect(codes(def({ tiers: many(MAX_TIERS + 1) }))).toEqual(["too_many_tiers"]);
  });
  test("pct + tax capped at 90%", () => {
    expect(codes(def({ taxBp: 1000, tiers: [tier(0, 8000)] }))).toEqual([]);
    expect(codes(def({ taxBp: 1001, tiers: [tier(0, 8000)] }))).toEqual(["pct_plus_tax_too_high"]);
    expect(codes(def({ taxBp: 10000 }))).toEqual(["pct_plus_tax_too_high"]);
  });
  test("negative or fractional numbers rejected", () => {
    expect(codes(def({ surchargeMinor: -1 }))).toEqual(["not_natural"]);
    expect(codes(def({ tiers: [tier(0, 1.5)] }))).toEqual(["not_natural"]);
  });
  test("empty name", () => expect(codes(def({ name: "  " }))).toEqual(["name_empty"]));
  test("toChannelInput returns problems instead of throwing", () => {
    const r = toChannelInput(def({ tiers: [tier(0), tier(0)] }));
    expect(r).toEqual({ ok: false, problems: [{ code: "tiers_not_ascending", tier: 1 }] });
  });
  test("does not mutate inputs", () => {
    const d = def({ tiers: [tier(0, 100), tier(900, 200, 450)], taxBp: 600, surchargeMinor: 300 });
    const copy = structuredClone(d);
    validateChannelDef(d);
    toChannelInput(d);
    expect(d).toEqual(copy);
    const defaults = structuredClone(DEFAULT_CHANNELS);
    defaultChannels();
    expect(DEFAULT_CHANNELS).toEqual(defaults);
  });
});

describe("newCustomChannel", () => {
  test("fresh, zero-fee, valid", () => {
    const a = newCustomChannel("Mine");
    const b = newCustomChannel("Mine");
    expect(a).toEqual(b);
    expect(a.tiers).not.toBe(b.tiers);
    expect(a.name).toBe("Mine");
    expect(validateChannelDef(a)).toEqual([]);
  });
});

describe("ids and names", () => {
  test("M5: custom channels get unique ids; duplicate ids are reported", () => {
    expect(newCustomChannel("A").id).toBe("custom-1");
    expect(newCustomChannel("B", ["direct", "custom-1", "custom-2"]).id).toBe("custom-3");
    const a = newCustomChannel("A"), b = { ...newCustomChannel("B"), id: a.id };
    expect(validateChannelList([a, b])).toEqual([{ code: "duplicate_id", index: 1 }]);
    expect(validateChannelList([a, newCustomChannel("B", [a.id])])).toEqual([]);
  });
  test("L7: missing name is a problem, not a throw", () => {
    expect(codes(def({ name: undefined as unknown as string }))).toEqual(["name_empty"]);
  });
});
