import { PRINTER_PRESETS, type PrinterPreset } from "./printers";

export const DEFAULT_WATTS = 120;

export type PrinterMatch = {
  preset: PrinterPreset | null;
  watts: number;
  estimated: boolean;
  how: "exact" | "alias" | "tokens" | "default";
};

export type ResolvedWatts = { watts: number; source: "saved" | "match"; match: PrinterMatch };

const NOISE = new Set(["nozzle", "klipper", "copy", "tuned", "balanced"]);
// Single-token keys too vague to identify a printer on their own.
const GENERIC = new Set(["plus", "pro", "max", "mini", "se", "v2", "v3", "hi", "one", "l", "s", "neo", "dual", "kit"]);
const VENDOR_PREFIX = /^(original )?(prusa|bambu lab|bambu|bbl|creality|sovol|snapmaker) /;
const MAX_INPUT = 200;

/** Orca printer_model names that normalization alone cannot map to a preset id. */
const ALIASES: Record<string, string[]> = {
  "snapmaker-2-a150": ["a150"],
  "snapmaker-2-a250": ["a250"],
  "snapmaker-2-a350": ["a350"],
  "prusa-i3-mk3": ["mk3"],
  "prusa-i3-mk3s": ["mk3s"],
  "prusa-i3-mk3s-plus": ["mk3s plus"],
  "prusa-i3-mk2s": ["mk2", "mk2s"],
  "prusa-mini": ["mini is"],
  "prusa-xl-single": ["xl"],
  "prusa-xl-five": ["xl 5t"],
};

const normalize0 = (raw: string): string => {
  return raw
    .slice(0, MAX_INPUT)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(?\b0\.\d+\s*(mm\s*)?nozzle\)?/g, " ")
    .replace(/(\d)\.(\d)/g, "$1$2")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !NOISE.has(t))
    .join(" ");
};

export const normalize = (raw: string): string => {
  const s = normalize0(raw);
  const stripped = s.replace(VENDOR_PREFIX, "");
  return stripped.trim() ? stripped : s;
};

type Entry = { preset: PrinterPreset; key: string; tokens: Set<string>; alias: boolean };

const entries: Entry[] = PRINTER_PRESETS.flatMap((preset) => {
  const keys = [{ key: normalize(preset.model), alias: false }, ...(ALIASES[preset.id] ?? []).map((key) => ({ key, alias: true }))];
  return keys.map(({ key, alias }) => ({ preset, key, tokens: new Set(key.split(" ")), alias }));
});

const result = (preset: PrinterPreset, how: PrinterMatch["how"]): PrinterMatch => ({ preset, watts: preset.watts, estimated: preset.estimated, how });
const DEFAULT: PrinterMatch = { preset: null, watts: DEFAULT_WATTS, estimated: true, how: "default" };

export const matchPrinter = (model: string, vendor?: string): PrinterMatch => {
  const key = normalize(model);
  if (!key) return DEFAULT;
  const v = vendor ? normalize(vendor) : "";
  const sameVendor = (e: Entry) => (v && (normalize(e.preset.manufacturer).includes(v) || v.includes(normalize(e.preset.manufacturer))) ? 1 : 0);

  // A bare generic key ("Mini", "Hi") only counts as exact when the vendor is known or was in the string.
  const anchored = Boolean(v) || VENDOR_PREFIX.test(`${normalize0(model)} `);
  const exact = entries
    .filter((e) => e.key === key && (anchored || !GENERIC.has(key))).sort((a, b) => sameVendor(b) - sameVendor(a) || Number(a.alias) - Number(b.alias))[0];
  if (exact) return result(exact.preset, exact.alias ? "alias" : "exact");

  const tokens = new Set(key.split(" "));
  let best: Entry | undefined;
  for (const e of entries) {
    if (e.tokens.size === 1 && GENERIC.has([...e.tokens][0])) continue;
    if (![...e.tokens].every((t) => tokens.has(t))) continue;
    if (!best || e.tokens.size > best.tokens.size || (e.tokens.size === best.tokens.size && sameVendor(e) > sameVendor(best))) best = e;
  }
  return best ? result(best.preset, "tokens") : DEFAULT;
};

/** Saved user value for this exact printer_model always wins (if finite and > 0), else the preset/default match. */
export const resolveWatts = (model: string, vendor: string | undefined, saved: Record<string, { watts: number }>): ResolvedWatts => {
  const match = matchPrinter(model, vendor);
  const w = Object.prototype.hasOwnProperty.call(saved, model) ? saved[model]?.watts : undefined;
  return typeof w === "number" && Number.isFinite(w) && w > 0 ? { watts: w, source: "saved", match } : { watts: match.watts, source: "match", match };
};
