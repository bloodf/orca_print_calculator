// Channel list edits for Settings: every change replaces the list (immutable), keeps compared/default consistent, and deletes with Undo.
import { t } from "../../i18n";
import { MAX_TIERS, newCustomChannel, validateChannelDef, validateChannelList, type ChannelDef, type Problem, type TierDef } from "../../engine/channels";
import { patchSettings, store } from "../../state/store";
import { toast } from "../../state/toast";

export const channelById = (id: string): ChannelDef | undefined => store.settings.channels.find((c) => c.id === id);

export function updateChannel(id: string, patch: Partial<ChannelDef>): void {
  patchSettings((s) => ({ channels: s.channels.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
}
export function updateTier(id: string, index: number, patch: Partial<TierDef>): void {
  const c = channelById(id);
  if (c) updateChannel(id, { tiers: c.tiers.map((x, i) => (i === index ? { ...x, ...patch } : x)) });
}
/** Appends a zero-fee channel (compared by default) and returns its id. */
export function addChannel(): string {
  const ch = newCustomChannel(t("channel.newName"), store.settings.channels.map((c) => c.id));
  patchSettings((s) => ({ channels: [...s.channels, ch], comparedChannelIds: [...s.comparedChannelIds, ch.id] }));
  return ch.id;
}
export function addTier(id: string, minStep: number): void {
  const c = channelById(id);
  const last = c?.tiers[c.tiers.length - 1];
  if (!c || !last || c.tiers.length >= MAX_TIERS) return;
  updateChannel(id, { tiers: [...c.tiers, { ...last, minMinor: last.minMinor + minStep }] });
}
export function removeTier(id: string, index: number): void {
  const c = channelById(id);
  if (c && index > 0) updateChannel(id, { tiers: c.tiers.filter((_, i) => i !== index) });
}
export function setCompared(id: string, on: boolean): void {
  patchSettings((s) => ({ comparedChannelIds: on ? [...new Set([...s.comparedChannelIds, id])] : s.comparedChannelIds.filter((x) => x !== id) }));
}
export const setDefaultChannel = (id: string): void => patchSettings({ defaultChannelId: id });

/** Delete (never the last channel); Undo puts the same object back at the same index. */
export function removeChannel(id: string): boolean {
  const list = store.settings.channels;
  const index = list.findIndex((c) => c.id === id);
  const gone = list[index];
  if (!gone || list.length < 2) return false;
  const wasCompared = store.settings.comparedChannelIds.includes(id);
  const wasDefault = store.settings.defaultChannelId === id;
  patchSettings((s) => {
    const rest = s.channels.filter((c) => c.id !== id);
    return { channels: rest, comparedChannelIds: s.comparedChannelIds.filter((x) => x !== id), defaultChannelId: wasDefault ? rest[0]!.id : s.defaultChannelId };
  });
  toast({
    text: t("channel.deleted", { name: gone.name }),
    action: {
      label: t("common.undo"),
      run: () => patchSettings((s) => {
        if (s.channels.some((c) => c.id === id)) return {};
        const next = [...s.channels];
        next.splice(Math.min(index, next.length), 0, gone);
        return { channels: next, comparedChannelIds: wasCompared ? [...s.comparedChannelIds, id] : s.comparedChannelIds, defaultChannelId: wasDefault ? id : s.defaultChannelId };
      }),
    },
  });
  return true;
}

/** Engine problems for one channel plus list-level duplicate-id, as codes the UI can place. */
export function problemsFor(id: string): Problem[] {
  const list = store.settings.channels;
  const def = list.find((c) => c.id === id);
  if (!def) return [];
  // A duplicated id marks every channel that shares it: lookups by id cannot tell the copies apart.
  const dup = validateChannelList(list).some((p) => list[p.index!]?.id === id);
  return [...validateChannelDef(def), ...(dup ? [{ code: "duplicate_id" as const }] : [])];
}
export const problemMessage = (p: Problem): string => t(`channel.def.${p.code}`, { max: MAX_TIERS });
