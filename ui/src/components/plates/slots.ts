// Shared helpers for plate chips, material rows and the spool picker (docs/ux.md §5.3 T4.3).
import { money } from "../../format";
import { t } from "../../i18n";
import { slotSpoolKey } from "../../state/derive";
import { digits, currency, locale, patchSettings, store } from "../../state/store";
import type { SlotMatchView } from "../../state/types";

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
  if (m.priceSource === "spool" || (m.priceSource === "filament" && m.spoolPinned && m.spoolId !== null)) return t("match.pricedBy.spool", { id: m.spoolId ?? "" });
  if (m.priceSource === "filament") return `${t("match.price.filament")} #${m.filamentId ?? ""}`;
  return priceSourceText(m);
}
/** How the Spoolman row was found ("Spooler link", "Picked spool"), when Spoolman priced the slot. */
export const viaText = (m: SlotMatchView): string => (m.priceSource === "spool" || m.priceSource === "filament" ? sourceText(m) : "");
/** The slot runs on the Orca preset price because no Spoolman spool was found for it. */
export const onFallback = (m: SlotMatchView): boolean => m.priceSource === "preset";

const slotKeyOf = (m: SlotMatchView): string => slotSpoolKey(store.host.printerPreset, m.slot.n);
/** The spool picked for this slot on the current printer preset, if any. */
export const slotSpoolOf = (m: SlotMatchView): number | null => {
  const k = slotKeyOf(m);
  return Object.prototype.hasOwnProperty.call(store.settings.slotSpools, k) ? store.settings.slotSpools[k]!.spoolId : null;
};
/** Pick a spool for this slot on this printer preset; null goes back to Auto. */
export function setSlotSpool(m: SlotMatchView, spool: { filamentId: number; spoolId: number } | null): void {
  const k = slotKeyOf(m);
  patchSettings((s) => {
    const { [k]: _drop, ...rest } = s.slotSpools;
    return { slotSpools: spool ? { ...rest, [k]: { filamentId: spool.filamentId, spoolId: spool.spoolId } } : rest };
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
    const { [k]: _s, ...spools } = s.slotSpools;
    return { slotOverrides: overrides, manualPrices: manual, slotSpools: spools };
  });
}
export const hasSlotChoice = (m: SlotMatchView): boolean =>
  m.slot.preset in store.settings.slotOverrides || m.slot.preset in store.settings.manualPrices || slotSpoolOf(m) !== null;
