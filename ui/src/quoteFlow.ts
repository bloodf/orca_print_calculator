// Export flow shared by QuoteActions, QuotesView and QuotePreview: saved quote -> sheet/CSV -> bridge export_file -> toast.
import { call, errorCode } from "./bridge";
import { copyText } from "./clipboard";
import { failText } from "./hostError";
import { computeQuote } from "./engine/quote";
import { t } from "./i18n";
import { buildCsv } from "./quoteCsv";
import { buildSheetModel, sheetHtml, type SheetModel } from "./quoteExport";
import { exportBlockOf, type ExportBlock } from "./state/completeness";
import { isDirty, savedOf } from "./state/dirty";
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

/** Why a saved record may not leave the app (CSV, HTML, print), as an i18n key; "" = allowed. Same rule as the calculator's. */
export function savedExportBlock(q: SavedQuote): "quote.blockedNoPrice" | ExportBlock {
  if (!priced(q)) return "quote.blockedNoPrice";
  return exportBlockOf(q.plates, (index) => q.input.plates.find((p) => p.index === index)?.include !== false);
}

export function exportText(q: SavedQuote, kind: ExportKind): { name: string; text: string } | null {
  const p = priced(q);
  if (!p || savedExportBlock(q)) return null;
  const stem = `quote-${String(q.no).padStart(4, "0")}`;
  if (kind === "csv") {
    const text = buildCsv({ no: q.no, dateIso: q.updatedAt, customer: q.customer, title: q.title, currency: q.currency, digits: safeDigits(q.currency), input: q.input, result: p.result, selected: p.selected });
    return { name: `${stem}.csv`, text };
  }
  const model = sheetFor(q);
  return model ? { name: `${stem}.html`, text: sheetHtml(model) } : null;
}

export { isDirty, savedOf };

/**
 * Why export is blocked, as an i18n key ("" = allowed). Only what the user cannot see or fix at a glance blocks:
 * no price at all, an unknown plate time or weight, or an unpriced filament. Missing energy, labor or printer wear are
 * named next to the price as "not counted" and never block.
 */
export function exportBlock(): "quote.blockedNoPrice" | ExportBlock {
  const d = derived.value;
  if (!d.result.ok || !d.selected?.ok) return "quote.blockedNoPrice";
  return exportBlockOf(d.snapshots, (index) => store.draft.plates[index]?.include !== false);
}

/** True (after telling the user why, with a way to fix it) when `q` is incomplete: a draft may be saved, never sent. */
function refuse(q: SavedQuote): boolean {
  const why = savedExportBlock(q);
  if (!why) return false;
  toast({ text: t(why), tone: "bad", action: { label: t("quotes.open"), run: () => openQuote(q.id) } });
  return true;
}

/** From a list row, export that record as is. From the calculator, an unsaved or changed quote is saved first (toast from saveQuote). */
export async function exportQuote(kind: ExportKind, q: SavedQuote | null = null): Promise<void> {
  const rec = q ?? (isDirty() ? await saveQuote() : savedOf());
  if (rec && refuse(rec)) return;
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
  if (refuse(q)) return;
  openQuote(q.id);
  store.preview = true;
  setTimeout(() => window.print(), 50);
}
