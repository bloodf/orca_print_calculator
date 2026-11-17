// How much of each catalog extra a quote consumes, to compare with the units on hand (read-only: nothing is deducted
// here or in any other service). Pure. Per piece: every piece printed (spares included). Per plate: the copies of the
// included plates, once per run. Per order: once.
import type { CatalogExtra, HostSlot, QuoteExtra, QuoteInput, SlotMatchView, SpoolmanData } from "./types";

export type ProductionPlan = { pieces: number; copies: number; runs: number };

/** Runs, pieces printed and plate copies per run, read from the quote's own input (the same numbers the engine prices). */
export function planOf(input: { plates: readonly Pick<QuoteInput["plates"][number], "include" | "copies">[]; quantity: number; unitsPerSet?: number }): ProductionPlan {
  const unitsPerSet = Math.max(1, input.unitsPerSet ?? 1);
  const runs = Math.max(1, Math.ceil(Math.max(1, input.quantity) / unitsPerSet));
  const copies = input.plates.reduce((sum, p) => sum + (p.include ? p.copies : 0), 0);
  return { pieces: runs * unitsPerSet, copies, runs };
}

/** Quantity (E3, same scale as the catalog's stock) one row needs. */
export const needOf = (e: Pick<QuoteExtra, "per" | "qtyE3">, plan: ProductionPlan): number =>
  e.per === "piece" ? e.qtyE3 * plan.pieces : e.per === "plate" ? e.qtyE3 * plan.copies * plan.runs : e.qtyE3;

/**
 * The catalog item a row stands for: its `catalogKey` while that item exists (renaming either side keeps the link),
 * else, for rows saved before the key existed, the item with the same name.
 */
export function catalogItemOf(e: Pick<QuoteExtra, "label" | "catalogKey">, catalog: readonly CatalogExtra[]): CatalogExtra | undefined {
  return (e.catalogKey !== undefined ? catalog.find((c) => c.key === e.catalogKey) : undefined) ?? catalog.find((c) => c.label === e.label);
}

/** Total need per catalog item key, over every row that stands for it. */
export function demandByItem(extras: readonly QuoteExtra[], catalog: readonly CatalogExtra[], plan: ProductionPlan): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of extras) {
    const item = catalogItemOf(e, catalog);
    if (item) out.set(item.key, (out.get(item.key) ?? 0) + needOf(e, plan));
  }
  return out;
}

export type FilamentShort = { filamentId: number; name: string; needG: number; haveG: number; /** Set when a picked or linked spool is short: only its own weight counts. */ spoolId?: number };
type StockPlate = { index: number; include: boolean; copies: number; slots: { n: number; gramsMg: number }[] };
type StockView = Pick<SlotMatchView, "filamentId"> & Partial<Pick<SlotMatchView, "spoolId" | "spoolPinned">> & { slot: Pick<HostSlot, "n"> };

/**
 * Spoolman filaments this quote prints more of than their spools hold: every included plate copy, every run, summed per
 * filament, against the remaining weight of its spools that are not archived. A slot tied to one spool (picked, or linked
 * by Spooler or `orca_filament_preset`) is judged against that spool alone. A filament or spool with no known remaining
 * weight is not judged. Read-only, like the extras check.
 */
export function filamentShortages(
  input: { plates: StockPlate[]; quantity: number; unitsPerSet?: number },
  matches: Readonly<Record<number, readonly StockView[]>>,
  data: { filaments: readonly Pick<SpoolmanData["filaments"][number], "id" | "name">[]; spools: readonly { id?: number; filamentId: number; archived: boolean; remainingWeight?: number | null }[] },
): FilamentShort[] {
  const { runs } = planOf(input);
  const need = new Map<string, { filamentId: number; spoolId?: number; mg: number }>();
  for (const p of input.plates) {
    if (!p.include) continue;
    for (const v of matches[p.index] ?? []) {
      const s = v.filamentId === null ? undefined : p.slots.find((x) => x.n === v.slot.n);
      if (!s || v.filamentId === null) continue;
      const spoolId = v.spoolPinned && typeof v.spoolId === "number" ? v.spoolId : undefined;
      const key = spoolId === undefined ? `f${v.filamentId}` : `s${spoolId}`;
      const row = need.get(key) ?? { filamentId: v.filamentId, ...(spoolId === undefined ? {} : { spoolId }), mg: 0 };
      need.set(key, { ...row, mg: row.mg + s.gramsMg * p.copies * runs });
    }
  }
  const known = (w: number | null | undefined): w is number => typeof w === "number" && Number.isFinite(w);
  // A pinned spool's own slots are served first; only what is left on it after them counts for the filament's other slots.
  const spare = (s: { id?: number; remainingWeight?: number | null }): number | null | undefined => {
    const used = s.id === undefined ? undefined : need.get(`s${s.id}`);
    return used && known(s.remainingWeight) ? Math.max(0, s.remainingWeight - used.mg / 1000) : s.remainingWeight;
  };
  const out: FilamentShort[] = [];
  for (const { filamentId: id, spoolId, mg } of need.values()) {
    const left = data.spools.filter((s) => (spoolId === undefined ? s.filamentId === id : s.id === spoolId) && !s.archived)
      .map((s) => (spoolId === undefined ? spare(s) : s.remainingWeight)).filter(known);
    const haveG = left.reduce((a, b) => a + b, 0);
    const name = data.filaments.find((f) => f.id === id)?.name ?? `#${id}`;
    if (left.length && mg > Math.round(haveG * 1000)) out.push({ filamentId: id, name, needG: mg / 1000, haveG, ...(spoolId === undefined ? {} : { spoolId }) });
  }
  return out;
}
