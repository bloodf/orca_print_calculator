import { beforeEach, describe, expect, test } from "vitest";
import { computeQuote } from "../src/engine/quote";
import { setLocale } from "../src/i18n";
import { savedQuotes } from "../src/mock/fixtures";
import { CSV_BOM, CSV_HEADER, buildCsv, csvMoney, csvText } from "../src/quoteCsv";
import { buildSheetModel, esc, sheetHtml, splitLargestRemainder, type SheetModel, type SheetSource } from "../src/quoteExport";

beforeEach(() => { setLocale("en"); });

const quote = () => savedQuotes()[1]!;
function source(over: Partial<SheetSource> = {}, itemized = false): SheetSource {
  const q = quote();
  const result = computeQuote(q.input);
  if (!result.ok) throw new Error("fixture does not price");
  const selected = result.channels.find((c) => c.id === q.channelId);
  if (!selected?.ok) throw new Error("fixture channel");
  return {
    no: q.no, dateIso: "2026-11-10T12:00:00Z", title: q.title, customer: q.customer, note: "", currency: q.currency, plates: q.input.plates,
    quantity: q.input.quantity, result, selected, sheet: { shopName: "Studio Layer", footer: "Pay in 7 days", validityDays: 15 }, itemized, ...over,
  };
}

describe("csvText / csvMoney", () => {
  test("RFC 4180 quoting", () => {
    expect(csvText("plain")).toBe("plain");
    expect(csvText('a,b')).toBe('"a,b"');
    expect(csvText('say "hi"')).toBe('"say ""hi"""');
    expect(csvText("two\nlines")).toBe('"two\nlines"');
  });
  test.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"])("neutralizes %j", (v) => {
    expect(csvText(v).replace(/^"/, "")[0]).toBe("'");
  });
  test.each([" =1+1", "  =1", "\u00A0=1", "\u3000=1", "\u2003+1", "\n=1", " @SUM(A1)", " -1"])("neutralizes leading whitespace before a formula char: %j", (v) => {
    expect(csvText(v).replace(/^"/, "")[0]).toBe("'");
  });
  test.each(["plain", " plain", "a=b", "x -1"])("leaves %j alone", (v) => { expect(csvText(v)).toBe(v); });
  test("neutralized text with a comma is still quoted", () => { expect(csvText("=a,b")).toBe(`"'=a,b"`); });
  test("money is exact, dot decimal, no grouping", () => {
    expect(csvMoney(123456, 2)).toBe("1234.56");
    expect(csvMoney(5, 2)).toBe("0.05");
    expect(csvMoney(1234, 0)).toBe("1234");
    expect(csvMoney(1234, 3)).toBe("1.234");
  });
});

describe("buildCsv", () => {
  const csv = (over: Partial<Parameters<typeof buildCsv>[0]> = {}) => {
    const s = source();
    return buildCsv({ no: 42, dateIso: "2026-11-08T12:00:00Z", customer: "Ana Souza", title: "Desk organizer", currency: "BRL", digits: 2, input: quote().input, result: s.result, selected: s.selected, ...over });
  };
  test("BOM, CRLF, header, one kind per row", () => {
    const out = csv();
    expect(out.startsWith(CSV_BOM + CSV_HEADER.join(",") + "\r\n")).toBe(true);
    expect(out.endsWith("\r\n")).toBe(true);
    const lines = out.slice(1).split("\r\n").filter(Boolean);
    const kinds = lines.slice(1).map((l) => l.split(",")[7]);
    expect(kinds).toContain("plate");
    expect(kinds.slice(-7)).toEqual(["fee", "tax", "price", "shipping", "total", "profit", "margin"]);
    expect(lines[1]!.startsWith("0042,2026-11-08T12:00:00Z,Ana Souza,Desk organizer,BRL,")).toBe(true);
  });
  test("amounts use dot decimals and no currency symbol", () => {
    setLocale("pt-BR");
    const out = csv();
    expect(out).not.toMatch(/R\$/);
    const price = out.split("\r\n").find((l) => l.split(",")[7] === "price")!;
    expect(price.split(",")[9]).toMatch(/^\d+\.\d\d$/);
  });
  test("hostile customer and title cannot start a formula", () => {
    const out = csv({ customer: "=HYPERLINK(\"x\")", title: "@cmd" });
    const row = out.split("\r\n")[1]!;
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    expect(row).toContain(",'@cmd,");
  });
  test("draft has an empty number", () => { expect(csv({ no: null }).split("\r\n")[1]!.startsWith(",")).toBe(true); });
});

describe("splitLargestRemainder", () => {
  test("parts sum exactly and follow the weights", () => {
    const parts = splitLargestRemainder(100, [1, 1, 1]);
    expect(parts.reduce((s, x) => s + x, 0)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
    expect(splitLargestRemainder(1000, [3, 1])).toEqual([750, 250]);
  });
  test("zero weights split evenly; huge totals stay exact", () => {
    expect(splitLargestRemainder(10, [0, 0])).toEqual([5, 5]);
    const big = splitLargestRemainder(9_007_199_254_740_991, [1, 2, 4]);
    expect(big.reduce((s, x) => s + x, 0)).toBe(9_007_199_254_740_991);
  });
});

const HOSTILE = [`<script>alert(1)</script>`, `"onload="alert(1)`, `Tom & Jerry`, `<img src=x onerror=alert(1)>`, `'><svg/onload=1>`];

describe("sheet HTML", () => {
  test.each(HOSTILE)("escapes %s in every user-controlled field", (h) => {
    const html = sheetHtml(buildSheetModel(source({
      title: h, customer: h, note: h, sheet: { shopName: h, footer: h, validityDays: 15 },
      plates: quote().input.plates.map((p) => ({ ...p, name: h })),
    }, true)));
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/<img|<svg/);
    expect(html).not.toContain(`"onload=`);
    expect(html).toContain(esc(h));
  });
  test("self-contained: no scripts, no external resources, no links", () => {
    const html = sheetHtml(buildSheetModel(source()));
    expect(html).not.toMatch(/<script|<link|<a\s|<img|<iframe|src=|href=|url\(|@import|http/i);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>");
  });
  test("customer-visible whitelist only, internal numbers never appear", () => {
    const s = source();
    const sel = s.selected;
    const html = sheetHtml(buildSheetModel(s));
    const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "BRL" }).format(n / 100);
    for (const internal of [s.result.unitCost, s.result.orderCost, s.result.unitCostAtQuantity, sel.fees, sel.net, sel.profit, sel.orderProfit, sel.breakEven]) {
      if (internal === sel.price || internal === sel.grandTotal || internal === sel.orderTotal || internal === sel.shippingCharged) continue; // legitimately shown
      expect(html).not.toContain(fmt(internal));
    }
    for (const label of ["Filament", "Energy", "Printer wear", "Maintenance", "Failures", "Labor", "Fixed costs", "Extras", "Setup", "Channel fees", "Tax", "Profit", "Margin", "Cost per piece", "break-even", sel.name, "Snapmaker", " g<"]) {
      expect(html).not.toContain(label);
    }
    expect(html).toContain("Quote #0042");
    expect(html).toContain(fmt(sel.grandTotal));
  });
  test("summary: one line with qty, unit price, amount; itemized: plate lines summing to the subtotal", () => {
    const s = source();
    const sum = buildSheetModel(s);
    expect(sum.rows).toHaveLength(1);
    expect(sum.rows[0]).toMatchObject({ qty: "10" });
    expect(sum.rows[0]!.amount).toBe(sum.subtotal.value);
    const item = buildSheetModel({ ...s, itemized: true });
    expect(item.rows.length).toBe(s.plates.filter((p) => p.include).length);
    expect(item.rows.every((r) => r.qty === "" && r.unit === "")).toBe(true);
    expect(item.quantityLine).toContain("10");
    expect(sheetHtml(item)).not.toContain(sum.head.unit);
    expect(sheetHtml(sum)).toContain(sum.head.unit);
  });
  test("optional parts disappear when empty", () => {
    const m: SheetModel = buildSheetModel(source({ customer: "", note: "", sheet: { shopName: "", footer: "", validityDays: 0 } }));
    expect(m.validValue).toBe("");
    const html = sheetHtml(m);
    expect(html).not.toContain(m.validLabel);
    expect(html).not.toContain(m.forLabel);
    expect(html).not.toContain("Orca Print Calculator</span>");
    expect(html).toContain(m.made);
  });
  test("draft heading, pt-BR labels and lang", () => {
    setLocale("pt-BR");
    const m = buildSheetModel(source({ no: null }));
    expect(m.heading).toBe("Rascunho");
    expect(sheetHtml(m)).toContain('lang="pt-BR"');
    expect(m.total.value).toMatch(/^R\$/);
  });
});
