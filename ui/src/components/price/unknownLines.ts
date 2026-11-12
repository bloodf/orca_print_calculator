// Cost lines whose amount is not known yet, and why (C05): the breakdown and the machine summary show them as "—" with the
// reason instead of leaving them out, which would read as a cost of zero. Pure over Derived.
import type { Derived } from "../../state/derive";

export type LineId = "filament" | "energy" | "depreciation" | "maintenance" | "labor" | "fixed";
/** "time": the plate time is unknown. "unset": the price or rate is not set. "grams": a weight or usage is unknown. */
export type Why = "time" | "unset" | "grams";
export type Unknown = Partial<Record<LineId, Why>>;

/** Canonical order of the engine's cost lines, used to place a line the engine left out. */
export const LINE_ORDER = ["filament", "energy", "depreciation", "maintenance", "failure", "labor", "fixed", "extras", "setup", "orderExtras", "shipping"] as const;

export function unknownLines(d: Derived): Unknown {
  const has = (kind: Derived["notCounted"][number]["kind"]): boolean => d.notCounted.some((c) => c.kind === kind);
  const time = has("time");
  const out: Unknown = {};
  if (has("energy")) out.energy = "unset";
  else if (time) out.energy = "time";
  if (d.defaults.depreciationEnabled) {
    if (has("wear")) out.depreciation = "unset";
    else if (time) out.depreciation = "time";
  }
  if (time && d.defaults.maintenancePerHourMinor > 0) out.maintenance = "time";
  if (time && d.defaults.fixedPerPrintHourMinor > 0) out.fixed = "time";
  if (has("labor")) out.labor = "unset";
  if (has("grams") || has("consumption")) out.filament = "grams";
  return out;
}
