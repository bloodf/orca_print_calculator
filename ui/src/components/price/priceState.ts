// Shared view-model helpers for the price panel: formatting bound to the store, the hero state, the
// remembered open state of detail sections, and focus helpers. Read-only over the store.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, type Ref, type WritableComputedRef } from "vue";
import { money, percent } from "../../format";
import { t } from "../../i18n";
import type { ChannelOk, ChannelQuote } from "../../engine/quote";
import { currency, derived, locale, result, selected, setSectionOpen, setView, store } from "../../state/store";
import { slotsWithoutPrice } from "./flagList";

export const m = (minor: number): string => money(minor, currency.value, locale.value);
export const pct = (bp: number): string => percent(bp, locale.value);
/** Money with a typographic minus for losses: "−R$ 1,20". */
export const signed = (minor: number): string => (minor < 0 ? `−${m(-minor)}` : m(minor));

export type Hero =
  | { kind: "price"; sel: ChannelOk }
  | { kind: "impossible"; channel: string }
  | { kind: "sentence"; text: string; fees: boolean; quiet?: boolean };

export const hasPlates = (): boolean => derived.value.quoteInput.plates.length > 0 || !!store.draft.frozenPlates;

/** Quote-level failure to its hero sentence (docs/ux.md §6.9). */
export function problemSentence(codes: readonly string[]): string {
  if (codes.includes("no_plates")) return t("price.includeOne");
  if (codes.includes("overflow")) return t("price.overflow");
  if (codes.includes("engine_range")) return t("price.engineRange");
  if (codes.includes("material_price_conflict")) return t("price.materialConflict");
  return t("price.fixField");
}

/** Channel-level problem to its sentence; margin_impossible has its own layout. */
export function channelProblemSentence(c: Extract<ChannelQuote, { ok: false }>): string {
  if (c.problem === "margin_impossible") return t("price.impossibleTitle", { channel: c.name });
  if (c.problem === "search_bound_exceeded") return t("price.searchBound");
  if (c.problem === "overflow") return t("price.overflow");
  return t("price.channelInvalid");
}

export const hero = computed<Hero>(() => {
  const r = result.value;
  if (!hasPlates()) return { kind: "sentence", text: t("price.noPlates"), fees: false, quiet: true };
  if (!r.ok) return { kind: "sentence", text: problemSentence(r.problems.map((p) => p.code)), fees: false };
  const sel = selected.value;
  if (!sel) return { kind: "sentence", text: t("price.channelInvalid"), fees: true };
  if (sel.ok) return { kind: "price", sel };
  if (sel.problem === "margin_impossible") return { kind: "impossible", channel: sel.name };
  return { kind: "sentence", text: channelProblemSentence(sel), fees: sel.problem !== "overflow" };
});

/** Things the price does not count yet (unknown time/weight/usage, unset energy/labor/wear, unpriced filament): the number is partial. */
export const missingCount = computed(() => derived.value.notCounted.length + slotsWithoutPrice(derived.value).length);

/** True while an offline Spoolman (one that is configured) leaves some included filament priced from profiles or manual prices. */
export const priceFromFallback = computed(() => {
  if (store.draft.frozenPlates || !store.settings.spoolman.url.trim() || store.spoolman.state !== "offline") return false;
  return derived.value.quoteInput.plates.some((p) => p.include && (derived.value.slotMatches[p.index] ?? []).some((v) => v.priceSource === "preset" || v.priceSource === "manual"));
});

/** Move focus to what explains what is missing: the gap list (unknown values and unpriced filament are all listed there), else the not-counted note. */
export async function focusMissing(): Promise<void> {
  await nextTick();
  const el = document.querySelector<HTMLElement>("[data-gaps]") ?? document.querySelector<HTMLElement>('[data-flag="notCounted"]');
  el?.scrollIntoView?.({ block: "center" });
  el?.focus();
}

/** The selected channel when it has a price, else null. */
export const priced = computed<ChannelOk | null>(() => (hero.value.kind === "price" ? hero.value.sel : null));

/** Remembered open state of a details section (settings.ui.open), with a default for first use. */
export function useOpen(id: string, dflt: () => boolean): WritableComputedRef<boolean> {
  return computed({
    get: () => store.settings.ui.open[id] ?? dflt(),
    set: (v: boolean) => setSectionOpen(id, v),
  });
}

/** Focus an element by selector once the DOM has settled (a collapsed section may need to open first). */
export async function focusSelector(selector: string, openSection?: string): Promise<void> {
  if (openSection) setSectionOpen(openSection, true);
  await nextTick();
  document.querySelector<HTMLElement>(selector)?.focus();
}

export const editChannelFees = (): void => setView("settings");

/**
 * True where the price panel is too narrow for every table column (no container queries: it follows the viewport).
 * Compact everywhere except 600-899, where the narrow layout gives the panel the full width. At 900+ the panel is 340-440 px.
 */
export function useCompact(query = "(max-width: 599px), (min-width: 900px)"): Ref<boolean> {
  const compact = ref(false);
  let mq: MediaQueryList | null = null;
  const sync = (): void => { compact.value = !!mq?.matches; };
  onMounted(() => {
    if (typeof window.matchMedia !== "function") return;
    mq = window.matchMedia(query);
    sync();
    mq.addEventListener("change", sync);
  });
  onBeforeUnmount(() => mq?.removeEventListener("change", sync));
  return compact;
}
