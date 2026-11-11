// Customer quote sheet (docs/ux.md §9). SheetModel is an explicit whitelist of display strings: nothing from the
// internal breakdown (costs, fees, margin, grams, channel, spools) can reach the sheet because it is never copied in.
// Every field is already formatted text; the Vue sheet and the HTML export both render this same object.
import { count, date, money, percent, quoteNo } from "./format";
import { currentLocale, intlLocale, t } from "./i18n";
import type { ChannelOk, QuoteOk, QuotePlate } from "./engine/quote";
import { DEFAULT_ACCENT, validAccent, validLogo } from "./state/sheet";
import type { SheetBrand } from "./state/types";

export type SheetRow = { label: string; qty: string; unit: string; amount: string };
export type SheetModel = {
  lang: string; shop: string; heading: string; dateLabel: string; dateValue: string; validLabel: string; validValue: string;
  forLabel: string; customer: string; title: string; quantityLine: string; itemized: boolean;
  head: { item: string; qty: string; unit: string; amount: string };
  rows: SheetRow[]; subtotal: { label: string; value: string }; shipping: { label: string; value: string } | null;
  discountNote: string; total: { label: string; value: string }; note: string; footer: string; made: string;
  /** Branding: logo data URI ("" = none), company lines under the shop name, accent color, payment block. */
  logo: string; contact: string[]; accent: string; payment: { label: string; text: string } | null;
};
export type SheetSource = {
  no: number | null; dateIso: string; title: string; customer: string; note: string; currency: string;
  plates: QuotePlate[]; quantity: number; result: QuoteOk; selected: ChannelOk;
  sheet: { shopName: string; footer: string; validityDays: number } & Partial<SheetBrand>; itemized: boolean;
};

/** Split `total` across `weights` so the parts sum exactly to `total` (largest remainder; ties to the earlier index). */
export function splitLargestRemainder(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  const w = sum > 0 ? weights : weights.map(() => 1);
  const den = BigInt(sum > 0 ? sum : w.length);
  const exact = w.map((x) => BigInt(total) * BigInt(x));
  const base = exact.map((e) => Number(e / den));
  const order = exact.map((e, i) => ({ i, r: e % den })).sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  let left = total - base.reduce((s, x) => s + x, 0);
  const out = [...base];
  for (const { i } of order) { if (left <= 0) break; out[i] = (out[i] ?? 0) + 1; left--; }
  return out;
}

const plateLabel = (p: QuotePlate): string => {
  const base = p.name ? t("plate.titleNamed", { n: p.index + 1, name: p.name }) : t("plate.title", { n: p.index + 1 });
  return p.copies > 1 ? `${base} × ${p.copies}` : base;
};

/** A hand-edited quotes.json can hold any JSON type: every text field goes through this before use. */
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const days = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? n : 0);

/** Logo, company lines, accent and payment block. Validated here: the last stop before markup and style. */
export function brandOf(b: Partial<SheetBrand>): Pick<SheetModel, "logo" | "contact" | "accent" | "payment"> {
  const lines = (v: unknown): string[] => str(v).split("\n").map((x) => x.trim()).filter(Boolean);
  const reach = [b.phone, b.email, b.website].map((x) => str(x).trim()).filter(Boolean).join(" · ");
  const payment = str(b.payment).trim();
  return {
    logo: validLogo(b.logo) ? b.logo : "", contact: [...lines(b.taxId), ...lines(b.address), ...(reach ? [reach] : [])],
    accent: validAccent(b.accent) ? b.accent : DEFAULT_ACCENT, payment: payment ? { label: t("sheet.payment"), text: payment } : null,
  };
}

/** A made-up one-line quote that shows the shop's own details: the live preview in Settings. */
export function sampleSheetModel(sheet: SheetSource["sheet"], currency: string): SheetModel {
  const loc = intlLocale();
  const now = new Date();
  const end = new Date(now.getTime() + days(sheet.validityDays) * 86_400_000).toISOString();
  const unit = 4500, qty = 2;
  return {
    lang: currentLocale(), shop: str(sheet.shopName), heading: t("sheet.quote", { no: quoteNo(1, loc) }),
    dateLabel: t("sheet.date"), dateValue: date(now.toISOString(), loc), validLabel: t("sheet.validUntil"), validValue: days(sheet.validityDays) > 0 ? date(end, loc) : "",
    forLabel: t("sheet.for"), customer: t("sheet.sampleCustomer"), title: t("sheet.sampleTitle"), quantityLine: "", itemized: false,
    head: { item: t("sheet.item"), qty: t("sheet.qty"), unit: t("sheet.unitPrice"), amount: t("sheet.amount") },
    rows: [{ label: t("sheet.sampleTitle"), qty: count(qty, loc), unit: money(unit, currency, loc), amount: money(unit * qty, currency, loc) }],
    subtotal: { label: t("sheet.subtotal"), value: money(unit * qty, currency, loc) }, shipping: null, discountNote: "",
    total: { label: t("sheet.total"), value: money(unit * qty, currency, loc) }, note: "", footer: str(sheet.footer), made: t("sheet.made"),
    ...brandOf(sheet),
  };
}

export function buildSheetModel(s: SheetSource): SheetModel {
  const loc = intlLocale();
  const m = (minor: number) => money(minor, s.currency, loc);
  const sel = s.selected;
  const quantity = s.quantity;
  const included = s.plates.filter((p) => p.include);
  const rows: SheetRow[] = s.itemized
    ? splitLargestRemainder(sel.orderTotal, included.map((p) => s.result.plates.find((r) => r.index === p.index)?.totalMinor ?? 0))
      .map((amount, i) => ({ label: plateLabel(included[i]!), qty: "", unit: "", amount: m(amount) }))
    : [{ label: s.title, qty: count(quantity, loc), unit: m(sel.price), amount: m(sel.orderTotal) }];
  const end = new Date(new Date(s.dateIso).getTime() + days(s.sheet.validityDays) * 86_400_000).toISOString();
  return {
    lang: currentLocale(), shop: str(s.sheet.shopName),
    heading: s.no === null ? t("sheet.draft") : t("sheet.quote", { no: quoteNo(s.no, loc) }),
    dateLabel: t("sheet.date"), dateValue: date(s.dateIso, loc),
    validLabel: t("sheet.validUntil"), validValue: days(s.sheet.validityDays) > 0 ? date(end, loc) : "",
    forLabel: t("sheet.for"), customer: s.customer, title: s.title,
    quantityLine: s.itemized ? `${t("sheet.qty")} ${count(quantity, loc)}` : "", itemized: s.itemized,
    head: { item: t("sheet.item"), qty: t("sheet.qty"), unit: t("sheet.unitPrice"), amount: t("sheet.amount") },
    rows, subtotal: { label: t("sheet.subtotal"), value: m(sel.orderTotal) },
    shipping: sel.shippingCharged > 0 ? { label: t("sheet.shipping"), value: m(sel.shippingCharged) } : null,
    discountNote: sel.flags.discounted ? t("sheet.discountNote", { pct: percent(sel.effectiveDiscountBp, loc) }) : "",
    total: { label: t("sheet.total"), value: m(sel.grandTotal) }, note: s.note, footer: str(s.sheet.footer), made: t("sheet.made"),
    ...brandOf(s.sheet),
  };
}

/** Paper palette: the sheet is always light (docs/ux.md §5.3 QuotePreview). */
export const PAPER = { bg: "#FFFFFF", fg: "#2B2B2B", muted: "#5C6664", rule: "#00675B", total: "#8A5800" } as const;

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const CSS = `
*{box-sizing:border-box}body{margin:0;background:${PAPER.bg};color:${PAPER.fg};font:11pt/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:720px;margin:0 auto;padding:32px}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.logo{display:block;max-height:64px;max-width:240px;margin-bottom:8px}.co{font-size:12px;color:${PAPER.muted};margin:2px 0 0}
.shop{font-size:18px;font-weight:600}.muted{color:${PAPER.muted}}.small{font-size:12px;color:${PAPER.muted}}
.meta{display:flex;justify-content:space-between;margin-top:6px;gap:16px}
hr.rule{border:0;border-top:2px solid var(--accent,${PAPER.rule});margin:12px 0}
h1{font-size:18px;font-weight:500;margin:0 0 8px}
table{width:100%;border-collapse:collapse}th{text-align:left;font-weight:500;color:${PAPER.muted};font-size:12px;padding:4px 0;border-bottom:1px solid ${PAPER.muted}}
td{padding:6px 0;border-bottom:1px solid #D9D9D9}.r{text-align:right;white-space:nowrap}
.sum{display:flex;justify-content:space-between;margin-top:6px}
.total{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:8px 12px;border:1px solid ${PAPER.fg}}
.total strong{font-size:20px;font-weight:600;color:${PAPER.total}}
p.n{margin:12px 0 0;white-space:pre-wrap}
@page{margin:16mm}@media print{body{color:#000;background:none}.muted,.small,th{color:#000}main{padding:0}}
`;

const dl = (a: string, b: string) => (b ? `<span><span class="muted">${esc(a)}</span> ${esc(b)}</span>` : "<span></span>");

/** Standalone HTML: inline style, no scripts, no external resources, every string escaped. */
export function sheetHtml(m: SheetModel): string {
  const head = m.itemized
    ? `<tr><th>${esc(m.head.item)}</th><th class="r">${esc(m.head.amount)}</th></tr>`
    : `<tr><th>${esc(m.head.item)}</th><th class="r">${esc(m.head.qty)}</th><th class="r">${esc(m.head.unit)}</th><th class="r">${esc(m.head.amount)}</th></tr>`;
  const rows = m.rows.map((r) => (m.itemized
    ? `<tr><td>${esc(r.label)}</td><td class="r">${esc(r.amount)}</td></tr>`
    : `<tr><td>${esc(r.label)}</td><td class="r">${esc(r.qty)}</td><td class="r">${esc(r.unit)}</td><td class="r">${esc(r.amount)}</td></tr>`)).join("");
  const body = [
    `<div class="top"><div>${m.logo ? `<img class="logo" alt="" src="${esc(m.logo)}">` : ""}<span class="shop">${esc(m.shop)}</span>${m.contact.map((c) => `<p class="co">${esc(c)}</p>`).join("")}</div><span class="muted">${esc(m.heading)}</span></div>`,
    `<div class="meta">${dl(m.forLabel, m.customer)}${dl(m.dateLabel, m.dateValue)}</div>`,
    m.validValue ? `<div class="meta"><span></span>${dl(m.validLabel, m.validValue)}</div>` : "",
    `<hr class="rule">`,
    `<h1>${esc(m.title)}</h1>`,
    m.quantityLine ? `<p class="small">${esc(m.quantityLine)}</p>` : "",
    `<table>${head}${rows}</table>`,
    `<div class="sum"><span>${esc(m.subtotal.label)}</span><span>${esc(m.subtotal.value)}</span></div>`,
    m.shipping ? `<div class="sum"><span>${esc(m.shipping.label)}</span><span>${esc(m.shipping.value)}</span></div>` : "",
    m.discountNote ? `<p class="small">${esc(m.discountNote)}</p>` : "",
    `<div class="total"><span>${esc(m.total.label)}</span><strong>${esc(m.total.value)}</strong></div>`,
    m.note ? `<p class="n">${esc(m.note)}</p>` : "",
    m.payment ? `<p class="n"><strong>${esc(m.payment.label)}</strong><br>${esc(m.payment.text)}</p>` : "",
    m.footer ? `<p class="n muted">${esc(m.footer)}</p>` : "",
    `<p class="small">${esc(m.made)}</p>`,
  ].join("");
  return `<!doctype html><html lang="${esc(m.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(`${m.shop} ${m.heading}`.trim())}</title><style>${CSS}</style></head><body><main style="--accent:${esc(m.accent)}">${body}</main></body></html>`;
}
