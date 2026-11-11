// Helpers shared by the cost sections and the header chips (docs/ux.md §5.3, §7.2). No store fields of their own.
import { computed, nextTick, type ComputedRef } from "vue";
import { decimalString } from "../../format";
import { t } from "../../i18n";
import { kwhE4 } from "../../engine/money";
import { clearOverride, derived, patchDefaults, patchDraft, patchSettings, result, setOverride, setSectionOpen, setView, store } from "../../state/store";
import { toast } from "../../state/toast";
import type { Defaults, OverridableKey, PrinterProfile } from "../../state/types";

/** One overridable default: effective value, the saved default, set (writes an override) and reset (with Undo). */
export function useDefault<K extends OverridableKey>(key: K): {
  value: ComputedRef<Defaults[K]>; base: ComputedRef<Defaults[K]>; set: (v: Defaults[K]) => void; reset: () => void;
} {
  return {
    value: computed(() => derived.value.defaults[key]),
    base: computed(() => store.settings.defaults[key]),
    set: (v) => setOverride(key, v),
    reset: () => {
      const prev = store.draft.overrides[key];
      clearOverride(key);
      toast({ text: t("common.resetDone"), action: { label: t("common.undo"), run: () => { if (prev !== undefined) setOverride(key, prev as Defaults[K]); } } });
    },
  };
}

export const hasOverride = (keys: readonly OverridableKey[]): boolean => keys.some((k) => k in store.draft.overrides);

/** Footer "Save as defaults": move the listed overrides into settings.defaults; Undo restores both. */
export function saveSectionDefaults(keys: readonly OverridableKey[]): void {
  const moved = Object.fromEntries(keys.filter((k) => k in store.draft.overrides).map((k) => [k, store.draft.overrides[k]]));
  if (!Object.keys(moved).length) return;
  const before = { defaults: store.settings.defaults, overrides: store.draft.overrides };
  const rest = { ...store.draft.overrides };
  if (!store.draft.frozenDefaults) keys.forEach((k) => delete rest[k]); // an open saved quote keeps its own value; only today's defaults change
  patchDefaults(moved);
  patchDraft({ overrides: rest });
  toast({
    text: t("section.savedDefaults"),
    action: { label: t("common.undo"), run: () => { patchSettings({ defaults: before.defaults }); patchDraft({ overrides: before.overrides }); } },
  });
}

/** Section open state: saved in settings.ui.open, else the section's own default. */
export function useOpen(id: string, initial: () => boolean): { open: ComputedRef<boolean>; set: (o: boolean) => void } {
  return { open: computed(() => store.settings.ui.open[id] ?? initial()), set: (o) => setSectionOpen(id, o) };
}

/** Does any engine problem path start with one of the prefixes? (auto-expands the section) */
export const hasProblem = (...prefixes: string[]): boolean => Object.keys(derived.value.fieldErrors).some((p) => prefixes.some((x) => p === x || p.startsWith(`${x}.`)));

/** Printer-scoped values save to settings.printers[model] at once (debounced persist), never as overrides. */
export function patchPrinter(model: string, patch: Partial<PrinterProfile>): void {
  patchSettings((s) => ({ printers: { ...s.printers, [model]: { ...(s.printers[model] ?? { watts: null, acquisitionMinor: null, lifetimeHours: null }), ...patch } } }));
}

/** Settings anchors are buttons, never links (docs/ux.md §7.10). */
export function gotoSettings(anchor: string): void {
  setView("settings");
  void nextTick(() => void nextTick(() => document.getElementById(anchor)?.scrollIntoView({ block: "start" })));
}

// ---- energy price: canonical text "0.95" <-> engine units at (digits + 2) ----
export const energyUnits = (text: string | null, digits: number): number | null => (text === null ? null : kwhE4(text, digits));
export function energyText(units: number | null, digits: number): string | null {
  if (units === null) return null;
  const s = decimalString(units, digits + 2);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** 0.10 major, at least 1 minor unit. */
export const smallStep = (digits: number): number => Math.max(1, 10 ** Math.max(0, digits - 1));

export { newKey } from "../../ids";

/** Per-piece cost of the named engine lines at the current quantity; null while the quote is not computable. */
export function perPiece(...ids: string[]): number | null {
  const r = result.value;
  return r.ok ? r.lines.filter((l) => ids.includes(l.id)).reduce((sum, l) => sum + l.perPiece, 0) : null;
}
