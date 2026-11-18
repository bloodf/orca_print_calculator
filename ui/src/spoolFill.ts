// How full a spool is, for OuiSpool's `fraction`: Spoolman's remaining weight over its initial weight, never guessed.
type Weights = { remainingWeight?: number | null; initialWeight?: number | null };

const usable = (s: Weights): s is { remainingWeight: number; initialWeight: number } =>
  typeof s.remainingWeight === "number" && Number.isFinite(s.remainingWeight)
  && typeof s.initialWeight === "number" && Number.isFinite(s.initialWeight) && s.initialWeight > 0;

/** remaining / initial, clamped to 0..1; null when either weight is missing (OuiSpool then draws the bare reel). */
export const spoolFraction = (s: Weights | undefined): number | null =>
  s && usable(s) ? Math.min(1, Math.max(0, s.remainingWeight / s.initialWeight)) : null;

/** Several spools of one filament as one reel: summed remaining over summed initial, of the spools whose weights are both known. */
export function stockFraction(spools: readonly Weights[]): number | null {
  const known = spools.filter(usable);
  if (!known.length) return null;
  const total = known.reduce((a, s) => a + s.initialWeight, 0);
  return Math.min(1, Math.max(0, known.reduce((a, s) => a + s.remainingWeight, 0) / total));
}
