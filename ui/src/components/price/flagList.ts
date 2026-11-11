// The flags under the hero price, as plain data in the spec's order (docs/ux.md §6.12): bad first, then info.
import { t } from "../../i18n";
import type { Derived } from "../../state/derive";

export type FlagTone = "bad" | "info";
export type FlagAction = { label: string; kind: "spool" | "set" | "fees"; plate?: number; slot?: number; item?: "energy" | "labor" | "wear" };
export type Flag = { id: string; tone: FlagTone; text: string; action?: FlagAction };
export type FlagFmt = { m: (minor: number) => string; pct: (bp: number) => string };

/** Included slots with no price per kg (they count as 0). */
export function slotsWithoutPrice(d: Derived): { plate: number; n: number; preset: string }[] {
  const out: { plate: number; n: number; preset: string }[] = [];
  for (const p of d.quoteInput.plates) {
    if (!p.include) continue;
    for (const v of d.slotMatches[p.index] ?? []) if (v.pricePerKg === null) out.push({ plate: p.index, n: v.slot.n, preset: v.slot.preset });
  }
  return out;
}

const itemText = (c: Derived["notCounted"][number]): string =>
  c.kind === "time" ? t("notCounted.time", { n: c.plate })
    : c.kind === "grams" ? t("notCounted.grams", { slot: c.slot, n: c.plate })
      : t(`notCounted.${c.kind}`);

export function buildFlags(d: Derived, f: FlagFmt, opts: { stale: boolean; invalid?: boolean; currencyFrom?: string | null }): Flag[] {
  const bad: Flag[] = [];
  const info: Flag[] = [];
  const sel = d.selected && d.selected.ok ? d.selected : null;
  const includedIdx = new Set(d.quoteInput.plates.filter((p) => p.include).map((p) => p.index));

  for (const s of slotsWithoutPrice(d)) {
    bad.push({ id: `slotNoPrice-${s.plate}-${s.n}`, tone: "bad", text: t("flag.slotNoPrice", { n: s.n, preset: s.preset }), action: { label: t("flag.pickSpool"), kind: "spool", plate: s.plate, slot: s.n } });
  }
  if (sel?.flags.belowBreakEven) bad.push({ id: "belowBreakEven", tone: "bad", text: t("flag.belowBreakEven", { channel: sel.name, amount: f.m(-sel.profit) }) });
  else if (sel?.flags.orderBelowBreakEven) bad.push({ id: "orderBelowBreakEven", tone: "bad", text: t("flag.orderBelowBreakEven", { amount: f.m(-sel.orderProfit) }) });

  if (d.notCounted.length) {
    // Printer wear is set per printer model; with no model reported there is no field to go to, so no shortcut.
    const settable = d.notCounted.find((c) => c.kind === "energy" || c.kind === "labor" || (c.kind === "wear" && !!d.printer.model));
    info.push({
      id: "notCounted", tone: "info", text: t("flag.notCounted", { items: d.notCounted.map(itemText).join(", ") }),
      ...(settable && (settable.kind === "energy" || settable.kind === "labor" || settable.kind === "wear") ? { action: { label: t("flag.set"), kind: "set" as const, item: settable.kind } } : {}),
    });
  }
  for (const c of d.skippedChannels) info.push({ id: `channelSkipped-${c.id}`, tone: "info", text: t("flag.channelSkipped", { channel: c.name }), action: { label: t("field.editChannelFees"), kind: "fees" } });

  if (opts.invalid || Object.values(d.fieldErrors).some((code) => code !== "no_plates")) // no plates is its own hero sentence, not a field error
    info.push({ id: "fieldInvalid", tone: "info", text: t("flag.fieldInvalid") });

  if (sel) {
    const fl = sel.flags;
    if (fl.belowTarget && !fl.belowBreakEven && !fl.orderBelowBreakEven) info.push({ id: "belowTarget", tone: "info", text: t("flag.belowTarget", { margin: f.pct(sel.marginBp), target: f.pct(d.quoteInput.targetMarginBp) }) });
    if (fl.minimumApplied) info.push({ id: "minimum", tone: "info", text: t("flag.minimum", { amount: f.m(d.quoteInput.minOrderMinor) }) });
    if (fl.deadZoneJumped) {
      const zone = sel.deadZones.find((z) => z.untilCents < sel.price) ?? sel.deadZones[sel.deadZones.length - 1];
      if (zone) info.push({ id: "deadZone", tone: "info", text: t("flag.deadZone", { price: f.m(sel.price), from: f.m(zone.fromCents), until: f.m(zone.untilCents), channel: sel.name }) });
    }
    if (fl.discounted) {
      const tier = d.quoteInput.discountTiers.filter((x) => x.minQty <= d.quoteInput.quantity).reduce((best, x) => (x.minQty > best ? x.minQty : best), 0);
      info.push({ id: "discount", tone: "info", text: t("flag.discount", { pct: f.pct(sel.effectiveDiscountBp), q: tier }) });
    }
  }
  if (opts.currencyFrom) info.push({ id: "currencyMismatch", tone: "info", text: t("currency.mismatch", { old: opts.currencyFrom }), action: { label: t("nav.settings"), kind: "fees" } });
  if (opts.stale) info.push({ id: "stale", tone: "info", text: t("flag.stale") });
  const preset = [...includedIdx].some((i) => (d.slotMatches[i] ?? []).some((v) => v.priceSource === "preset"));
  if (preset) info.push({ id: "presetPrices", tone: "info", text: t("flag.presetPrices") });
  return [...bad, ...info];
}
