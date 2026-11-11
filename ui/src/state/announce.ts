// Text for the polite live region (docs/ux.md §7.8): price + margin when there is one, else the reason there is none.
import { money, percent } from "../format";
import { t } from "../i18n";
import type { Derived } from "./derive";

export function priceAnnouncement(d: Derived, o: { currency: string; locale: string; hasPlates: boolean }): string {
  if (!o.hasPlates) return t("price.noPlates");
  if (!d.result.ok) return d.result.problems.some((p) => p.code === "no_plates") ? t("price.includeOne") : t("price.fixField");
  const sel = d.selected;
  if (!sel) return "";
  if (!sel.ok) return t("price.impossibleTitle", { channel: sel.name });
  return t("a11y.priceAnnounce", { price: money(sel.price, o.currency, o.locale), margin: percent(sel.marginBp, o.locale), channel: sel.name });
}
