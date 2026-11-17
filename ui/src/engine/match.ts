// Filament slot -> Spoolman matching. Pure, no imports. Inputs are never mutated.

export interface Slot {
  n: number;
  preset: string;
  /** Major currency units per kg, from the Orca preset `filament_cost`. */
  costPerKg: number | null;
  notes: string;
  /** Orca's filament type ("PLA") and colour ("#RRGGBB"): the material+colour match and the picker's order. */
  material?: string | null;
  color?: string | null;
}
export interface SpoolmanFilament {
  id: number;
  name: string;
  vendor: string | null;
  material: string | null;
  price: number | null;
  weight: number | null;
  colorHex: string | null;
  /** Spoolman extra field `orca_filament_preset`: the Orca preset this filament fits. */
  orcaPreset?: string | null;
}
export interface SpoolmanSpool {
  id: number;
  filamentId: number;
  price: number | null;
  initialWeight: number | null;
  archived: boolean;
  lastUsed: string | null;
  orcaPreset?: string | null;
}
export interface SlotOverride {
  filamentId?: number;
  spoolId?: number;
}
/**
 * Where a slot's filament came from, in the order tried: `assigned` (the spool picked for this printer preset and slot),
 * `override` (a filament or spool picked for the preset, older versions), `spooler` (Spooler's preset links),
 * `name` / `notes` ("(#id)" in the preset name, "spoolman filament N" in its notes), `extra` (Spoolman's
 * `orca_filament_preset`), `color` (the only filament with the slot's material and colour), else the Orca preset.
 */
export type MatchSource = "assigned" | "override" | "spooler" | "name" | "notes" | "extra" | "color" | "preset" | "none";
export interface SlotMatch {
  slot: number;
  source: MatchSource;
  filamentId: number | null;
  spoolId: number | null;
  pricePerKg: number | null;
  priceSource: "spool" | "filament" | "preset" | null;
  /** The spool is a choice (picked, or linked by Spooler or `orca_filament_preset`), not the latest-used guess: its stock counts alone. */
  spoolPinned: boolean;
}
export interface MatchContext {
  filaments: readonly SpoolmanFilament[];
  spools: readonly SpoolmanSpool[];
  overrides: Readonly<Record<string, SlotOverride>>;
  spoolerPresetToFilament: Readonly<Record<string, number>>;
  spoolerPresetToSpool?: Readonly<Record<string, number>>;
  /** The spool picked for this slot on this printer preset (settings.slotSpools). */
  assigned?: SlotOverride;
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

/** "#RRGGBB" -> [r, g, b], else null. */
function rgb(hex: string | null | undefined): [number, number, number] | null {
  const m = typeof hex === "string" ? /^#?([0-9a-f]{6})/i.exec(hex.trim()) : null;
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** RGB distance between two colours, 0..441; null when either is unknown. */
export function colorDistance(a: string | null | undefined, b: string | null | undefined): number | null {
  const x = rgb(a), y = rgb(b);
  return x && y ? Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) : null;
}
// ponytail: plain RGB distance; Orca and Spoolman rarely store the exact same hex for one filament. Swap for a
// perceptual distance (CIEDE2000) if near-miss colours pick the wrong filament.
const SAME_COLOR = 40;
const sameMaterial = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a?.trim() && a.trim().toLowerCase() === b?.trim().toLowerCase();

/** How well a filament fits a slot, lower is better: same material first, then the nearest colour. For the spool picker. */
export function fitScore(slot: Pick<Slot, "material" | "color">, f: Pick<SpoolmanFilament, "material" | "colorHex">): number {
  const d = colorDistance(slot.color, f.colorHex);
  return (sameMaterial(slot.material, f.material) ? 0 : 1000) + (d ?? 500);
}

/** A preset name as written in Spoolman's `orca_filament_preset`: the full name or its last path segment, any case. */
const presetIs = (wanted: string | null | undefined, preset: string): boolean => {
  const w = wanted?.trim().toLowerCase();
  if (!w) return false;
  const p = preset.trim().toLowerCase();
  return w === p || w === p.split("/").pop() || w.split("/").pop() === p.split("/").pop();
};

/** What a chosen spool costs: its own price, else its filament's (never another spool's). */
export function pinnedPrice(filament: SpoolmanFilament, spool: SpoolmanSpool): PriceResult | null {
  const p = spoolPrice(filament, spool);
  if (p !== null) return { pricePerKg: p, source: "spool", spoolId: spool.id };
  const f = perKg(filament.price, filament.weight);
  return f === null ? null : { pricePerKg: f, source: "filament", spoolId: spool.id };
}

function ids(text: string, re: RegExp): number[] {
  return Array.from(text.matchAll(re), (m) => Number(m[1]));
}

export function matchSlot(slot: Slot, ctx: MatchContext): SlotMatch {
  const exists = (id: number | undefined): id is number =>
    id !== undefined && ctx.filaments.some((f) => f.id === id);

  const live = (id: number | undefined) => (id === undefined ? undefined : ctx.spools.find((s) => s.id === id && !s.archived && exists(s.filamentId)));

  const find = (): { source: MatchSource; filamentId: number; spoolId?: number } | null => {
    // 0. the spool picked for this printer preset and slot
    const as = ctx.assigned;
    const picked = live(as?.spoolId);
    if (picked) return { source: "assigned", filamentId: picked.filamentId, spoolId: picked.id };
    if (as && as.spoolId === undefined && exists(as.filamentId)) return { source: "assigned", filamentId: as.filamentId };
    // 1. override
    const ov = own(ctx.overrides, slot.preset);
    if (ov) {
      if (exists(ov.filamentId)) return { source: "override", filamentId: ov.filamentId, spoolId: ov.spoolId };
      if (ov.filamentId === undefined && ov.spoolId !== undefined) {
        const sp = ctx.spools.find((s) => s.id === ov.spoolId && !s.archived);
        if (sp && exists(sp.filamentId)) return { source: "override", filamentId: sp.filamentId, spoolId: sp.id };
      }
    }
    // 2. spooler mapping: full key or last path segment; a preset made for one spool wins over the filament's
    const linked = (map: Readonly<Record<string, number>>): number | undefined => {
      const key = Object.keys(map).find((k) => k === slot.preset || k.split("/").pop() === slot.preset);
      return key === undefined ? undefined : own(map, key);
    };
    const spoolLink = live(linked(ctx.spoolerPresetToSpool ?? {}));
    if (spoolLink) return { source: "spooler", filamentId: spoolLink.filamentId, spoolId: spoolLink.id };
    const sid = linked(ctx.spoolerPresetToFilament);
    if (exists(sid)) return { source: "spooler", filamentId: sid };
    // 3. "(#ID)" anywhere in the preset name, digits only: "(#2)" and "(#000001)" mean filament 2 and 1;
    //    "#FF0000" (no parentheses) and "(#1 choice)" (not closed right after the digits) are ignored.
    const byName = ids(slot.preset, /\(#(\d+)\)/g).find(exists);
    if (byName !== undefined) return { source: "name", filamentId: byName };
    // 4. notes
    const byNotes = ids(slot.notes, /spoolman\s+filament\s+(\d+)/gi).find(exists);
    if (byNotes !== undefined) return { source: "notes", filamentId: byNotes };
    // 5. Spoolman's orca_filament_preset on spools or filaments: used when it names one filament
    const tagged = ctx.spools.filter((s) => !s.archived && exists(s.filamentId) && presetIs(s.orcaPreset, slot.preset));
    const fids = new Set([...tagged.map((s) => s.filamentId), ...ctx.filaments.filter((f) => presetIs(f.orcaPreset, slot.preset)).map((f) => f.id)]);
    if (fids.size === 1) {
      const [fid] = fids;
      return { source: "extra", filamentId: fid, ...(tagged.length === 1 ? { spoolId: tagged[0].id } : {}) };
    }
    // 6. the only filament of the slot's material in (about) the slot's colour
    // only filaments with a spool in use: a used-up filament must neither be the match nor block it
    const near = ctx.filaments.filter((f) => ctx.spools.some((s) => s.filamentId === f.id && !s.archived)
      && sameMaterial(slot.material, f.material) && (colorDistance(slot.color, f.colorHex) ?? Infinity) <= SAME_COLOR);
    if (near.length === 1) return { source: "color", filamentId: near[0].id };
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
      spoolPinned: false,
    };
  }
  const filament = ctx.filaments.find((f) => f.id === hit.filamentId)!;
  // A chosen spool prices itself (its price, else its filament's), never another spool of the filament.
  const pinned = hit.source !== "override" ? live(hit.spoolId) : undefined;
  const mine = pinned && pinned.filamentId === filament.id ? pinned : undefined;
  const price = mine ? pinnedPrice(filament, mine) : pricePerKg(filament, ctx.spools, hit.spoolId);
  return {
    slot: slot.n,
    source: hit.source,
    filamentId: hit.filamentId,
    spoolId: mine ? mine.id : price?.spoolId ?? null,
    pricePerKg: price ? price.pricePerKg : preset,
    priceSource: price ? price.source : preset === null ? null : "preset",
    spoolPinned: !!mine,
  };
}

export function matchSlots(slots: readonly Slot[], ctx: MatchContext): SlotMatch[] {
  return slots.map((s) => matchSlot(s, ctx));
}
