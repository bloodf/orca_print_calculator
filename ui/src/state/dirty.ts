// What the working quote holds that is not on disk (docs/ux.md §7.2). Pure reads over the store.
import { derived, store } from "./store";
import { newDraft } from "./defaults";
import type { Draft, SavedQuote } from "./types";

/** The saved record behind the working quote, if any. */
export const savedOf = (): SavedQuote | null => store.quotes.find((q) => q.id === store.draft.quoteId) ?? null;

/** JSON with sorted keys: two equal values never differ just because their keys were built in another order. */
export const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));

/** Working quote differs from its saved record (price inputs, title, customer, note, or a confirmed zero). */
export function isDirty(): boolean {
  const q = savedOf();
  const d = store.draft;
  return !q || q.title !== (d.title || store.host.projectName || "") || q.customer !== d.customer || q.note !== d.note || stable(q.input) !== stable(derived.value.quoteInput)
    || (!!d.frozenPlates && stable(q.plates) !== stable(d.frozenPlates)); // a gap confirmed on the open quote is an edit
}

/** What the user typed or chose in a draft, minus plate controls still at their defaults (the list creates those on its own). */
const workOf = (d: Draft) => ({
  title: d.title, customer: d.customer, note: d.note, channelId: d.channelId, quantity: d.quantity, unitsPerSet: d.unitsPerSet,
  plates: Object.fromEntries(Object.entries(d.plates).filter(([, c]) => !(c.include && c.copies === 1))),
  overrides: d.overrides, extras: d.extras, discountTiers: d.discountTiers, frozenPlates: d.frozenPlates, frozenInput: d.frozenInput ?? null,
});

/**
 * True when replacing the working quote would throw something away: an open saved quote edited since it was saved, or a quote
 * that was never saved and holds anything the user entered. A clean quote, or an untouched blank one, is nothing to lose.
 */
export function hasUnsavedWork(): boolean {
  if (savedOf()) return isDirty();
  return stable(workOf(store.draft)) !== stable(workOf(newDraft(store.settings)));
}
