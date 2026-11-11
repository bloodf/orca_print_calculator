// Pure host + settings + draft -> engine input -> result mapping (docs/ux.md §5.1). No Vue, no store: unit-tested directly.
import { toChannelInput, type ChannelDef } from "../engine/channels";
import { currencyDigits, kwhE4 } from "../engine/money";
import { decimalString } from "../format";
import { matchSlot, type SpoolmanFilament, type SpoolmanSpool } from "../engine/match";
import { resolveWatts, type ResolvedWatts } from "../engine/printerMatch";
import { computeQuote, type ChannelQuote, type QuoteChannel, type QuoteInput, type QuotePlate, type QuoteResult, type QuoteSlot } from "../engine/quote";
import { presetFor } from "./markup";
import type { Defaults, Draft, HostInfo, HostPlate, HostSlot, NotCounted, PlateSnapshot, Settings, SlotMatchView, SpoolerInfo } from "./types";

export type DeriveInput = {
  settings: Settings; draft: Draft; plates: readonly HostPlate[]; host: HostInfo;
  spoolman: { filaments: readonly SpoolmanFilament[]; spools: readonly SpoolmanSpool[] };
  spooler: SpoolerInfo; currency: string;
};
export type Derived = {
  digits: number; defaults: Defaults; selectedChannelId: string;
  slotMatches: Record<number, SlotMatchView[]>;
  snapshots: PlateSnapshot[];
  printer: ResolvedWatts & { model: string | null };
  quoteInput: QuoteInput; result: QuoteResult; selected: ChannelQuote | null;
  notCounted: NotCounted[]; skippedChannels: ChannelDef[];
  fieldErrors: Record<string, string>;
};

export const safeDigits = (currency: string): number => {
  try { return currencyDigits(currency); } catch { return 2; }
};
/** The cost defaults a saved quote was priced with, read back from its frozen engine input (exact for every Defaults key). */
export function defaultsFromInput(input: QuoteInput, digits: number): Defaults {
  const c = input.costs;
  const e4 = c.kwhE4 === 0 ? null : decimalString(c.kwhE4, digits + 2).replace(/\.?0+$/, "");
  const ship = input.shipping.mode === "customer" && input.shipping.minor === 0 ? { mode: "none" as const, minor: 0 } : input.shipping;
  return {
    energyPerKwh: e4, failureBp: c.failure.bp, failureMode: c.failure.mode, failureIncludesMachine: c.failure.includesMachine,
    depreciationEnabled: c.depreciationEnabled, maintenancePerHourMinor: c.maintenancePerHourCents, fixedPerPrintHourMinor: c.fixedCostPerPrintHourCents,
    laborPerHourMinor: c.labor.perHourCents === 0 ? null : c.labor.perHourCents, laborMinutes: c.labor.minutes, setupMinutes: input.setup.minutes,
    targetMarginBp: input.targetMarginBp, pretty: input.pretty, minOrderMinor: input.minOrderMinor,
    shipping: ship, discountTiers: input.discountTiers.map((t) => ({ ...t })),
  };
}
/** Keys of `value` that differ from `base` (what a draft stores as overrides). */
export function defaultsDiff(value: Defaults, base: Defaults): Draft["overrides"] {
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(value) as (keyof Defaults)[]) if (JSON.stringify(value[k]) !== JSON.stringify(base[k])) o[k] = value[k];
  return o as Draft["overrides"];
}
/** Draft overrides win over the defaults (§7.2). */
export const effectiveDefaults = (d: Defaults, overrides: Draft["overrides"]): Defaults => ({ ...d, ...overrides });

export function slotKey(source: SlotMatchView["source"], filamentId: number | null, spoolId: number | null, preset: string): string {
  if (source === "manual") return `manual:${preset}`;
  if (source === "preset") return `preset:${preset}`;
  if (source === "none" || filamentId === null) return `none:${preset}`;
  return `sm:${filamentId}:${spoolId ?? 0}`;
}

function viewOf(plateIndex: number, slot: HostSlot, i: DeriveInput): SlotMatchView {
  const m = matchSlot(
    { n: slot.n, preset: slot.preset, costPerKg: slot.costPerKg, notes: slot.notes },
    { filaments: i.spoolman.filaments, spools: i.spoolman.spools, overrides: i.settings.slotOverrides, spoolerPresetToFilament: i.spooler?.presetToFilament ?? {} },
  );
  const manual = i.settings.manualPrices[slot.preset];
  if ((m.source === "none" || m.source === "preset") && typeof manual === "number" && manual > 0) {
    const pricePerKg = manual / 10 ** safeDigits(i.currency);
    return { plateIndex, slot, key: slotKey("manual", null, null, slot.preset), source: "manual", filamentId: null, spoolId: null, pricePerKg, priceSource: "manual" };
  }
  return { plateIndex, slot, key: slotKey(m.source, m.filamentId, m.spoolId, slot.preset), source: m.source, filamentId: m.filamentId, spoolId: m.spoolId, pricePerKg: m.pricePerKg, priceSource: m.priceSource };
}

const toQuoteSlot = (v: SlotMatchView, digits: number): QuoteSlot => ({
  n: v.slot.n, label: v.slot.preset, key: v.key,
  gramsMg: v.slot.grams === null ? 0 : Math.round(v.slot.grams * 1000),
  pricePerKgMinor: v.pricePerKg === null ? 0 : Math.round(v.pricePerKg * 10 ** digits),
});

/** Frozen plates (saved quote): the snapshot already holds engine slots; make render views from them. */
function frozenViews(p: PlateSnapshot, digits: number): SlotMatchView[] {
  return p.slots.map((s) => ({
    plateIndex: p.index,
    slot: { n: s.n, preset: s.label, grams: s.gramsMg / 1000, color: s.color, costPerKg: null, notes: "", material: null },
    key: s.key, source: s.source, filamentId: s.filamentId ?? null, spoolId: null,
    pricePerKg: s.pricePerKgMinor / 10 ** digits,
    priceSource: s.source === "manual" ? "manual" : s.source === "preset" ? "preset" : s.source === "none" ? null : "filament",
  }));
}

function channelsFor(i: DeriveInput, selectedId: string): { list: QuoteChannel[]; skipped: ChannelDef[] } {
  const wanted = new Set([...i.settings.comparedChannelIds, selectedId]);
  const list: QuoteChannel[] = [];
  const skipped: ChannelDef[] = [];
  for (const def of i.settings.channels.filter((c) => wanted.has(c.id))) {
    const r = toChannelInput(def);
    if (r.ok) list.push({ ...r.input, id: def.id, name: def.name });
    else skipped.push(def);
  }
  return { list, skipped };
}

const shippingOf = (s: Defaults["shipping"]): QuoteInput["shipping"] => (s.mode === "absorbed" ? { mode: "absorbed", minor: s.minor } : { mode: "customer", minor: s.mode === "none" ? 0 : s.minor });

/** Printer price and lifetime: the saved profile, else the built-in value for the currency, else not set. */
export function machineOf(i: Pick<DeriveInput, "host" | "settings" | "currency">): { acquisitionMinor: number | null; lifetimeHours: number | null } {
  const profile = i.host.printerModel ? i.settings.printers[i.host.printerModel] : undefined;
  const preset = profile || i.host.printerModel ? presetFor(i.currency) : null; // no printer, no fields to edit it: nothing hidden is charged
  return { acquisitionMinor: profile?.acquisitionMinor ?? preset?.printerMinor ?? null, lifetimeHours: profile?.lifetimeHours ?? preset?.lifetimeHours ?? null };
}

function costsOf(i: DeriveInput, d: Defaults, digits: number, watts: number): QuoteInput["costs"] {
  const m = machineOf(i);
  return {
    machine: { wattsW10: Math.round(watts * 10), acquisitionCents: m.acquisitionMinor ?? 0, lifetimeHours: Math.round(m.lifetimeHours ?? 0) },
    kwhE4: (d.energyPerKwh === null ? null : kwhE4(d.energyPerKwh, digits)) ?? 0,
    failure: { bp: d.failureBp, mode: d.failureMode, includesMachine: d.failureIncludesMachine },
    depreciationEnabled: d.depreciationEnabled,
    maintenancePerHourCents: d.maintenancePerHourMinor,
    labor: { perHourCents: d.laborPerHourMinor ?? 0, minutes: d.laborMinutes },
    fixedCostPerPrintHourCents: d.fixedPerPrintHourMinor,
  };
}

function notCountedOf(i: DeriveInput, d: Defaults, plates: readonly HostPlate[], views: Record<number, SlotMatchView[]>, fi: QuoteInput | null): NotCounted[] {
  const out: NotCounted[] = [];
  // A saved quote cannot tell "not set" from an explicit 0, so it raises no energy or labor flag; its wear flag reads its own frozen printer.
  if (!fi && d.energyPerKwh === null) out.push({ kind: "energy" });
  if (!fi && d.laborPerHourMinor === null) out.push({ kind: "labor" });
  const p = machineOf(i);
  const hasWear = fi ? !!fi.costs.machine.acquisitionCents && !!fi.costs.machine.lifetimeHours : !!p.acquisitionMinor && !!p.lifetimeHours;
  if (d.depreciationEnabled && !hasWear) out.push({ kind: "wear" });
  for (const pl of plates) {
    if (!(i.draft.plates[pl.index]?.include ?? true)) continue;
    if (pl.seconds === null) out.push({ kind: "time", plate: pl.index + 1 });
    for (const v of views[pl.index] ?? []) if (v.slot.grams === null) out.push({ kind: "grams", plate: pl.index + 1, slot: v.slot.n });
  }
  return out;
}

export function deriveQuote(i: DeriveInput): Derived {
  const digits = safeDigits(i.currency);
  const fi = i.draft.frozenInput ?? null; // a saved quote is open: its own numbers, not today's settings
  const defaults = effectiveDefaults(i.draft.frozenDefaults ?? i.settings.defaults, i.draft.overrides);
  const frozen = i.draft.frozenPlates;
  const slotMatches: Record<number, SlotMatchView[]> = {};
  const qPlates: QuotePlate[] = [];
  const snapshots: PlateSnapshot[] = [];
  const ctl = (idx: number) => i.draft.plates[idx] ?? { include: true, copies: 1 };

  if (frozen) {
    for (const p of frozen) {
      slotMatches[p.index] = frozenViews(p, digits);
      qPlates.push({ index: p.index, name: p.name ?? undefined, seconds: p.seconds, include: ctl(p.index).include, copies: ctl(p.index).copies, slots: p.slots.map(({ n, label, key, gramsMg, pricePerKgMinor }) => ({ n, label, key, gramsMg, pricePerKgMinor })) }); // same key order as toQuoteSlot
      snapshots.push(p);
    }
  } else {
    for (const p of i.plates) {
      const views = p.slots.map((s) => viewOf(p.index, s, i));
      slotMatches[p.index] = views;
      const slots = views.map((v) => toQuoteSlot(v, digits));
      const seconds = p.seconds ?? 0;
      qPlates.push({ index: p.index, name: p.name ?? undefined, seconds, include: ctl(p.index).include, copies: ctl(p.index).copies, slots });
      snapshots.push({ index: p.index, name: p.name, seconds, slots: slots.map((s, k) => ({ ...s, color: p.slots[k]?.color ?? null, source: views[k]?.source ?? "none", filamentId: views[k]?.filamentId ?? null })) });
    }
  }

  const have = fi ? fi.channels : i.settings.channels;
  const known = (id: string) => have.some((c) => c.id === id);
  const selectedChannelId = known(i.draft.channelId) ? i.draft.channelId : !fi && known(i.settings.defaultChannelId) ? i.settings.defaultChannelId : (have[0]?.id ?? "");
  const { list, skipped } = fi ? { list: fi.channels, skipped: [] as ChannelDef[] } : channelsFor(i, selectedChannelId);
  const saved = Object.fromEntries(Object.entries(i.settings.printers).flatMap(([k, v]) => (v.watts ? [[k, { watts: v.watts }]] : [])));
  const printer = { ...resolveWatts(i.host.printerModel ?? "", i.host.printerVendor ?? undefined, saved), model: i.host.printerModel };
  const labor = setupRate(defaults);

  const quoteInput: QuoteInput = {
    plates: qPlates, unitsPerSet: i.draft.unitsPerSet, quantity: i.draft.quantity,
    costs: fi ? { ...costsOf(i, defaults, digits, printer.watts), machine: fi.costs.machine } : costsOf(i, defaults, digits, printer.watts),
    setup: { ratePerHourMinor: labor, minutes: defaults.setupMinutes },
    extras: i.draft.extras, shipping: shippingOf(defaults.shipping),
    channels: list, targetMarginBp: defaults.targetMarginBp, discountTiers: i.draft.discountTiers,
    pretty: defaults.pretty, minOrderMinor: defaults.minOrderMinor,
  };
  const result = run(quoteInput);
  return {
    digits, defaults, selectedChannelId, slotMatches, snapshots, printer, quoteInput, result,
    selected: result.ok ? (result.channels.find((c) => c.id === selectedChannelId) ?? null) : null,
    notCounted: notCountedOf(i, defaults, frozen ? [] : i.plates, slotMatches, fi), skippedChannels: skipped,
    fieldErrors: result.ok ? {} : Object.fromEntries(result.problems.map((p) => [p.path, p.code])),
  };
}

/** What the panels see when deriving the quote itself threw (a corrupted value somewhere): an error state, never a blank price. */
export function failedDerive(currency: string, draft: Draft, defaults: Defaults): Derived {
  const quoteInput = { plates: [], quantity: draft.quantity, costs: {}, setup: { ratePerHourMinor: 0, minutes: 0 }, extras: [], shipping: { mode: "customer", minor: 0 }, channels: [], targetMarginBp: 0, discountTiers: [], pretty: "none", minOrderMinor: 0 } as unknown as QuoteInput;
  return {
    digits: safeDigits(currency), defaults, selectedChannelId: "", slotMatches: {}, snapshots: [], printer: { watts: 0, source: "default", match: null, model: null } as unknown as Derived["printer"],
    quoteInput, result: { ok: false, problems: [{ code: "invalid_option", path: "settings" }] }, selected: null, notCounted: [], skippedChannels: [], fieldErrors: { settings: "invalid_option" },
  };
}

const setupRate = (x: Defaults): number => x.laborPerHourMinor ?? 0; // setup is charged at the labor rate

function run(input: QuoteInput): QuoteResult {
  try {
    return computeQuote(input);
  } catch {
    return { ok: false, problems: [{ code: "engine_range", path: "" }] };
  }
}
