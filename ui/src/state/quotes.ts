// Saved-quote actions (docs/ux.md §2.2, §5.3 QuoteActions, §7.2 reopening). Persist immediately via save_quotes.
import { call, errorCode } from "../bridge";
import { failText } from "../hostError";
import { intlLocale, t } from "../i18n";
import { quoteNo } from "../format";
import { newDraft } from "./defaults";
import { ref } from "vue";
import { filesText } from "../files";
import { newKey } from "../ids";
import { defaultsDiff, defaultsFromInput, safeDigits } from "./derive";
import { currency, derived, flushSettings, patchSettings, setPlates, store } from "./store";
import { toast } from "./toast";
import type { SavedQuote, SheetDetails } from "./types";

const sheetNow = (): SheetDetails => {
  const { shopName, footer, validityDays, taxId, phone, email, website, address, payment, accent } = store.settings.sheet;
  return { shopName, footer, validityDays, taxId, phone, email, website, address, payment, accent };
};

// Writes are serialized: each one is an update applied to the list as it is when its turn comes, so an overlapping
// failure rolls back only its own change and a retry never resends an old list.
let chain: Promise<unknown> = Promise.resolve();
function persist(update: (cur: SavedQuote[]) => SavedQuote[]): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    if (store.status !== "ready") return false; // before get_state succeeded the list is not the user's file
    if (store.unreadable.includes("quotes")) { toast({ text: t("host.unreadable", { files: filesText(["quotes"]) }), tone: "bad" }); return false; } // never written over
    const before = store.quotes;
    const quotes = update(before);
    store.quotes = quotes;
    try {
      await call("save_quotes", { quotes: [...quotes, ...(store.quarantined as SavedQuote[])] });
      return true;
    } catch (e) {
      store.quotes = before; // safe: writes are serialized, so nothing else changed the list meanwhile
      toast({ text: failText(t("host.cmdFailed", { action: t("quote.save") }), errorCode(e)), tone: "bad", action: { label: t("host.tryAgain"), run: () => void persist(update) } });
      console.error("save_quotes", errorCode(e));
      return false;
    }
  };
  const next = chain.then(run, run);
  chain = next;
  return next;
}

/** One above every number in use, whatever nextNo says. */
const freshNo = (): number => Math.max(store.settings.sheet.nextNo, ...store.quotes.map((q) => q.no + 1), ...store.quarantined.flatMap((q) => (typeof q === "object" && q !== null && Number.isInteger((q as { no?: unknown }).no) ? [(q as { no: number }).no + 1] : [])));
const bumpNextNo = (no: number): Promise<void> => { patchSettings((s) => ({ sheet: { ...s.sheet, nextNo: Math.max(s.sheet.nextNo, no + 1) } })); return flushSettings(true); };

export function openQuote(id: string): void {
  const q = store.quotes.find((x) => x.id === id);
  if (!q) return;
  try {
    const plates = Object.fromEntries(q.input.plates.map((p) => [p.index, { include: p.include, copies: p.copies }]));
    const next = {
      ...newDraft(store.settings), quoteId: q.id, title: q.title, customer: q.customer, note: q.note, channelId: q.channelId,
      quantity: q.input.quantity, unitsPerSet: q.input.unitsPerSet ?? 1, plates, extras: q.input.extras, discountTiers: q.input.discountTiers,
      overrides: {}, frozenPlates: q.plates, currency: q.currency, frozenInput: q.input, frozenDefaults: defaultsFromInput(q.input, safeDigits(q.currency)),
    };
    store.draft = next;
  } catch (e) {
    console.error("openQuote", e);
    toast({ text: t("quote.openFailed"), tone: "bad" });
    return;
  }
  store.view = "calc";
  store.preview = false;
}
export function closeQuote(): void {
  store.draft = newDraft(store.settings);
}
/** Replace the open quote's own printer, channels and cost defaults with today's settings, on purpose (the quote becomes edited). */
export function useCurrentSettings(): void {
  store.draft = { ...store.draft, frozenInput: null, frozenDefaults: null };
}
/** Unfreeze: a newer slice that arrived while the quote was open wins over the plates seen at open time. */
export function useCurrentSlice(): void {
  if (store.pendingPlates) setPlates(store.pendingPlates);
  // the quote's own cost defaults stay (as overrides of today's); its channels and printer profile give way to today's
  const kept = store.draft.frozenDefaults ? { ...defaultsDiff(store.draft.frozenDefaults, store.settings.defaults), ...store.draft.overrides } : store.draft.overrides;
  store.draft = { ...store.draft, frozenPlates: null, frozenInput: null, frozenDefaults: null, currency: null, overrides: kept };
}

let last: { asNew: boolean; p: Promise<SavedQuote | null> } | null = null;
let active = 0;
/** True while a save is in flight or queued (the Save buttons disable themselves). */
export const saveBusy = ref(false);

/**
 * Save the working quote. Returns the saved record, or null when there is no price to freeze.
 * A second call of the same kind shares the running save; a different kind ("Save as new" during "Save changes") waits its turn.
 */
export function saveQuote(asNew = false): Promise<SavedQuote | null> {
  if (last && last.asNew === asNew) return last.p;
  const run = (): Promise<SavedQuote | null> => doSave(asNew);
  active += 1;
  saveBusy.value = true;
  const p = (last ? last.p.then(run, run) : run()).finally(() => { active -= 1; saveBusy.value = active > 0; if (last?.p === p) last = null; });
  last = { asNew, p };
  return p;
}

async function doSave(asNew: boolean): Promise<SavedQuote | null> {
  const d = derived.value;
  const sel = d.selected;
  if (!d.result.ok || !sel || !sel.ok) return null;
  const now = new Date().toISOString();
  const prev = asNew ? undefined : store.quotes.find((q) => q.id === store.draft.quoteId);
  const no = prev?.no ?? freshNo();
  const record: SavedQuote = {
    id: prev?.id ?? newKey("q"), no, createdAt: prev?.createdAt ?? now, updatedAt: now,
    title: store.draft.title || store.host.projectName || "", customer: store.draft.customer, note: store.draft.note,
    currency: currency.value, channelId: d.selectedChannelId, plates: d.snapshots, input: d.quoteInput,
    summary: { channelName: sel.name, price: sel.price, grandTotal: sel.grandTotal, marginBp: sel.marginBp, quantity: store.draft.quantity },
    sheet: sheetNow(),
  };
  const ok = await persist((cur) => (prev ? cur.map((q) => (q.id === prev.id ? record : q)) : [...cur, record]));
  if (!ok) return null;
  if (!prev) await bumpNextNo(no);
  store.draft = { ...store.draft, quoteId: record.id };
  toast({ text: t("quote.saved", { no: quoteNo(no, intlLocale()) }) });
  return record;
}

export async function deleteQuote(id: string): Promise<void> {
  const i = store.quotes.findIndex((q) => q.id === id);
  const q = store.quotes[i];
  if (!q) return;
  if (!(await persist((cur) => cur.filter((x) => x.id !== id)))) return;
  toast({
    text: t("quote.deleted", { no: quoteNo(q.no, intlLocale()) }),
    // Undo puts it back at its old position unless it is already there (a double click, or a retry)
    action: { label: t("common.undo"), run: () => void persist((cur) => (cur.some((x) => x.id === q.id) ? cur : [...cur.slice(0, i), q, ...cur.slice(i)])) },
  });
}

export async function duplicateQuote(id: string): Promise<void> {
  const q = store.quotes.find((x) => x.id === id);
  if (!q) return;
  const no = freshNo();
  const now = new Date().toISOString();
  const copy = { ...q, id: newKey("q"), no, createdAt: now, updatedAt: now, sheet: sheetNow() };
  if (!(await persist((cur) => [...cur, copy]))) return;
  await bumpNextNo(no);
  toast({ text: t("quote.duplicated", { no: quoteNo(no, intlLocale()) }) });
}
