// Sales channels: user-typed fee definitions validated into the vendored engine's ChannelInput.
// No marketplace presets or integrations: the user enters the fee percent, fixed fee, tax and
// optional price tiers they actually pay. Only "Direct" (zero fees) ships.
import type { ChannelInput } from "./costs";

export type TierDef = { minMinor: number; pctBp: number; fixedMinor: number; shippingMinor: number };
export type ChannelDef = { id: string; name: string; taxBp: number; surchargeMinor: number; tiers: TierDef[] };

export type ProblemCode =
  | "name_empty" | "no_tiers" | "too_many_tiers" | "not_natural"
  | "first_tier_not_zero" | "tiers_not_ascending" | "pct_plus_tax_too_high" | "duplicate_id";
export type Problem = { code: ProblemCode; tier?: number; index?: number };

export const MAX_TIERS = 8;
/** pct + tax cap. */
export const MAX_PCT_PLUS_TAX_BP = 9000;

const natural = (n: number) => Number.isSafeInteger(n) && n >= 0;

export function validateChannelDef(def: ChannelDef): Problem[] {
  const out: Problem[] = [];
  if (typeof def.name !== "string" || !def.name.trim()) out.push({ code: "name_empty" });
  if (def.tiers.length < 1) out.push({ code: "no_tiers" });
  if (def.tiers.length > MAX_TIERS) out.push({ code: "too_many_tiers" });
  if (!natural(def.taxBp) || !natural(def.surchargeMinor)) out.push({ code: "not_natural" });
  def.tiers.forEach((t, i) => {
    if (![t.minMinor, t.pctBp, t.fixedMinor, t.shippingMinor].every(natural)) out.push({ code: "not_natural", tier: i });
    if (i === 0 && t.minMinor !== 0) out.push({ code: "first_tier_not_zero", tier: 0 });
    const prev = def.tiers[i - 1];
    if (prev && t.minMinor <= prev.minMinor) out.push({ code: "tiers_not_ascending", tier: i });
    if (t.pctBp + def.taxBp > MAX_PCT_PLUS_TAX_BP) out.push({ code: "pct_plus_tax_too_high", tier: i });
  });
  // One entry per code+tier; a bad tax can trip every tier but the caller only needs to see it once.
  return out.filter((p, i) => out.findIndex((q) => q.code === p.code && (p.code === "pct_plus_tax_too_high" ? true : q.tier === p.tier)) === i);
}

/** Ids must be unique across a channel list (UI state is keyed by id). */
export function validateChannelList(defs: readonly ChannelDef[]): Problem[] {
  return defs.flatMap((d, index) => (defs.findIndex((x) => x.id === d.id) < index ? [{ code: "duplicate_id" as const, index }] : []));
}

export function toChannelInput(def: ChannelDef): { ok: true; input: ChannelInput } | { ok: false; problems: Problem[] } {
  const problems = validateChannelDef(def);
  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    input: {
      taxBp: def.taxBp,
      surchargeCents: def.surchargeMinor,
      tiers: def.tiers.map((t) => ({ minPriceCents: t.minMinor, pctBp: t.pctBp, fixedCents: t.fixedMinor, shippingCents: t.shippingMinor })),
    },
  };
}

const flat = (): TierDef[] => [{ minMinor: 0, pctBp: 0, fixedMinor: 0, shippingMinor: 0 }];

/** Fresh zero-fee channel with the first free id `custom-<n>` among `existingIds`. */
export function newCustomChannel(name: string, existingIds: readonly string[] = []): ChannelDef {
  let n = 1;
  while (existingIds.includes(`custom-${n}`)) n++;
  return { id: `custom-${n}`, name, taxBp: 0, surchargeMinor: 0, tiers: flat() };
}

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
};

export const DEFAULT_CHANNELS: readonly ChannelDef[] = deepFreeze([{ id: "direct", name: "Direct", taxBp: 0, surchargeMinor: 0, tiers: flat() }]);

/** Mutable starting list: Direct plus one blank custom channel for the user's own fees. */
export function defaultChannels(): ChannelDef[] {
  const list = DEFAULT_CHANNELS.map((c) => ({ ...c, tiers: c.tiers.map((t) => ({ ...t })) })); // no structuredClone: safari14 target
  return [...list, newCustomChannel("Custom", list.map((c) => c.id))];
}
