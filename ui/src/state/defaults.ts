// Built-in settings and draft (docs/ux.md §5.1 "Initial Defaults"). Pure.
import { DEFAULT_CHANNELS } from "../engine/channels";
import type { ChannelDef } from "../engine/channels";
import { PRETTY_MODES } from "../engine/quotePricing";
import type { CatalogExtra, Defaults, Draft, HostPlate, PrinterProfile, Settings } from "./types";
import { MAX_MARGIN_BP, presetFor } from "./markup";
import { isRec } from "./validate";

export const DEFAULT_PRETTY = "round" as const; // engine exports no PRETTY_DEFAULT; "round" is the closest to the spec's "whole"

/** `currency`: fill energy and labor with typical values for it (BRL, USD, EUR); other currencies start not set. */
export const defaultDefaults = (currency?: string | null): Defaults => ({
  energyPerKwh: presetFor(currency)?.energyPerKwh ?? null, failureBp: 500, failureMode: "expected_waste", failureIncludesMachine: false,
  depreciationEnabled: true, maintenancePerHourMinor: 0, fixedPerPrintHourMinor: 0,
  laborPerHourMinor: presetFor(currency)?.laborPerHourMinor ?? null, laborMinutes: 10, setupMinutes: 0,
  targetMarginBp: 5000 /* 100% markup */, pretty: DEFAULT_PRETTY, minOrderMinor: 0,
  shipping: { mode: "none", minor: 0 }, discountTiers: [],
});

/** One zero-fee channel named by the caller (i18n lives outside this pure module). */
export const directChannel = (name: string) => {
  const base = DEFAULT_CHANNELS[0]!;
  return { ...base, name, tiers: base.tiers.map((t) => ({ ...t })) };
};

export const defaultSettings = (currency: string | null, directName: string, presetCurrency?: string | null): Settings => ({
  version: 1, onboarded: false, language: "auto", currency, defaultsCurrency: presetFor(presetCurrency) ? presetCurrency! : null,
  spoolman: { url: "" }, defaults: defaultDefaults(presetCurrency),
  channels: [directChannel(directName)], comparedChannelIds: ["direct"], defaultChannelId: "direct",
  printers: {}, slotOverrides: {}, manualPrices: {}, extrasCatalog: [],
  sheet: { shopName: "", footer: "", validityDays: 15, nextNo: 1 },
  ui: { open: {}, sheetMode: "summary" },
});

const natural = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// Own-property checks only (a "__proto__" or "constructor" key in a file must be data, never a lookup into Object.prototype).
// Object.hasOwn needs Safari 15.4; the target is Safari 14.
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const put = (o: Record<string, unknown>, k: string, v: unknown): void => { Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true }); };
/** A number field: missing means "an older file lacked it" (the default), present but not a natural number means the row is damaged. */
const field = (o: Rec, k: string, dflt: number | null): number | null | undefined =>
  !own(o, k) || o[k] === undefined || (dflt === null && o[k] === null) ? dflt : natural(o[k]) ? o[k] : undefined; // null is "not set" only where the default is null (printers)

/** One channel from any older file, or null when ANY of its fields is damaged (a damaged fee is never quietly read as 0). */
function migrateChannel(c: unknown): ChannelDef | null {
  if (!isRec(c) || typeof c.id !== "string" || !c.id || typeof c.name !== "string" || !Array.isArray(c.tiers) || !c.tiers.length) return null;
  const tax = field(c, "taxBp", 0);
  const sur = field(c, "surchargeMinor", 0);
  if (tax === undefined || sur === undefined) return null;
  const tiers: ChannelDef["tiers"] = [];
  for (const t of c.tiers) {
    if (!isRec(t)) return null;
    const f = [field(t, "minMinor", 0), field(t, "pctBp", 0), field(t, "fixedMinor", 0), field(t, "shippingMinor", 0)];
    if (f.some((x) => x === undefined || x === null)) return null;
    tiers.push({ minMinor: f[0]!, pctBp: f[1]!, fixedMinor: f[2]!, shippingMinor: f[3]! });
  }
  return { id: c.id, name: c.name, taxBp: tax ?? 0, surchargeMinor: sur ?? 0, tiers };
}
function migratePrinter(p: unknown): PrinterProfile | null {
  if (!isRec(p)) return null;
  const f = [field(p, "watts", null), field(p, "acquisitionMinor", null), field(p, "lifetimeHours", null)];
  return f.some((x) => x === undefined) ? null : { watts: f[0] ?? null, acquisitionMinor: f[1] ?? null, lifetimeHours: f[2] ?? null };
}
const migrateExtra = (e: unknown): CatalogExtra | null =>
  isRec(e) && typeof e.key === "string" && typeof e.label === "string" && natural(e.unitMinor) && natural(e.qtyE3) && (e.per === "piece" || e.per === "plate" || e.per === "order") ? { key: e.key, label: e.label, unitMinor: e.unitMinor, qtyE3: e.qtyE3, per: e.per } : null;

/** Rows that fail `f` are returned in `dropped` instead of vanishing. */
function listRows<T>(v: unknown, f: (x: unknown) => T | null): { kept: T[]; dropped: unknown[] } {
  const kept: T[] = [];
  const dropped: unknown[] = [];
  for (const x of Array.isArray(v) ? v : []) { const y = f(x); if (y === null) dropped.push(x); else kept.push(y); }
  return { kept, dropped };
}
function mapRows<T>(v: unknown, f: (x: unknown) => T | null): { kept: Record<string, T>; dropped: Record<string, unknown> } {
  const kept: Record<string, T> = {};
  const dropped: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(isRec(v) ? v : {})) { const y = f(x); if (y === null) put(dropped, k, x); else put(kept, k, y); }
  return { kept, dropped };
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const union = (a: unknown[], b: unknown[]): unknown[] => [...a, ...b.filter((x) => !a.some((y) => same(x, y)))];

const BIG = 1_000_000_000;
const int = (min: number, max: number) => (v: unknown): boolean => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const bool = (v: unknown): boolean => typeof v === "boolean";
const SHAPES: { [K in keyof Defaults]: (v: unknown) => boolean } = {
  energyPerKwh: (v) => v === null || (typeof v === "string" && /^\d{1,9}(\.\d{1,9})?$/.test(v)),
  failureBp: int(0, 9500), failureMode: (v) => v === "markup" || v === "expected_waste", failureIncludesMachine: bool, depreciationEnabled: bool,
  maintenancePerHourMinor: int(0, BIG), fixedPerPrintHourMinor: int(0, BIG), laborPerHourMinor: (v) => v === null || int(0, BIG)(v),
  laborMinutes: int(0, 6000), setupMinutes: int(0, 6000), targetMarginBp: int(0, MAX_MARGIN_BP),
  pretty: (v) => (PRETTY_MODES as readonly unknown[]).includes(v), minOrderMinor: int(0, BIG),
  shipping: (v) => isRec(v) && (v.mode === "none" || v.mode === "customer" || v.mode === "absorbed") && int(0, BIG)(v.minor),
  discountTiers: (v) => Array.isArray(v) && v.length <= 20 && v.every((t) => isRec(t) && int(1, 1_000_000)(t.minQty) && int(0, 10000)(t.discountBp)),
};
/** Every cost default is checked for type and range; a bad one falls back to the built-in value and is named in `reset`. */
export function migrateDefaults(saved: unknown, base: Defaults): { value: Defaults; reset: string[] } {
  if (saved === undefined) return { value: base, reset: [] };
  if (!isRec(saved)) return { value: base, reset: ["defaults"] };
  const value: Record<string, unknown> = { ...base };
  const reset: string[] = [];
  for (const k of Object.keys(SHAPES) as (keyof Defaults)[]) {
    if (!own(saved, k)) continue;
    if (SHAPES[k](saved[k])) value[k] = saved[k]; else reset.push(k);
  }
  return { value: value as Defaults, reset };
}

const SCALARS: Record<string, (v: unknown) => boolean> = {
  onboarded: bool, language: (v) => v === "auto" || v === "en" || v === "pt-BR",
  currency: (v) => v === null || (typeof v === "string" && /^[A-Z]{3}$/.test(v)), defaultsCurrency: (v) => v === null || (typeof v === "string" && /^[A-Z]{3}$/.test(v)),
  comparedChannelIds: (v) => Array.isArray(v) && v.every((x) => typeof x === "string"), defaultChannelId: (v) => typeof v === "string",
};
const NESTED: Record<string, Record<string, (v: unknown) => boolean>> = {
  spoolman: { url: (v) => typeof v === "string" },
  sheet: { shopName: (v) => typeof v === "string", footer: (v) => typeof v === "string", validityDays: int(0, 3650), nextNo: int(1, 999_999_999) },
  ui: { open: (v) => isRec(v) && Object.values(v).every(bool), sheetMode: (v) => v === "itemized" || v === "summary" },
};
/** Names of every setting in a raw settings file that will be reset to a built-in value (for the one-time notice). */
export function resetNames(raw: unknown): string[] {
  if (!isRec(raw)) return [];
  const out = migrateDefaults(raw.defaults, defaultDefaults()).reset;
  const m = migrateSettings(raw);
  const was = isRec(raw.invalid) ? raw.invalid : {};
  const now = m && isRec(m.invalid) ? m.invalid : {};
  for (const k of Object.keys(now)) if (!(k in was) || JSON.stringify(was[k]) !== JSON.stringify(now[k])) out.push(k); // rows lost since the file was last written
  for (const [k, ok] of Object.entries(SCALARS)) if (own(raw, k) && !ok(raw[k])) out.push(k);
  for (const [g, fields] of Object.entries(NESTED)) {
    if (!own(raw, g)) continue;
    if (!isRec(raw[g])) { out.push(g); continue; }
    for (const [f, ok] of Object.entries(fields)) if (own(raw[g] as Rec, f) && !ok((raw[g] as Rec)[f])) out.push(`${g}.${f}`);
  }
  return out;
}
type Rec = Record<string, unknown>;

/**
 * Settings as the file has them -> a typed partial. Keyed on `version`: files without one (or from a newer build) are read as
 * version 1. Collections are migrated per item, so one bad printer or channel is dropped instead of poisoning the rest.
 */
export function migrateSettings(saved: unknown): Partial<Settings> | null {
  if (!isRec(saved)) return null;
  const ch = listRows(saved.channels, migrateChannel);
  const pr = mapRows(saved.printers, migratePrinter);
  const so = mapRows(saved.slotOverrides, (o) => (isRec(o) && natural(o.filamentId) ? o : null));
  const mp = mapRows(saved.manualPrices, (n) => (natural(n) ? n : null));
  const ex = listRows(saved.extrasCatalog, migrateExtra);
  const out: Record<string, unknown> = { ...saved, version: 1 };
  if (ch.kept.length) out.channels = ch.kept; else delete out.channels;
  out.printers = pr.kept; out.slotOverrides = so.kept; out.manualPrices = mp.kept; out.extrasCatalog = ex.kept;
  // Dropped rows stay in the file (settings.invalid) so a save never deletes what the user typed, even if we cannot read it.
  const old = isRec(saved.invalid) ? saved.invalid : {};
  const bag: Record<string, unknown> = {};
  const keep = (name: string, now: unknown): void => {
    const before = old[name];
    const merged = Array.isArray(now) ? union(Array.isArray(before) ? before : [], now) : { ...(isRec(before) ? before : {}), ...(now as Record<string, unknown>) }; // spread defines own keys, so "__proto__" stays data
    if (Array.isArray(merged) ? merged.length : Object.keys(merged).length) bag[name] = merged;
  };
  keep("channels", ch.dropped); keep("printers", pr.dropped); keep("extrasCatalog", ex.dropped); keep("slotOverrides", so.dropped); keep("manualPrices", mp.dropped);
  if (Object.keys(bag).length) out.invalid = bag; else delete out.invalid;
  out.defaults = migrateDefaults(saved.defaults, defaultDefaults()).value;
  for (const [k, ok] of Object.entries(SCALARS)) if (own(out, k) && !ok(out[k])) delete out[k];
  for (const [g, fields] of Object.entries(NESTED)) {
    if (!isRec(saved[g])) { delete out[g]; continue; }
    out[g] = Object.fromEntries(Object.entries(saved[g] as Rec).filter(([f, v]) => !own(fields, f) || fields[f]!(v)));
  }
  return out as Partial<Settings>;
}

/** Saved settings win; anything an older file lacks (or has with the wrong type) is filled from the built-ins. */
export function mergeSettings(raw: unknown, base: Settings): Settings {
  const saved = migrateSettings(raw);
  if (!saved) return base;
  const channels = saved.channels?.length ? saved.channels : base.channels;
  return {
    ...base, ...saved, version: 1, channels,
    // A saved "not set" energy or labor rate takes the built-in value when the currency has one.
    defaults: { ...base.defaults, ...saved.defaults, energyPerKwh: saved.defaults?.energyPerKwh ?? base.defaults.energyPerKwh, laborPerHourMinor: saved.defaults?.laborPerHourMinor ?? base.defaults.laborPerHourMinor },
    spoolman: { ...base.spoolman, ...saved.spoolman },
    sheet: { ...base.sheet, ...saved.sheet },
    ui: { ...base.ui, ...saved.ui },
    comparedChannelIds: Array.isArray(saved.comparedChannelIds) ? saved.comparedChannelIds : channels.map((c) => c.id),
    defaultChannelId: saved.defaultChannelId && channels.some((c) => c.id === saved.defaultChannelId) ? saved.defaultChannelId : (channels[0]?.id ?? "direct"),
  };
}

export const newDraft = (s: Settings): Draft => ({
  quoteId: null, title: "", customer: "", note: "", channelId: s.defaultChannelId, quantity: 1, unitsPerSet: 1,
  plates: {}, overrides: {}, extras: [], discountTiers: s.defaults.discountTiers.map((t) => ({ ...t })), frozenPlates: null,
});

/** Draft plate controls survive a new slice by index; vanished indices are dropped. */
export function keepPlateControls(draft: Draft, plates: readonly HostPlate[]): Draft["plates"] {
  const keep = new Set(plates.map((p) => p.index));
  return Object.fromEntries(Object.entries(draft.plates).filter(([k]) => keep.has(Number(k))));
}

/** A plate was deleted at `index`: later plates moved down by one, so their controls move with them. */
export function shiftPlateControls(controls: Draft["plates"], index: number): Draft["plates"] {
  return Object.fromEntries(Object.entries(controls).flatMap(([k, v]) => {
    const i = Number(k);
    return i === index ? [] : [[i > index ? i - 1 : i, v]];
  }));
}
