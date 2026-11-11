// Project quote on top of the untouched engine (costs.ts). Integer minor units; the engine's
// "Cents" fields carry minor units of any currency. Pricing per channel lives in quotePricing.ts.
//
// Quantity model: one "run" (a set) prints every included plate × its copies once and yields
// `unitsPerSet` sellable pieces. runs = ceil(quantity / unitsPerSet); pieces printed beyond `quantity`
// are leftovers whose cost the order carries:
//   orderCost          = unitCost × runs × unitsPerSet + orderFixed
//   unitCostAtQuantity = ceil(orderCost / quantity)   (rounded up: pricing at it never loses money)
// orderFixed (setup labor, per-order extras, absorbed shipping) is charged once per order, not per run.
//
// Fees: channel fees apply to the item price only. Customer-paid shipping is passed through with no
// channel fee, outside the margin base (grandTotal = orderTotal + shipping). A minimum order raises the
// per-piece price to ceil(minOrder / quantity) and re-prices it through the channel's fees.
import { computeCost, mulDivRound, type CostBreakdown, type EngineInput } from "./costs";
import { PRETTY_MODES, priceChannel, type ChannelOk, type ChannelQuote, type DiscountTier, type PrettyMode, type QuoteChannel } from "./quotePricing";

export type { ChannelOk, ChannelQuote, DiscountTier, PrettyMode, QuoteChannel } from "./quotePricing";
export type QuoteSlot = { n: number; gramsMg: number; pricePerKgMinor: number; label: string; key: string };
export type QuotePlate = { index: number; name?: string; seconds: number; include: boolean; copies: number; slots: QuoteSlot[] };
export type QuoteExtra = { key: string; label: string; unitMinor: number; qtyE3: number; per: "piece" | "plate" | "order" };
export type QuoteInput = {
  plates: QuotePlate[];
  unitsPerSet?: number; // default 1
  quantity: number;
  // Passed straight through to the engine.
  costs: Pick<EngineInput, "machine" | "kwhE4" | "failure" | "depreciationEnabled" | "maintenancePerHourCents" | "labor" | "fixedCostPerPrintHourCents">;
  setup: { ratePerHourMinor: number; minutes: number };
  extras: QuoteExtra[];
  shipping: { mode: "absorbed" | "customer"; minor: number };
  channels: QuoteChannel[];
  targetMarginBp: number;
  discountTiers: DiscountTier[];
  pretty: PrettyMode;
  minOrderMinor: number;
};
export type ProblemCode =
  | "not_integer" | "negative" | "quantity_min" | "units_per_set_min" | "copies_min" | "no_plates"
  | "discount_range" | "invalid_option" | "material_price_conflict" | "engine_range" | "overflow";
export type Problem = { code: ProblemCode; path: string };
export type QuoteLine = { id: string; perPiece: number; perOrder: number; detail?: { key: string; minor: number }[] };
/** One plate copy, i.e. one set's worth of that plate (not per piece when unitsPerSet > 1). */
export type PlateRow = { index: number; name?: string; include: boolean; copies: number; seconds: number; gramsMg: number; unitMinor: number; totalMinor: number };
export type BatchRow = { quantity: number; unitCostAtQuantity: number; channels: ChannelQuote[] };
export type QuoteOk = {
  ok: true; materials: EngineInput["materials"]; printSeconds: number; runs: number; piecesPrinted: number;
  /** Leftover pieces printed beyond the quantity (runs × unitsPerSet − quantity); their cost is in the order. */
  sparePieces: number;
  project: CostBreakdown; plates: PlateRow[]; lines: QuoteLine[];
  unitCost: number; orderFixed: number; orderCost: number; unitCostAtQuantity: number;
  channels: ChannelQuote[]; comparison: ChannelOk[]; batchTable: BatchRow[];
};
export type QuoteResult = QuoteOk | { ok: false; problems: Problem[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Required objects and arrays exist, so later checks cannot throw a TypeError. */
function shapeProblems(input: unknown): Problem[] {
  const out: Problem[] = [];
  const need = (v: unknown, path: string, list = false) => {
    const good = list ? Array.isArray(v) : isObj(v);
    if (!good) out.push({ code: "invalid_option", path });
    return good;
  };
  const each = (v: unknown, path: string, inner?: (x: Record<string, unknown>, at: string) => void) => {
    if (need(v, path, true)) (v as unknown[]).forEach((x, k) => { if (need(x, `${path}.${k}`) && inner) inner(x as Record<string, unknown>, `${path}.${k}`); });
  };
  if (!need(input, "input")) return out;
  const i = input as Record<string, unknown>;
  if (need(i.costs, "costs")) ["machine", "failure", "labor"].forEach((k) => need((i.costs as Record<string, unknown>)[k], `costs.${k}`));
  need(i.setup, "setup");
  need(i.shipping, "shipping");
  each(i.plates, "plates", (pl, at) => each(pl.slots, `${at}.slots`));
  each(i.extras, "extras");
  each(i.channels, "channels", (c, at) => each(c.tiers, `${at}.tiers`));
  each(i.discountTiers, "discountTiers");
  return out;
}

/** Every number in the input must be a safe, non-negative integer. */
function numberProblems(v: unknown, path: string): Problem[] {
  if (typeof v === "number") return !Number.isSafeInteger(v) ? [{ code: "not_integer", path }] : v < 0 ? [{ code: "negative", path }] : [];
  if (!v || typeof v !== "object") return [];
  return Object.entries(v).flatMap(([k, x]) => numberProblems(x, path ? `${path}.${k}` : k));
}

function ruleProblems(i: QuoteInput): Problem[] {
  const p: Problem[] = [];
  const at = (cond: boolean, code: ProblemCode, path: string) => { if (cond) p.push({ code, path }); };
  at(i.quantity < 1, "quantity_min", "quantity");
  at(i.unitsPerSet !== undefined && i.unitsPerSet < 1, "units_per_set_min", "unitsPerSet");
  at(!i.plates.some((x) => x.include), "no_plates", "plates");
  i.plates.forEach((x, k) => at(x.include && x.copies < 1, "copies_min", `plates.${k}.copies`));
  i.discountTiers.forEach((t, k) => {
    at(t.minQty < 1, "quantity_min", `discountTiers.${k}.minQty`);
    at(t.discountBp >= 10000, "discount_range", `discountTiers.${k}.discountBp`);
  });
  at(!PRETTY_MODES.includes(i.pretty), "invalid_option", "pretty");
  at(i.shipping.mode !== "absorbed" && i.shipping.mode !== "customer", "invalid_option", "shipping.mode");
  i.extras.forEach((e, k) => at(!["piece", "plate", "order"].includes(e.per), "invalid_option", `extras.${k}.per`));
  return p;
}

/** Included plates' slots × copies, merged by key in first-seen order; a key must keep one price. */
function mergeMaterials(plates: QuotePlate[]): { materials: EngineInput["materials"]; problems: Problem[] } {
  const merged = new Map<string, EngineInput["materials"][number]>();
  const problems: Problem[] = [];
  plates.forEach((pl, k) => pl.include && pl.slots.forEach((s, j) => {
    const prev = merged.get(s.key);
    if (prev && prev.pricePerKgCents !== s.pricePerKgMinor) problems.push({ code: "material_price_conflict", path: `plates.${k}.slots.${j}.pricePerKgMinor` });
    const gramsMg = (prev?.gramsMg ?? 0) + s.gramsMg * pl.copies;
    merged.set(s.key, { key: s.key, label: prev?.label ?? s.label, pricePerKgCents: s.pricePerKgMinor, gramsMg });
  }));
  return { materials: [...merged.values()], problems };
}

const engineExtras = (extras: QuoteExtra[], plateCopies: number): EngineInput["extras"] => extras.flatMap<EngineInput["extras"][number]>((e) =>
  e.per === "piece" ? [{ key: e.key, label: e.label, unitCents: e.unitMinor, qtyE3: e.qtyE3, per: "piece" as const }]
    : e.per === "plate" ? [{ key: e.key, label: e.label, unitCents: e.unitMinor, qtyE3: e.qtyE3 * plateCopies, per: "print" as const }]
      : []);

// Per-plate rows: one engine call per plate copy (one set, unitsPerPrint 1), plate-scoped extras only.
// Each row rounds its own lines, so Σ rows × copies may differ from the project total by a few minor
// units; the single project computeCost is authoritative for every price and total.
const plateRow = (i: QuoteInput, pl: QuotePlate): PlateRow => {
  const materials = pl.slots.map((s) => ({ key: s.key, label: s.label, pricePerKgCents: s.pricePerKgMinor, gramsMg: s.gramsMg }));
  const unitMinor = computeCost({ ...i.costs, materials, printSeconds: pl.seconds, unitsPerPrint: 1, extras: engineExtras(i.extras.filter((e) => e.per === "plate"), 1), quantity: 1 }).unitCostCents;
  const gramsMg = pl.slots.reduce((s, x) => s + x.gramsMg, 0);
  return { index: pl.index, ...(pl.name === undefined ? {} : { name: pl.name }), include: pl.include, copies: pl.copies, seconds: pl.seconds, gramsMg, unitMinor, totalMinor: unitMinor * pl.copies };
};

function orderLines(i: QuoteInput): QuoteLine[] {
  const setup = mulDivRound(i.setup.ratePerHourMinor, i.setup.minutes, 60);
  const detail = i.extras.filter((e) => e.per === "order").map((e) => ({ key: e.key, minor: mulDivRound(e.unitMinor, e.qtyE3, 1000) }));
  const lines: Omit<QuoteLine, "perPiece">[] = [{ id: "setup", perOrder: setup }];
  if (detail.length) lines.push({ id: "orderExtras", perOrder: detail.reduce((s, d) => s + d.minor, 0), detail });
  if (i.shipping.mode === "absorbed" && i.shipping.minor > 0) lines.push({ id: "shipping", perOrder: i.shipping.minor });
  return lines.map((l) => ({ ...l, perPiece: mulDivRound(l.perOrder, 1, i.quantity) }));
}

const overflow = new RangeError("quote overflow");
const safe = (n: number) => { if (!Number.isSafeInteger(n)) throw overflow; return n; };

type Project = Omit<QuoteOk, "ok" | "lines" | "orderFixed" | "orderCost" | "unitCostAtQuantity" | "channels" | "comparison" | "batchTable">;

function buildProject(i: QuoteInput, materials: EngineInput["materials"]): Project {
  const included = i.plates.filter((p) => p.include);
  const printSeconds = included.reduce((s, p) => s + p.seconds * p.copies, 0);
  const copies = included.reduce((s, p) => s + p.copies, 0);
  const unitsPerSet = i.unitsPerSet ?? 1;
  const runs = Math.ceil(i.quantity / unitsPerSet);
  // quantity 1 then batchCostCents set here, so a huge quantity is an overflow problem, not an engine error.
  const one = computeCost({ ...i.costs, materials, printSeconds, unitsPerPrint: unitsPerSet, extras: engineExtras(i.extras, copies), quantity: 1 });
  const project = { ...one, batchCostCents: safe(one.unitCostCents * i.quantity) };
  return { materials, printSeconds, runs, piecesPrinted: runs * unitsPerSet, sparePieces: runs * unitsPerSet - i.quantity, project, plates: i.plates.map((p) => plateRow(i, p)), unitCost: project.unitCostCents };
}

/** Cost and every channel's pricing at quantity q (q > 0). */
function atQuantity(i: QuoteInput, p: Project, q: number) {
  const qi = { ...i, quantity: q };
  const runs = Math.ceil(q / (i.unitsPerSet ?? 1)), pieces = runs * (i.unitsPerSet ?? 1);
  const order = orderLines(qi);
  const orderFixed = order.reduce((s, l) => s + l.perOrder, 0);
  const orderCost = safe(safe(p.unitCost * pieces) + orderFixed);
  const unitCostAtQuantity = Number((BigInt(orderCost) + BigInt(q) - 1n) / BigInt(q));
  const ctx = {
    quantity: q, unitCostAtQuantity, orderCost, orderPrintSeconds: p.printSeconds * runs, targetMarginBp: i.targetMarginBp,
    discountTiers: i.discountTiers, pretty: i.pretty, minOrderMinor: i.minOrderMinor,
    customerShippingMinor: i.shipping.mode === "customer" ? i.shipping.minor : 0,
  };
  // Engine lines are rounded per piece, then × pieces: each line's perOrder is within 0.5 × pieces of exact.
  const engineLines: QuoteLine[] = p.project.lines.map((l) => ({
    id: l.id, perPiece: mulDivRound(l.cents, pieces, q), perOrder: safe(l.cents * pieces),
    ...(l.detail ? { detail: l.detail.map((d) => ({ key: d.key, minor: d.cents })) } : {}),
  }));
  return { lines: [...engineLines, ...order], orderFixed, orderCost, unitCostAtQuantity, channels: i.channels.map((c) => priceChannel(c, ctx)) };
}

export function computeQuote(i: QuoteInput): QuoteResult {
  const shapeErrors = shapeProblems(i);
  if (shapeErrors.length) return { ok: false, problems: shapeErrors };
  const shape = [...numberProblems(i, ""), ...ruleProblems(i)];
  const merged = mergeMaterials(i.plates);
  const problems = [...shape, ...merged.problems];
  if (problems.length) return { ok: false, problems };
  try {
    const p = buildProject(i, merged.materials);
    const now = atQuantity(i, p, i.quantity);
    const comparison = now.channels.filter((c): c is ChannelOk => c.ok).sort((a, b) => b.orderProfit - a.orderProfit);
    const qs = [...new Set([...i.discountTiers.map((t) => t.minQty), i.quantity])].sort((a, b) => a - b);
    const batchTable = qs.map((q) => {
      const r = q === i.quantity ? now : atQuantity(i, p, q);
      return { quantity: q, unitCostAtQuantity: r.unitCostAtQuantity, channels: r.channels };
    });
    return { ok: true, ...p, ...now, comparison, batchTable };
  } catch (e) {
    if (e === overflow) return { ok: false, problems: [{ code: "overflow", path: "quantity" }] };
    if (e instanceof RangeError) return { ok: false, problems: [{ code: "engine_range", path: "costs" }] };
    throw e;
  }
}
