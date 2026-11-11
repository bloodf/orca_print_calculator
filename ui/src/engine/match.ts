// Filament slot -> Spoolman matching. Pure, no imports. Inputs are never mutated.

export interface Slot {
  n: number;
  preset: string;
  /** Major currency units per kg, from the Orca preset `filament_cost`. */
  costPerKg: number | null;
  notes: string;
}
export interface SpoolmanFilament {
  id: number;
  name: string;
  vendor: string | null;
  material: string | null;
  price: number | null;
  weight: number | null;
  colorHex: string | null;
}
export interface SpoolmanSpool {
  id: number;
  filamentId: number;
  price: number | null;
  initialWeight: number | null;
  archived: boolean;
  lastUsed: string | null;
}
export interface SlotOverride {
  filamentId?: number;
  spoolId?: number;
}
export type MatchSource = "override" | "spooler" | "name" | "notes" | "preset" | "none";
export interface SlotMatch {
  slot: number;
  source: MatchSource;
  filamentId: number | null;
  spoolId: number | null;
  pricePerKg: number | null;
  priceSource: "spool" | "filament" | "preset" | null;
}
export interface MatchContext {
  filaments: readonly SpoolmanFilament[];
  spools: readonly SpoolmanSpool[];
  overrides: Readonly<Record<string, SlotOverride>>;
  spoolerPresetToFilament: Readonly<Record<string, number>>;
}
export interface PriceResult {
  pricePerKg: number;
  source: "spool" | "filament";
  spoolId: number | null;
}

const pos = (x: number | null | undefined): x is number =>
  typeof x === "number" && Number.isFinite(x) && x > 0;

const own = <T>(rec: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(rec, key) ? rec[key] : undefined;

const time = (s: string | null): number => {
  const t = s === null ? NaN : Date.parse(s);
  return Number.isNaN(t) ? -Infinity : t;
};

/** Below this a weight is a typo or a sample, not a spool (1 g at price 1 would read as 1000/kg). */
const MIN_WEIGHT_G = 50;
const spoolWeight = (w: number | null): w is number => pos(w) && w >= MIN_WEIGHT_G;

function perKg(price: number | null, weight: number | null): number | null {
  return pos(price) && spoolWeight(weight) ? (price / weight) * 1000 : null;
}

/** Spool price/kg: spool initialWeight, else the filament's weight. */
function spoolPrice(f: SpoolmanFilament, s: SpoolmanSpool): number | null {
  return perKg(s.price, spoolWeight(s.initialWeight) ? s.initialWeight : f.weight);
}

export function pricePerKg(
  filament: SpoolmanFilament,
  spools: readonly SpoolmanSpool[],
  spoolId?: number,
): PriceResult | null {
  const mine = spools.filter((s) => s.filamentId === filament.id && !s.archived);
  const pick = (s: SpoolmanSpool): PriceResult | null => {
    const p = spoolPrice(filament, s);
    return p === null ? null : { pricePerKg: p, source: "spool", spoolId: s.id };
  };
  if (spoolId !== undefined) {
    const s = mine.find((x) => x.id === spoolId);
    const r = s && pick(s);
    if (r) return r;
  }
  const usable = mine
    .filter((s) => spoolPrice(filament, s) !== null)
    .sort((a, b) => time(b.lastUsed) - time(a.lastUsed) || b.id - a.id);
  const r = usable.length ? pick(usable[0]) : null;
  if (r) return r;
  const p = perKg(filament.price, filament.weight);
  return p === null ? null : { pricePerKg: p, source: "filament", spoolId: null };
}

function ids(text: string, re: RegExp): number[] {
  return Array.from(text.matchAll(re), (m) => Number(m[1]));
}

export function matchSlot(slot: Slot, ctx: MatchContext): SlotMatch {
  const exists = (id: number | undefined): id is number =>
    id !== undefined && ctx.filaments.some((f) => f.id === id);

  const find = (): { source: MatchSource; filamentId: number; spoolId?: number } | null => {
    // 1. override
    const ov = own(ctx.overrides, slot.preset);
    if (ov) {
      if (exists(ov.filamentId)) return { source: "override", filamentId: ov.filamentId, spoolId: ov.spoolId };
      if (ov.filamentId === undefined && ov.spoolId !== undefined) {
        const sp = ctx.spools.find((s) => s.id === ov.spoolId && !s.archived);
        if (sp && exists(sp.filamentId)) return { source: "override", filamentId: sp.filamentId, spoolId: sp.id };
      }
    }
    // 2. spooler mapping: full key or last path segment
    const key = Object.keys(ctx.spoolerPresetToFilament).find(
      (k) => k === slot.preset || k.split("/").pop() === slot.preset,
    );
    const sid = key === undefined ? undefined : own(ctx.spoolerPresetToFilament, key);
    if (exists(sid)) return { source: "spooler", filamentId: sid };
    // 3. "(#ID)" anywhere in the preset name, digits only: "(#2)" and "(#000001)" mean filament 2 and 1;
    //    "#FF0000" (no parentheses) and "(#1 choice)" (not closed right after the digits) are ignored.
    const byName = ids(slot.preset, /\(#(\d+)\)/g).find(exists);
    if (byName !== undefined) return { source: "name", filamentId: byName };
    // 4. notes
    const byNotes = ids(slot.notes, /spoolman\s+filament\s+(\d+)/gi).find(exists);
    if (byNotes !== undefined) return { source: "notes", filamentId: byNotes };
    return null;
  };

  const hit = find();
  const preset = pos(slot.costPerKg) ? slot.costPerKg : null;
  if (!hit) {
    return {
      slot: slot.n,
      source: preset === null ? "none" : "preset",
      filamentId: null,
      spoolId: null,
      pricePerKg: preset,
      priceSource: preset === null ? null : "preset",
    };
  }
  const filament = ctx.filaments.find((f) => f.id === hit.filamentId)!;
  const price = pricePerKg(filament, ctx.spools, hit.spoolId);
  return {
    slot: slot.n,
    source: hit.source,
    filamentId: hit.filamentId,
    spoolId: price?.spoolId ?? null,
    pricePerKg: price ? price.pricePerKg : preset,
    priceSource: price ? price.source : preset === null ? null : "preset",
  };
}

export function matchSlots(slots: readonly Slot[], ctx: MatchContext): SlotMatch[] {
  return slots.map((s) => matchSlot(s, ctx));
}
