// Internal CSV (docs/ux.md §9.3): UTF-8 BOM, CRLF, RFC 4180 quoting, "." decimals, major units, no symbols.
// This is the owner's breakdown, never the customer sheet.
import { mulDivRound } from "./engine/costs";
import type { ChannelOk, QuoteOk, QuoteInput } from "./engine/quote";
import { decimalString } from "./format";
import { t } from "./i18n";

export const CSV_BOM = "﻿";
export const CSV_HEADER = ["quote_no", "date", "customer", "title", "currency", "channel", "quantity", "kind", "item", "per_piece", "per_order"] as const;

/** Text cell: formula-injection guard (= + - @ after any leading whitespace, and tab / CR, get a leading '), then RFC 4180 quoting. */
export function csvText(v: string): string {
  const s = /^[\s\u00A0\u3000]*[=+\-@]|^[\t\r]/u.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Exact integer minor units -> "12.50" at `digits` decimals (no float, no grouping). */
export const csvMoney = decimalString;

export type CsvSource = {
  no: number | null; dateIso: string; customer: string; title: string; currency: string; digits: number;
  input: QuoteInput; result: QuoteOk; selected: ChannelOk;
};

export function buildCsv(s: CsvSource): string {
  const { result: r, selected: sel, digits: dg } = s;
  const q = s.input.quantity;
  const m = (n: number) => csvMoney(n, dg);
  const head = [s.no === null ? "" : String(s.no).padStart(4, "0"), csvText(s.dateIso), csvText(s.customer), csvText(s.title), csvText(s.currency), csvText(sel.name), String(q)];
  const row = (kind: string, item: string, piece = "", order = "") => [...head, kind, csvText(item), piece, order].join(",");
  const taxBp = s.input.channels.find((c) => c.id === sel.id)?.taxBp ?? 0;
  const tax = mulDivRound(sel.price, taxBp, 10000);
  const plateLabel = (p: QuoteOk["plates"][number]) => (p.name ? t("plate.titleNamed", { n: p.index + 1, name: p.name }) : t("plate.title", { n: p.index + 1 }));
  const rows = [
    ...r.plates.filter((p) => p.include).map((p) => row("plate", plateLabel(p), m(p.unitMinor), m(p.totalMinor * r.runs))),
    ...r.lines.map((l) => row("cost", t(`line.${l.id}`), m(l.perPiece), m(l.perOrder))),
    row("cost_total", t("line.costTotal"), m(r.unitCostAtQuantity), m(r.orderCost)),
    row("fee", t("line.fees"), m(sel.fees - tax), m((sel.fees - tax) * q)),
    row("tax", t("line.tax"), m(tax), m(tax * q)),
    row("price", t("sheet.unitPrice"), m(sel.price), m(sel.orderTotal)),
    row("shipping", t("line.shipping"), "", m(sel.shippingCharged)),
    row("total", t("sheet.total"), "", m(sel.grandTotal)),
    row("profit", t("line.profit"), m(sel.profit), m(sel.orderProfit)),
    row("margin", t("quotes.col.margin"), (sel.marginBp / 100).toFixed(1), ""),
  ];
  return CSV_BOM + [CSV_HEADER.join(","), ...rows].join("\r\n") + "\r\n";
}
