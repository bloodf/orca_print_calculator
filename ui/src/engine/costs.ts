// Shop print cost + suggested price. Pure, integer money. Spec: docs/shop/05-cost-engine.md.
// Units: money = centavos; price/kg = centavos; kwhE4 = R$/kWh x 1e4; mass = mg; time = s;
// power = W x 10; percentages = basis points (bp). Rounding: half-up via BigInt.
export const ENGINE_VERSION = 1;

export type EngineInput = {
  materials: { key: string; label: string; pricePerKgCents: number; gramsMg: number }[];
  printSeconds: number;
  unitsPerPrint: number; // >= 1
  machine: { wattsW10: number; acquisitionCents: number; lifetimeHours: number };
  kwhE4: number;
  failure: { bp: number; mode: "markup" | "expected_waste"; includesMachine: boolean };
  depreciationEnabled: boolean;
  maintenancePerHourCents: number;
  labor: { perHourCents: number; minutes: number };
  fixedCostPerPrintHourCents: number;
  // Per finished unit; per: "print" splits the cost across unitsPerPrint. Omitted per = "piece".
  extras: { key: string; label: string; unitCents: number; qtyE3: number; per?: "piece" | "print" }[];
  quantity: number; // batch size
};
export type LineId = "filament" | "energy" | "depreciation" | "maintenance" | "failure" | "labor" | "fixed" | "extras";
export type CostBreakdown = {
  lines: { id: LineId; cents: number; detail?: { key: string; cents: number }[] }[];
  unitCostCents: number;
  batchCostCents: number;
  version: number;
};
export type Tier = { minPriceCents: number; pctBp: number; fixedCents: number; shippingCents: number };
export type ChannelInput = { tiers: Tier[]; taxBp: number; surchargeCents: number };

const big = BigInt;
const bad = (m: string): never => { throw new RangeError(`shop costs: ${m}`); };
const nat = (v: number, name: string, min = 0) => {
  if (!Number.isSafeInteger(v) || v < min) bad(`${name} must be an integer >= ${min}, got ${v}`);
  return v;
};
const floorDiv = (a: bigint, b: bigint) => { const q = a / b; return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q; };
const roundDiv = (n: bigint, d: bigint) => floorDiv(2n * n + d, 2n * d); // half-up, d > 0
const out = (v: bigint) => { const x = Number(v); return Number.isSafeInteger(x) ? x : bad("result exceeds safe integer"); };

/** round(a * b / c), half-up, BigInt. */
export function mulDivRound(a: number, b: number, c: number): number {
  nat(c, "divisor", 1); nat(a, "a"); nat(b, "b");
  return out(roundDiv(big(a) * big(b), big(c)));
}

// Exact fractions [numerator, denominator] so each line rounds once.
type Q = [bigint, bigint];
const q = (a: number, b: number, c = 1): Q => [big(a) * big(b), big(c)];
const add = (x: Q, y: Q): Q => [x[0] * y[1] + y[0] * x[1], x[1] * y[1]];
const perUnit = (x: Q, u: number) => out(roundDiv(x[0], x[1] * big(u)));

/** Validated engine inputs as exact fractions: the cost of ONE print run per line, nothing rounded yet. */
function runFractions(i: EngineInput) {
  const u = nat(i.unitsPerPrint, "unitsPerPrint", 1);
  const sec = nat(i.printSeconds, "printSeconds");
  nat(i.quantity, "quantity", 1);
  const { wattsW10, acquisitionCents, lifetimeHours } = i.machine;
  [wattsW10, acquisitionCents, lifetimeHours, i.kwhE4, i.maintenancePerHourCents, i.labor.perHourCents, i.labor.minutes, i.fixedCostPerPrintHourCents]
    .forEach((v) => nat(v, "cost input"));
  if (i.failure.mode !== "markup" && i.failure.mode !== "expected_waste") bad(`unknown failure.mode ${String(i.failure.mode)}`);
  nat(i.failure.bp, "failure.bp"); if (i.failure.bp > 10000) bad("failure.bp must be <= 10000");
  i.extras.forEach((e) => {
    nat(e.unitCents, `extra ${e.key} unitCents`); nat(e.qtyE3, `extra ${e.key} qtyE3`);
    if (e.per !== undefined && e.per !== "piece" && e.per !== "print") bad(`unknown extra ${e.key} per ${String(e.per)}`);
  });
  i.materials.forEach((m) => { nat(m.pricePerKgCents, `${m.key} pricePerKgCents`); nat(m.gramsMg, `${m.key} gramsMg`); });

  const materialQ = i.materials.map((m) => ({ key: m.key, q: q(m.pricePerKgCents, m.gramsMg, 1_000_000) }));
  const filament = materialQ.reduce<Q>((s, m) => add(s, m.q), [0n, 1n]);
  const energy: Q = [big(wattsW10) * big(sec) * big(i.kwhE4), 3_600_000_000n];
  // ponytail: lifetimeHours = 0 means no depreciation (same as shared/cost.ts)
  const depreciation: Q = i.depreciationEnabled && lifetimeHours > 0 ? q(acquisitionCents, sec, 3600 * lifetimeHours) : [0n, 1n];
  const maintenance = q(i.maintenancePerHourCents, sec, 3600);
  let base = add(filament, energy);
  if (i.failure.includesMachine) base = add(add(base, depreciation), maintenance);
  // expected_waste caps p at 95%
  const bp = i.failure.mode === "expected_waste" ? Math.min(i.failure.bp, 9500) : i.failure.bp;
  const failure: Q = i.failure.mode === "markup" ? [base[0] * big(bp), base[1] * 10000n] : [base[0] * big(bp), base[1] * big(10000 - bp)];
  const labor = q(i.labor.perHourCents, i.labor.minutes, 60);
  const fixed = q(i.fixedCostPerPrintHourCents, sec, 3600);
  return { u, materialQ, qs: { filament, energy, depreciation, maintenance, failure, labor, fixed } as Record<Exclude<LineId, "extras">, Q> };
}
const LINE_IDS = ["filament", "energy", "depreciation", "maintenance", "failure", "labor", "fixed"] as const;

export function computeCost(i: EngineInput): CostBreakdown {
  const { u, materialQ, qs } = runFractions(i);
  const detail = materialQ.map((m) => ({ key: m.key, cents: perUnit(m.q, u) }));
  const extraDetail = i.extras.map((e) => ({ key: e.key, cents: mulDivRound(e.unitCents, e.qtyE3, e.per === "print" ? 1000 * u : 1000) }));
  const extras = extraDetail.reduce((s, e) => s + e.cents, 0);
  // Detail only when a caller opts into `per`, so outputs for older inputs stay byte-identical.
  const extrasDetail = i.extras.some((e) => e.per !== undefined) ? { detail: extraDetail } : {};

  const lines: CostBreakdown["lines"] = [
    { id: "filament", cents: perUnit(qs.filament, u), detail },
    ...LINE_IDS.slice(1).map((id) => ({ id, cents: perUnit(qs[id], u) })),
    { id: "extras", cents: extras, ...extrasDetail },
  ];
  const unitCostCents = lines.reduce((s, l) => s + l.cents, 0);
  return { lines, unitCostCents, batchCostCents: nat(unitCostCents * i.quantity, "batchCost"), version: ENGINE_VERSION };
}

/**
 * Exact production cost of `runs` print runs (calc version 2). Each line is rounded once, at order level: the
 * fraction for one run is multiplied by `runs` before rounding, so no per-piece rounding is multiplied back up.
 * `per: "piece"` extras are charged for every piece printed (spares included), `per: "print"` extras once per run.
 */
export function computeRunsCost(i: EngineInput, runs: number): { lines: { id: LineId; cents: number; detail?: { key: string; cents: number }[] }[]; totalCents: number } {
  nat(runs, "runs", 1);
  const { u, materialQ, qs } = runFractions(i);
  const r = big(runs);
  const total = (x: Q) => out(roundDiv(x[0] * r, x[1]));
  const detail = materialQ.map((m) => ({ key: m.key, cents: total(m.q) }));
  const extraDetail = i.extras.map((e) => ({ key: e.key, cents: mulDivRound(e.unitCents, e.qtyE3 * (e.per === "print" ? runs : runs * u), 1000) }));
  const lines: { id: LineId; cents: number; detail?: { key: string; cents: number }[] }[] = [
    { id: "filament", cents: total(qs.filament), detail },
    ...LINE_IDS.slice(1).map((id) => ({ id, cents: total(qs[id]) })),
    { id: "extras", cents: extraDetail.reduce((s, e) => s + e.cents, 0), ...(i.extras.some((e) => e.per !== undefined) ? { detail: extraDetail } : {}) },
  ];
  return { lines, totalCents: nat(lines.reduce((s, l) => s + l.cents, 0), "orderCost") };
}

// ---- channel fees ----
function checkChannel(c: ChannelInput) {
  nat(c.taxBp, "taxBp"); nat(c.surchargeCents, "surchargeCents");
  if (!c.tiers[0] || c.tiers[0].minPriceCents !== 0) bad("first tier must start at 0");
  for (const [k, t] of c.tiers.entries()) {
    if (!t) bad("missing tier");
    nat(t.pctBp, "pctBp"); nat(t.fixedCents, "fixedCents"); nat(t.shippingCents, "shippingCents"); nat(t.minPriceCents, "minPriceCents");
    if (k > 0 && t.minPriceCents <= (c.tiers[k - 1] ?? bad("missing tier")).minPriceCents) bad("tiers must be strictly ascending");
    if (t.pctBp + c.taxBp >= 10000) bad("pctBp + taxBp must be < 10000");
  }
}
const tierIndex = (c: ChannelInput, p: number) => { let k = 0; while (k + 1 < c.tiers.length && (c.tiers[k + 1] ?? bad("missing tier")).minPriceCents <= p) k++; return k; };

export function feeFor(c: ChannelInput, priceCents: number) {
  checkChannel(c); nat(priceCents, "priceCents");
  const t = c.tiers[tierIndex(c, priceCents)] ?? bad("missing tier");
  const pctCents = mulDivRound(priceCents, t.pctBp, 10000);
  const taxCents = mulDivRound(priceCents, c.taxBp, 10000);
  const fixedCents = nat(t.fixedCents + c.surchargeCents, "fixedCents");
  return { pctCents, fixedCents, shippingCents: t.shippingCents, taxCents, totalCents: nat(pctCents + fixedCents + t.shippingCents + taxCents, "totalCents"), tierMin: t.minPriceCents };
}
const netAt = (c: ChannelInput, p: number) => p - feeFor(c, p).totalCents;

/** Prices from `fromCents` through `untilCents` net less than the last price of the tier below. */
export function deadZones(c: ChannelInput): { fromCents: number; untilCents: number }[] {
  checkChannel(c);
  const zones: { fromCents: number; untilCents: number }[] = [];
  c.tiers.forEach((t, k) => {
    if (k === 0) return;
    const lo = t.minPriceCents, ref = netAt(c, lo - 1);
    if (netAt(c, lo) >= ref) return;
    const hi = c.tiers[k + 1]?.minPriceCents ?? Infinity;
    let p = lo + 1; while (p < hi && netAt(c, p) < ref) p++; // ponytail: linear scan, fine for cents-scale bands
    zones.push({ fromCents: lo, untilCents: p - 1 });
  });
  return zones;
}
const inZone = (z: { fromCents: number; untilCents: number }[], p: number) => z.some((x) => p >= x.fromCents && p <= x.untilCents);

export function marginAt(c: ChannelInput, unitCostCents: number, priceCents: number) {
  nat(unitCostCents, "unitCostCents"); nat(priceCents, "priceCents", 1);
  const profitCents = netAt(c, priceCents) - unitCostCents;
  return { profitCents, marginBp: out(roundDiv(big(profitCents) * 10000n, big(priceCents))), inDeadZone: inZone(deadZones(c), priceCents) };
}

/** Lowest price (cents) outside dead zones whose margin >= targetMarginBp; null if none. */
export function suggestPrice(c: ChannelInput, unitCostCents: number, targetMarginBp: number): number | null {
  checkChannel(c); nat(unitCostCents, "unitCostCents"); nat(targetMarginBp, "targetMarginBp");
  const zones = deadZones(c);
  const ok = (p: number) => (netAt(c, p) - unitCostCents) * 10000 >= targetMarginBp * p && !inZone(zones, p);
  for (const [k, t] of c.tiers.entries()) {
    const hi = c.tiers[k + 1]?.minPriceCents ?? Infinity;
    const denom = 10000 - t.pctBp - c.taxBp - targetMarginBp;
    const fixed = unitCostCents + t.fixedCents + t.shippingCents + c.surchargeCents;
    // Each of the two fee roundings loses < 1 cent combined, so net <= p*(1-pct-tax) - fixed + 1.
    // Meeting the target therefore needs p*denom >= 10000*(fixed-1): a safe lower bound.
    const lo = Math.max(t.minPriceCents, 1);
    let p = lo, lim = hi;
    if (denom > 0) p = Math.max(lo, Math.ceil((Math.max(fixed - 1, 0) * 10000) / denom));
    else if (fixed > 1) continue; // rounding gain is < 1 cent, cannot cover fixed >= 2
    else lim = Math.min(hi, lo + 10001); // zero-cost edge: only rounding gains can qualify; period is 10000
    while (p < lim && !ok(p)) p++;
    if (p < lim) return p;
  }
  return null;
}

export const breakEven = (c: ChannelInput, unitCostCents: number) => suggestPrice(c, unitCostCents, 0);
