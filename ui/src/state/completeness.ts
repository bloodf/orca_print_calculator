// What a plate snapshot does not actually know (docs/ux.md §6.12). Pure. A plate's time, a slot's weight and a slot's
// price per kg are each "known" or "unknown" independently of their number: unknown is stored as 0 for the engine, so
// the flag, not the number, decides. An explicit flag (true) keeps a legitimate 0.
//
// Snapshots saved before the flags existed are read from their own provenance, never guessed:
//  - a filament price of 0 is unknown: no source (Spoolman spool, filament, preset, manual) ever produced 0, only "no price";
//  - a slot weight of 0 stays unknown even when a sibling slot of the plate has a positive weight: the host never proved the
//    sibling rule (core._slots drops all-zero slots and a missing used_g reads as null), so 0 could be "not reported". It
//    may be confirmed one slot at a time;
//  - a plate time of 0 and a plate with no slots carry no proof: they stay unknown until the user confirms or re-slices.
import type { PlateSnapshot } from "./types";

export type Gap =
  | { kind: "time" | "consumption"; plate: number }
  | { kind: "grams" | "price"; plate: number; slot: number };

export type ExportBlock = "" | "quote.blockedUnknown" | "quote.blockedIncomplete";

const known = (flag: boolean | undefined, value: number): boolean => flag ?? value !== 0;

const gramsKnown = (s: PlateSnapshot["slots"][number]): boolean => s.gramsKnown ?? s.gramsMg !== 0;

/** Filament usage the file did not report: "missing" (or a legacy plate with no slot at all). */
export const consumptionMissing = (p: Pick<PlateSnapshot, "consumption" | "slots">): boolean => (p.consumption ?? (p.slots.length ? "known" : "missing")) === "missing";

/** `plate` is 1-based (what the user sees). */
export function snapshotGaps(p: PlateSnapshot): Gap[] {
  const plate = p.index + 1;
  const out: Gap[] = [];
  if (!known(p.secondsKnown, p.seconds)) out.push({ kind: "time", plate });
  if (consumptionMissing(p)) out.push({ kind: "consumption", plate });
  for (const s of p.slots) {
    if (!gramsKnown(s)) out.push({ kind: "grams", plate, slot: s.n });
    if (!known(s.priceKnown, s.pricePerKgMinor)) out.push({ kind: "price", plate, slot: s.n });
  }
  return out;
}

/** Every gap of the included plates, in plate order (what blocks a quote leaving the app, field by field). */
export const gapsOf = (plates: readonly PlateSnapshot[], included: (index: number) => boolean): Gap[] => plates.filter((p) => included(p.index)).flatMap(snapshotGaps);

/** The one rule for every way a quote leaves the app (CSV, HTML, print): unknown time/weight/usage first, then unpriced filament. */
export function exportBlockOf(plates: readonly PlateSnapshot[], included: (index: number) => boolean): ExportBlock {
  const gaps = gapsOf(plates, included);
  if (gaps.some((g) => g.kind !== "price")) return "quote.blockedUnknown";
  return gaps.length ? "quote.blockedIncomplete" : "";
}

/**
 * Gaps a person may settle by saying "0 is right": only those of a snapshot that predates the flags (nothing in the file says
 * whether 0 was read or missing) and whose zero is a believable value (a weight, a plate's filament use). A time of 0 never is.
 * A flag that is `false` was reported unknown by the host: that is fixed by slicing again, not by confirming.
 */
export function confirmable(p: PlateSnapshot, g: Gap): boolean {
  if (g.kind === "grams") return p.slots.find((s) => s.n === g.slot)?.gramsKnown === undefined;
  if (g.kind === "consumption") return p.consumption === undefined;
  return false;
}

/** Stamp one legacy gap as an explicit zero. Returns new plates; the input is untouched. */
export function confirmZero(plates: readonly PlateSnapshot[], g: Gap): PlateSnapshot[] {
  return plates.map((p) => {
    if (p.index + 1 !== g.plate || !confirmable(p, g)) return p;
    if (g.kind === "consumption") return { ...p, consumption: "zero" as const };
    if (g.kind === "grams") return { ...p, slots: p.slots.map((s) => (s.n === g.slot ? { ...s, gramsKnown: true } : s)) };
    return p;
  });
}
