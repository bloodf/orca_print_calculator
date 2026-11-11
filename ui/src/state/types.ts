// Shared state shapes (docs/ux.md §5.1). Bridge payloads the UI assumes; see the T4.2 report for assumptions.
import type { ChannelDef } from "../engine/channels";
import type { MatchSource, SlotOverride, SpoolmanFilament, SpoolmanSpool } from "../engine/match";
import type { ChannelQuote, DiscountTier, PrettyMode, QuoteExtra, QuoteInput, QuoteResult, QuoteSlot } from "../engine/quote";

export type { ChannelDef, DiscountTier, PrettyMode, QuoteExtra, QuoteInput, QuoteResult, QuoteSlot, SlotOverride };

export type View = "calc" | "quotes" | "stock" | "settings";
export type Lang = "auto" | "en" | "pt-BR";
export type ShippingMode = "none" | "customer" | "absorbed"; // "none" maps to engine {mode:"customer", minor:0}

export type HostInfo = { projectName: string | null; printerModel: string | null; printerVendor: string | null; pluginVersion: string };
export type HostSlot = { n: number; preset: string; grams: number | null; color: string | null; costPerKg: number | null; notes: string; material: string | null };
export type HostPlate = {
  index: number; name: string | null; seconds: number | null; stale: boolean; thumb: string | null /* data: URI */;
  slicedAt: string | null /* ISO time the host captured it */; source: "slice" | "file"; fileName: string | null; slots: HostSlot[];
};
export type SpoolerInfo = { url: string | null; presetToFilament: Record<string, number> } | null;
export type SpoolmanSpoolRow = SpoolmanSpool & { remainingWeight?: number | null };
export type SpoolmanData = { currency: string | null; filaments: SpoolmanFilament[]; spools: SpoolmanSpoolRow[] };
/** `unreadable`: names of saved files ("settings", "quotes") that exist but could not be read; the host refuses to overwrite them. */
export type HostState = { host: HostInfo; plates: HostPlate[]; settings: Settings | null; quotes: SavedQuote[] | null; spooler: SpoolerInfo; unreadable?: string[] };

export type PrinterProfile = { watts: number | null; acquisitionMinor: number | null; lifetimeHours: number | null };
export type CatalogExtra = { key: string; label: string; unitMinor: number; qtyE3: number; per: "piece" | "plate" | "order"; /** Units on hand at qty scale (E3); absent or null = stock not tracked. */ stockE3?: number | null };
/** Logo (PNG/JPEG data URI or "") and company details printed on the quote sheet. */
export type SheetBrand = { logo: string; taxId: string; phone: string; email: string; website: string; address: string; payment: string; accent: string };
export type Defaults = {
  energyPerKwh: string | null; // canonical "0.95" (dot decimal, major units); null = not set
  failureBp: number; failureMode: "markup" | "expected_waste"; failureIncludesMachine: boolean;
  depreciationEnabled: boolean; maintenancePerHourMinor: number; fixedPerPrintHourMinor: number;
  laborPerHourMinor: number | null; laborMinutes: number; setupMinutes: number;
  targetMarginBp: number; pretty: PrettyMode; minOrderMinor: number;
  shipping: { mode: ShippingMode; minor: number }; discountTiers: DiscountTier[];
};
export type OverridableKey = keyof Defaults;
export type Settings = {
  version: 1; onboarded: boolean; language: Lang; currency: string | null; defaultsCurrency: string | null;
  spoolman: { url: string }; defaults: Defaults;
  channels: ChannelDef[]; comparedChannelIds: string[]; defaultChannelId: string;
  printers: Record<string, PrinterProfile>; // key = printer_model
  slotOverrides: Record<string, SlotOverride>; // key = filament preset name
  manualPrices: Record<string, number>; // key = preset; minor units per kg
  extrasCatalog: CatalogExtra[];
  sheet: { shopName: string; footer: string; validityDays: number; nextNo: number } & SheetBrand;
  ui: { open: Record<string, boolean>; sheetMode: "itemized" | "summary" };
  /** Rows from an older or hand-edited file that this version could not read. Written back untouched, never deleted. */
  invalid?: Record<string, unknown>;
};
export type SlotSource = MatchSource | "manual";
/** `filamentId` is optional so quotes saved before it existed still load (they show a generic "filament match" badge). */
export type PlateSnapshot = { index: number; name: string | null; seconds: number; slots: (QuoteSlot & { color: string | null; source: SlotSource; filamentId?: number | null })[] };
/** Frozen with a saved quote. The logo is not: it is large and belongs to the shop, so it always comes from settings. */
export type SheetDetails = { shopName: string; footer: string; validityDays: number } & Partial<Omit<SheetBrand, "logo">>;
export type SavedQuote = {
  id: string; no: number; createdAt: string; updatedAt: string;
  title: string; customer: string; note: string;
  currency: string; channelId: string; plates: PlateSnapshot[];
  input: QuoteInput; // frozen; reopening recomputes from this exactly
  summary: { channelName: string; price: number; grandTotal: number; marginBp: number; quantity: number };
  /** Shop name, footer and validity as they were at save time. Absent on quotes saved before this field existed (the sheet then uses today's settings). */
  sheet?: SheetDetails;
};
export type Draft = {
  quoteId: string | null; title: string; customer: string; note: string;
  channelId: string; quantity: number; unitsPerSet: number;
  plates: Record<number, { include: boolean; copies: number }>;
  overrides: Partial<{ [K in OverridableKey]: Defaults[K] }>; // keys of Defaults the user changed for this quote
  extras: QuoteExtra[]; discountTiers: DiscountTier[];
  frozenPlates: PlateSnapshot[] | null; // set when a saved quote is open
  /** Currency of the open saved quote: it renders and computes in its own currency, not today's. */
  currency?: string | null;
  /** The saved quote's whole engine input and the defaults read back from it: while set, they replace today's settings. */
  frozenInput?: QuoteInput | null;
  frozenDefaults?: Defaults | null;
};

export type SpoolmanState = "unset" | "connecting" | "ok" | "offline";

/** One filament slot after matching, ready to render (chips, material rows). */
export type SlotMatchView = {
  plateIndex: number; slot: HostSlot; key: string; source: SlotSource;
  filamentId: number | null; spoolId: number | null;
  pricePerKg: number | null; // major units, null = no price
  priceSource: "spool" | "filament" | "preset" | "manual" | null;
};

export type NotCounted =
  | { kind: "energy" | "labor" | "wear" }
  | { kind: "time"; plate: number }
  | { kind: "grams"; plate: number; slot: number };

export type SelectedChannel = ChannelQuote | null;
