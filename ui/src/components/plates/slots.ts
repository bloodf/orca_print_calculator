// Shared helpers for plate chips, material rows and the spool picker (docs/ux.md §5.3 T4.3).
import { money } from "../../format";
import { t } from "../../i18n";
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
/** "Use automatic match": drops the picked spool and the typed price for this preset. */
export function clearSlot(preset: string): void {
  patchSettings((s) => {
    const { [preset]: _o, ...overrides } = s.slotOverrides;
    const { [preset]: _m, ...manual } = s.manualPrices;
    return { slotOverrides: overrides, manualPrices: manual };
  });
}
export const hasSlotChoice = (preset: string): boolean => preset in store.settings.slotOverrides || preset in store.settings.manualPrices;
