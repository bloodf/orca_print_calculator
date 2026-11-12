// Replacing the working quote (close, open another, take the current slice, host switched project) never loses unsaved work
// silently: when there was some, the old state is kept whole and a toast offers Undo (docs/ux.md §7.2, same pattern as deleting a quote).
import { t } from "../i18n";
import { hasUnsavedWork, stable } from "./dirty";
import { store } from "./store";
import { toast } from "./toast";
import type { Draft, HostPlate } from "./types";

type Snap = { draft: Draft; plates: HostPlate[]; pending: HostPlate[] | null };
const snap = (): Snap => ({ draft: store.draft, plates: store.plates, pending: store.pendingPlates });

/** Undo stays open long enough to read and decide; errors elsewhere stay until closed, this one does not. */
const UNDO_MS = 15000;

/**
 * Run `change`, which replaces the working quote. With unsaved work in it, afterwards offer Undo with the whole previous draft
 * (customer, notes, edited values, confirmed zeros, quote id). Undo only applies while the draft is still exactly what `change`
 * produced: any newer edit wins and nothing is overwritten. `withPlates` also restores the plates the change swapped out
 * (not for a host-driven project switch, whose old plates are gone for good), and only if the host has sent none since.
 */
export function changeDraft(change: () => void, messageKey: string, opts: { withPlates?: boolean } = {}): void {
  const had = hasUnsavedWork();
  const before = snap();
  change();
  if (!had) return;
  const after = snap();
  toast({
    text: t(messageKey),
    ms: UNDO_MS,
    action: {
      label: t("common.undo"),
      run: () => {
        if (stable(store.draft) !== stable(after.draft)) { toast({ text: t("draft.undoStale") }); return; }
        store.draft = before.draft;
        if (opts.withPlates !== false && store.plates === after.plates && store.pendingPlates === after.pending) {
          store.plates = before.plates;
          store.pendingPlates = before.pending;
        }
        toast({ text: t("draft.restored") });
      },
    },
  });
}
