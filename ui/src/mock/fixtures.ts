// Dev-harness fixtures. Never imported by production code (main.ts loads mock/ only under import.meta.env.DEV).
import type { HostInfo, HostPlate, HostSlot, SavedQuote, Settings, SpoolerInfo, SpoolmanData } from "../state/types";
import { defaultSettings } from "../state/defaults";
import { deriveQuote } from "../state/derive";
import type { Draft } from "../state/types";
import { newDraft } from "../state/defaults";

export const HOST: HostInfo = { projectName: "Desk organizer", printerModel: "Snapmaker U1", printerVendor: "Snapmaker", pluginVersion: "0.1.0" };
export const BAMBU_HOST: HostInfo = { projectName: "Gridfinity bins", printerModel: "Bambu Lab X1 Carbon", printerVendor: "BBL", pluginVersion: "0.1.0" };

const slot = (n: number, preset: string, grams: number | null, color: string, costPerKg: number | null, material = "PLA"): HostSlot => ({ n, preset, grams, color, costPerKg, notes: "", material });
const AT = (h: number, m: number): string => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };

const PLA = "Generic PLA @U1";
const PETG = "Generic PETG (#12)";

// The host never sends plate names or thumbnails (no Orca API for them yet): both stay null here too, as in
// tests/contract/*.json, so the harness shows what Orca will show.
export const plates = (): HostPlate[] => [
  { index: 0, name: null, seconds: 8040, stale: false, thumb: null, slicedAt: AT(14, 32), source: "slice", fileName: null, slots: [slot(1, PLA, 88, "#E8E8E8", 24), slot(2, PETG, 41, "#2E6FBF", 30, "PETG")] },
  { index: 1, name: null, seconds: 9300, stale: false, thumb: null, slicedAt: AT(14, 33), source: "slice", fileName: null, slots: [slot(1, PLA, 150, "#E8E8E8", 24)] },
  { index: 2, name: null, seconds: 8700, stale: false, thumb: null, slicedAt: AT(14, 35), source: "slice", fileName: null, slots: [slot(1, PLA, 80, "#E8E8E8", 24), slot(2, PETG, 42, "#2E6FBF", 30, "PETG")] },
];

export const spooler = (): SpoolerInfo => ({ url: "http://192.168.1.10:7912", presetToFilament: { [PLA]: 3 } });

const FIL: [number, string, string, string, number, string][] = [
  [1, "Prusament", "PLA Galaxy Black", "PLA", 129.9, "#222222"], [2, "Polymaker", "PolyTerra PLA Cotton White", "PLA", 99, "#F3F3F1"],
  [3, "eSun", "PLA+ White", "PLA", 89.9, "#FFFFFF"], [4, "Sunlu", "PLA Silk Gold", "PLA", 109, "#D4AF37"],
  [12, "Overture", "PETG Blue", "PETG", 119, "#2E6FBF"], [13, "Polymaker", "PolyLite PETG Grey", "PETG", 124, "#8A8A8A"],
  [20, "Sunlu", "TPU 95A Black", "TPU", 159, "#1A1A1A"], [21, "Bambu Lab", "ASA Black", "ASA", 169, "#111111"],
];
export const spoolman = (): SpoolmanData => ({
  currency: "BRL",
  filaments: FIL.map(([id, vendor, name, material, price, colorHex]) => ({ id, vendor, name, material, price, weight: 1000, colorHex })),
  spools: Array.from({ length: 14 }, (_, i) => {
    const f = FIL[i % FIL.length]!;
    return { id: i + 1, filamentId: f[0], price: f[4] + (i % 3) * 5, initialWeight: 1000, archived: i === 13, lastUsed: `2026-1${i % 2}-0${(i % 9) + 1}T10:00:00Z`, remainingWeight: 1000 - i * 55 };
  }),
});

export function settings(over: Partial<Settings> = {}): Settings {
  const s = defaultSettings("BRL", "Direct");
  return {
    ...s, onboarded: true, spoolman: { url: "http://192.168.1.10:7912" },
    defaults: { ...s.defaults, energyPerKwh: "0.95", laborPerHourMinor: 3000, targetMarginBp: 3000 },
    channels: [
      s.channels[0]!,
      { id: "store", name: "Online store", taxBp: 600, surchargeMinor: 0, tiers: [{ minMinor: 0, pctBp: 500, fixedMinor: 100, shippingMinor: 0 }] },
    ],
    comparedChannelIds: ["direct", "store"], defaultChannelId: "store",
    printers: { "Snapmaker U1": { watts: 120, acquisitionMinor: 450000, lifetimeHours: 5000 } },
    sheet: { shopName: "Studio Layer", footer: "Payment on delivery. Lead time 5 days.", validityDays: 15, nextNo: 43 },
    ...over,
  };
}

/** Saved quotes are built with the real engine so they never drift from it. */
export function savedQuotes(): SavedQuote[] {
  const s = settings();
  const draft: Draft = { ...newDraft(s), quantity: 10, title: "Desk organizer", customer: "Ana Souza" };
  const d = deriveQuote({ settings: s, draft, plates: plates(), host: HOST, spoolman: spoolman(), spooler: spooler(), currency: "BRL" });
  const sel = d.selected;
  if (!d.result.ok || !sel || !sel.ok) return [];
  const mk = (id: string, no: number, day: number): SavedQuote => ({
    id, no, createdAt: `2026-11-0${day}T12:00:00Z`, updatedAt: `2026-11-0${day}T12:00:00Z`, title: "Desk organizer", customer: "Ana Souza", note: "",
    currency: "BRL", channelId: d.selectedChannelId, plates: d.snapshots, input: d.quoteInput,
    summary: { channelName: sel.name, price: sel.price, grandTotal: sel.grandTotal, marginBp: sel.marginBp, quantity: 10 },
  });
  return [mk("q-a", 41, 3), mk("q-b", 42, 8)];
}
