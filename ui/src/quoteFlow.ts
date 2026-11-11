// Export flow shared by QuoteActions, QuotesView and QuotePreview: saved quote -> sheet/CSV -> bridge export_file -> toast.
import { call, errorCode } from "./bridge";
import { copyText } from "./clipboard";
import { failText } from "./hostError";
import { computeQuote } from "./engine/quote";
import { t } from "./i18n";
import { buildCsv } from "./quoteCsv";
import { buildSheetModel, sheetHtml, type SheetModel } from "./quoteExport";
import { openQuote, saveQuote } from "./state/quotes";
import { safeDigits } from "./state/derive";
import { derived, store } from "./state/store";
import { toast } from "./state/toast";
import type { SavedQuote } from "./state/types";

export type ExportKind = "html" | "csv";

/** Recompute the frozen input (pure, deterministic) and pick the quote's channel; null when it no longer prices. */
function priced(q: SavedQuote) {
  const result = computeQuote(q.input);
  const selected = result.ok ? result.channels.find((c) => c.id === q.channelId) : undefined;
  return result.ok && selected?.ok ? { result, selected } : null;
}

export function sheetFor(q: SavedQuote, itemized = store.settings.ui.sheetMode === "itemized"): SheetModel | null {
  const p = priced(q);
  if (!p) return null;
  return buildSheetModel({
    no: q.no, dateIso: q.updatedAt, title: q.title, customer: q.customer, note: q.note, currency: q.currency,
    plates: q.input.plates, quantity: q.input.quantity, result: p.result, selected: p.selected, sheet: { ...store.settings.sheet, ...q.sheet }, itemized,
  });
}

export function exportText(q: SavedQuote, kind: ExportKind): { name: string; text: string } | null {
  const p = priced(q);
  if (!p) return null;
  const stem = `quote-${String(q.no).padStart(4, "0")}`;
  if (kind === "csv") {
    const text = buildCsv({ no: q.no, dateIso: q.updatedAt, customer: q.customer, title: q.title, currency: q.currency, digits: safeDigits(q.currency), input: q.input, result: p.result, selected: p.selected });
    return { name: `${stem}.csv`, text };
  }
  const model = sheetFor(q);
  return model ? { name: `${stem}.html`, text: sheetHtml(model) } : null;
}

/** The saved record behind the working quote, if any. */
export const savedOf = (): SavedQuote | null => store.quotes.find((q) => q.id === store.draft.quoteId) ?? null;

/** JSON with sorted keys: two equal values never differ just because their keys were built in another order. */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));

/** Working quote differs from its saved record (price inputs, title, customer or note). */
export function isDirty(): boolean {
  const q = savedOf();
  const d = store.draft;
  return !q || q.title !== (d.title || store.host.projectName || "") || q.customer !== d.customer || q.note !== d.note || stable(q.input) !== stable(derived.value.quoteInput);
}

/**
 * Why export is blocked, as an i18n key ("" = allowed). Only what the user cannot see or fix at a glance blocks:
 * no price at all, an unknown plate time or weight, or an unpriced filament. Missing energy, labor or printer wear are
 * named next to the price as "not counted" and never block.
 */
export function exportBlock(): "" | "quote.blockedNoPrice" | "quote.blockedUnknown" | "quote.blockedIncomplete" {
  const d = derived.value;
  if (!d.result.ok || !d.selected?.ok) return "quote.blockedNoPrice";
  if (d.notCounted.some((n) => n.kind === "time" || n.kind === "grams")) return "quote.blockedUnknown";
  const unpriced = Object.entries(d.slotMatches).some(([i, slots]) => store.draft.plates[Number(i)]?.include !== false && slots.some((s) => s.pricePerKg === null));
  return unpriced ? "quote.blockedIncomplete" : "";
}

/** From a list row, export that record as is. From the calculator, an unsaved or changed quote is saved first (toast from saveQuote). */
export async function exportQuote(kind: ExportKind, q: SavedQuote | null = null): Promise<void> {
  const rec = q ?? (isDirty() ? await saveQuote() : savedOf());
  const file = rec ? exportText(rec, kind) : null;
  if (!file) { toast({ text: t("export.failed"), tone: "bad" }); return; }
  try {
    const { path } = await call("export_file", file);
    toast({ text: t("export.saved", { path }), action: { label: t("export.copyPath"), run: () => void copyText(path).then((ok) => { if (ok) toast({ text: t("export.copied") }); }) }, ms: 12000 });
  } catch (e) {
    console.error("export_file", errorCode(e));
    toast({ text: failText(t("export.failed"), errorCode(e), "export"), tone: "bad" });
  }
}

/** Show the sheet of a saved quote and open the print dialog. */
export function printQuote(q: SavedQuote): void {
  openQuote(q.id);
  store.preview = true;
  setTimeout(() => window.print(), 50);
}
