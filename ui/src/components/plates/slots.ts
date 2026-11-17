// Shared helpers for plate chips, material rows and the spool picker (docs/ux.md §5.3 T4.3).
import { money } from "../../format";
import { t } from "../../i18n";
import { isFallback, slotSpoolFor, slotSpoolKey } from "../../state/derive";
import { digits, currency, locale, patchSettings, store } from "../../state/store";
import type { SlotMatchView, SlotSpool } from "../../state/types";

export const UNKNOWN = "—";

/** A preset as people read it: the last path segment (`_local/spooler/3D Procer PLA @Snapmaker U1` -> `3D Procer PLA`), without `@printer` or `(#id)`. */
export const presetName = (preset: string): string => preset.split("/").pop()!.replace(/\s*@.*$/, "").replace(/\s*\(#\d+\)$/, "").trim() || preset;

/** Chip text: the material type when the host knows it ("PLA"), else the readable preset name without "Generic" or the matched vendor. */
export function chipLabel(m: SlotMatchView): string {
  const material = m.slot.material?.trim();
  if (material) return material;
  let s = presetName(m.slot.preset).replace(/^Generic\s+/i, "");
  const vendor = store.spoolman.data.filaments.find((f) => f.id === m.filamentId)?.vendor;
  if (vendor && s.toLowerCase().startsWith(`${vendor.toLowerCase()} `)) s = s.slice(vendor.length).trim();
  return s || m.slot.preset;
}

export const sourceText = (m: SlotMatchView): string =>
  m.source === "name" ? (m.filamentId === null ? t("match.source.nameBare") : t("match.source.name", { id: m.filamentId })) : t(`match.source.${m.source}`);
export const sourceTone = (m: SlotMatchView): "neutral" | "warn" | "bad" => (m.source === "preset" ? "warn" : m.source === "none" ? "bad" : "neutral");

export const priceSourceText = (m: SlotMatchView): string =>
  m.priceSource ? t(`match.price.${m.priceSource}`, { id: m.spoolId ?? "" }) : "";

/** What priced the slot, said plainly: "Spoolman spool #14", "Spoolman filament #3", "Orca preset", "typed". */
export function pricedByText(m: SlotMatchView): string {
  if (m.priceSource === "spool") return t("match.pricedBy.spool", { id: m.spoolId ?? "" });
  const fil = t("match.pricedBy.filament", { id: m.filamentId ?? "" });
  if (m.priceSource === "filament") return m.spoolPinned && m.spoolId !== null ? `${fil} (${t("match.price.spool", { id: m.spoolId })})` : fil;
  return priceSourceText(m);
}
/** How the Spoolman row was found ("Spooler link", "Picked spool"), when Spoolman priced the slot. */
export const viaText = (m: SlotMatchView): string => (m.priceSource === "spool" || m.priceSource === "filament" ? sourceText(m) : "");
/** The slot runs on the Orca preset price because no Spoolman spool was found for it (not because a picked one has no price). */
export const onFallback = (m: SlotMatchView): boolean => isFallback(m) && store.spoolman.state === "ok" && canPickSpool();

const slotKeyOf = (m: SlotMatchView): string | null => slotSpoolKey(store.host.printerPreset, m.slot.n);
const withoutKey = <T>(rec: Record<string, T>, k: string | null): Record<string, T> => Object.fromEntries(Object.entries(rec).filter(([key]) => key !== k));
/** Picking a spool per slot needs the printer preset's name (an older host or an unreadable preset has none). */
export const canPickSpool = (): boolean => !!store.host.printerPreset;
/** The spool picked for this slot on the current printer preset, if any. */
export const slotSpoolOf = (m: SlotMatchView): SlotSpool | undefined => slotSpoolFor(store.settings.slotSpools, slotKeyOf(m), m.slot.preset);
/** Pick a spool (or a filament with no spool) for this slot on this printer preset; null is Auto, which also drops an older pick for the preset. */
export function setSlotSpool(m: SlotMatchView, pick: { filamentId: number; spoolId?: number } | null): void {
  const k = slotKeyOf(m);
  const preset = m.slot.preset;
  if (pick && k === null) return; // no printer preset: nowhere to keep a pick (the picker does not offer one)
  patchSettings((s) => {
    const rest = withoutKey(s.slotSpools, k);
    if (pick && k !== null) return { slotSpools: { ...rest, [k]: { filamentId: pick.filamentId, ...(pick.spoolId === undefined ? {} : { spoolId: pick.spoolId }), preset } } };
    const { [preset]: _o, ...overrides } = s.slotOverrides;
    return { slotSpools: rest, slotOverrides: overrides };
  });
}

export const kgMoney = (price: number): string => money(Math.round(price * 10 ** digits.value), currency.value, locale.value);
export const perKg = (price: number): string => `${kgMoney(price)}/kg`;

export function setSlotOverride(preset: string, value: { filamentId: number; spoolId?: number }): void {
  patchSettings((s) => ({ slotOverrides: { ...s.slotOverrides, [preset]: value } }));
}
export function setManualPrice(preset: string, minor: number | null): void {
  patchSettings((s) => {
    const { [preset]: _drop, ...rest } = s.manualPrices;
    return { manualPrices: minor === null || minor <= 0 ? rest : { ...rest, [preset]: minor } };
  });
}
/** "Use automatic match": drops this slot's picked spool, and the pick and typed price for its preset. */
export function clearSlot(m: SlotMatchView): void {
  const preset = m.slot.preset;
  const k = slotKeyOf(m);
  patchSettings((s) => {
    const { [preset]: _o, ...overrides } = s.slotOverrides;
    const { [preset]: _m, ...manual } = s.manualPrices;
    return { slotOverrides: overrides, manualPrices: manual, slotSpools: withoutKey(s.slotSpools, k) };
  });
}
export const hasSlotChoice = (m: SlotMatchView): boolean =>
  m.slot.preset in store.settings.slotOverrides || m.slot.preset in store.settings.manualPrices || slotSpoolOf(m) !== undefined;
