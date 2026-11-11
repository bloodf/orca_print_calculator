// Print cost model. Pure: every number the UI shows comes from here.
export type Material = { name: string; pricePerKg: number; grams: number };
export type Channel = { id: string; name: string; feePct: number; feeFixed: number };
// Extra item bought per finished piece or per print job (ring, LED, magnet, ribbon).
export type ExtraLine = { id?: string; name: string; unitCost: number; qty: number; per: "piece" | "print" };

export type CostInput = {
  materials: Material[];
  printMinutes: number;
  unitsPerPrint: number; // pieces that come out of one print job
  printerWatts: number; kwhPrice: number;
  printerCost: number; lifetimeHours: number;
  maintenancePerHour: number;
  failurePct: number; // share of prints that fail and are thrown away
  prepMinutes: number; postMinutes: number; laborPerHour: number;
  packaging: number; // per unit
  taxPct: number; // MEI/Simples share of the sale price
  pricing: { mode: "markup" | "margin"; pct: number };
  channel: Channel;
  extras?: ExtraLine[];
};

export type CostResult = {
  lines: { id: string; label: string; value: number }[]; // per unit, in BRL
  unitCost: number;
  price: number | null; // null when fees + tax + margin leave nothing to price against
  feeAmount: number; taxAmount: number;
  profitPerUnit: number | null; profitPerPrinterHour: number | null;
  problem?: string;
  extrasSubtotal?: number; // per unit, only when extras were given
};

export const DEFAULT_CHANNELS: [Channel, Channel, Channel, Channel] = [
  { id: "ml-classic", name: "Mercado Livre Clássico", feePct: 12, feeFixed: 6.5 },
  { id: "ml-premium", name: "Mercado Livre Premium", feePct: 17, feeFixed: 6.5 },
  { id: "shopee", name: "Shopee", feePct: 20, feeFixed: 4 },
  { id: "own", name: "Site próprio", feePct: 0, feeFixed: 0 },
];

export const DEFAULT_INPUT: CostInput = {
  materials: [{ name: "PLA", pricePerKg: 130, grams: 20 }], // 1 kg roll at R$ 130
  printMinutes: 120, unitsPerPrint: 1,
  printerWatts: 120, kwhPrice: 0.95, // Enel SP residential B1 with ICMS + PIS/COFINS, green flag, Oct 2026
  printerCost: 3000, lifetimeHours: 4000, maintenancePerHour: 0.3,
  failurePct: 5, prepMinutes: 5, postMinutes: 10, laborPerHour: 25,
  packaging: 1.5, taxPct: 0,
  pricing: { mode: "markup", pct: 100 },
  channel: DEFAULT_CHANNELS[3],
};

const n = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);

export function calculate(i: CostInput): CostResult {
  const hrs = n(i.printMinutes) / 60;
  const units = Math.max(Math.floor(n(i.unitsPerPrint)), 1);
  const filament = i.materials.reduce((s, m) => s + (n(m.pricePerKg) / 1000) * n(m.grams), 0);
  const energy = (n(i.printerWatts) / 1000) * hrs * n(i.kwhPrice);
  const depreciation = i.lifetimeHours > 0 ? (n(i.printerCost) / i.lifetimeHours) * hrs : 0;
  const maintenance = n(i.maintenancePerHour) * hrs;
  const production = filament + energy + depreciation + maintenance;
  const p = Math.min(n(i.failurePct), 95) / 100;
  const failure = production * (p / (1 - p)); // expected waste per good print
  const labor = ((n(i.prepMinutes) + n(i.postMinutes)) / 60) * n(i.laborPerHour);

  const extraLines = (i.extras ?? []).map((e, k) => ({
    id: `extra:${e.id ?? k}`, label: e.name, value: (n(e.unitCost) * n(e.qty)) / (e.per === "print" ? units : 1),
  }));
  const lines = [
    { id: "filament", label: "Filamento", value: filament / units },
    { id: "energy", label: "Energia", value: energy / units },
    { id: "depreciation", label: "Depreciação da impressora", value: depreciation / units },
    { id: "maintenance", label: "Manutenção", value: maintenance / units },
    { id: "failure", label: "Falhas", value: failure / units },
    { id: "labor", label: "Mão de obra", value: labor / units },
    { id: "packaging", label: "Embalagem", value: n(i.packaging) },
    ...extraLines,
  ];
  const extra = extraLines.length ? { extrasSubtotal: extraLines.reduce((s, l) => s + l.value, 0) } : {};
  const unitCost = lines.reduce((s, l) => s + l.value, 0);

  const fee = n(i.channel.feePct) / 100, fixed = n(i.channel.feeFixed), tax = n(i.taxPct) / 100, pct = n(i.pricing.pct) / 100;
  // net = price*(1 - fee - tax) - fixed ; profit = net - unitCost
  const keep = 1 - fee - tax;
  const price = i.pricing.mode === "markup"
    ? (keep > 0 ? (unitCost * (1 + pct) + fixed) / keep : null)
    : (keep - pct > 0 ? (unitCost + fixed) / (keep - pct) : null); // profit = pct * price
  if (price == null) {
    return { lines, unitCost, ...extra, price: null, feeAmount: 0, taxAmount: 0, profitPerUnit: null, profitPerPrinterHour: null,
      problem: "Taxas, imposto e margem somam 100% ou mais. Reduza algum deles." };
  }
  const feeAmount = price * fee + fixed, taxAmount = price * tax;
  const profitPerUnit = price - feeAmount - taxAmount - unitCost;
  return { lines, unitCost, ...extra, price, feeAmount, taxAmount, profitPerUnit, profitPerPrinterHour: hrs > 0 ? (profitPerUnit * units) / hrs : null };
}
