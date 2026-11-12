// One HostState per `?state=` name (docs/ux.md §6, §10). `behaviour` tells the mock host how to answer other commands.
import { BAMBU_HOST, HOST, plates, savedQuotes, settings, spooler } from "./fixtures";
import type { HostPlate, HostState } from "../state/types";

export const SCENARIO_NAMES = ["ok", "loading", "hostError", "empty", "stale", "noSpoolman", "offline", "unmatched", "impossible", "savedQuote", "firstRun", "narrow", "unknown", "imported", "legacyQuote"] as const;
export type ScenarioName = (typeof SCENARIO_NAMES)[number];
export type Behaviour = { hang?: boolean; fail?: boolean; spoolman: "ok" | "offline" };
export type Scenario = { state: HostState; behaviour: Behaviour };

export const isScenario = (s: string | null): s is ScenarioName => !!s && (SCENARIO_NAMES as readonly string[]).includes(s);

const base = (over: Partial<HostState> = {}): HostState => ({ host: HOST, plates: plates(), settings: settings(), quotes: savedQuotes(), spooler: spooler(), ...over });
const withPlates = (f: (p: HostPlate[]) => HostPlate[]): HostPlate[] => f(plates());

export function buildScenario(name: ScenarioName): Scenario {
  const ok: Behaviour = { spoolman: "ok" };
  switch (name) {
    case "loading": return { state: base(), behaviour: { ...ok, hang: true } };
    case "hostError": return { state: base(), behaviour: { ...ok, fail: true } };
    case "empty": return { state: base({ host: { ...HOST, projectName: null }, plates: [] }), behaviour: ok };
    case "stale": return { state: base({ plates: withPlates((p) => p.map((x) => ({ ...x, stale: true }))) }), behaviour: ok };
    case "noSpoolman": return { state: base({ settings: settings({ spoolman: { url: "" } }), spooler: null }), behaviour: ok };
    case "offline": return { state: base(), behaviour: { spoolman: "offline" } };
    case "unmatched":
      return { state: base({ plates: withPlates((p) => p.map((x) => (x.index === 2 ? { ...x, slots: [{ ...x.slots[0]!, preset: "House brand PLA", costPerKg: null }, x.slots[1]!] } : x))) }), behaviour: ok };
    case "impossible": {
      const s = settings();
      const store = { id: "store", name: "Online store", taxBp: 2500, surchargeMinor: 0, tiers: [{ minMinor: 0, pctBp: 6000, fixedMinor: 100, shippingMinor: 0 }] };
      return { state: base({ settings: { ...s, channels: [s.channels[0]!, store] } }), behaviour: ok };
    }
    case "firstRun": return { state: base({ settings: null, quotes: null, spooler: { url: "http://10.0.0.5:7912", presetToFilament: {} } }), behaviour: ok };
    case "unknown":
      return {
        state: base({ host: BAMBU_HOST, plates: [{ ...plates()[0]!, seconds: null, slots: [plates()[0]!.slots[0]!, { ...plates()[0]!.slots[1]!, grams: null }] }] }),
        behaviour: ok,
      };
    case "legacyQuote": { // a quote saved before the completeness flags: plate 1 ends in a lone 0 g slot nothing proves was reported
      const q = savedQuotes().map((x) => ({
        ...x, plates: x.plates.map((p) => { const { secondsKnown: _s, consumption: _c, ...r } = p; return { ...r, slots: p.slots.map(({ gramsKnown: _g, priceKnown: _p, ...sl }) => sl) }; }),
      }));
      const first = q[0];
      if (first?.plates[0]) {
        const lone = { ...first.plates[0].slots[0]!, gramsMg: 0 };
        first.plates = [{ ...first.plates[0], slots: [lone] }, ...first.plates.slice(1)];
        first.input = { ...first.input, plates: first.input.plates.map((p, i) => (i === 0 ? { ...p, slots: [{ n: lone.n, label: lone.label, key: lone.key, gramsMg: 0, pricePerKgMinor: lone.pricePerKgMinor }] } : p)) };
      }
      return { state: base({ quotes: q }), behaviour: ok };
    }
    case "imported":
      return { state: base({ plates: withPlates((p) => p.map((x) => ({ ...x, source: "file" as const, fileName: "desk-organizer.gcode.3mf", slicedAt: null }))) }), behaviour: ok };
    default: return { state: base(), behaviour: ok }; // ok, savedQuote (opened by DevBar), narrow (same data, narrow window)
  }
}
