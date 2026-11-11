<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { grams } from "../../format";
import { pricePerKg } from "../../engine/match";
import { t } from "../../i18n";
import { currency, digits, locale, store } from "../../state/store";
import type { SlotMatchView } from "../../state/types";
import Icon from "../base/Icon.vue";
import MoneyField from "../base/MoneyField.vue";
import Popover from "../base/Popover.vue";
import { kgMoney, perKg, setManualPrice, setSlotOverride, UNKNOWN } from "./slots";

const props = defineProps<{ match: SlotMatchView; open: boolean; anchor: HTMLElement | null }>();
const emit = defineEmits<{ close: [] }>();

type Opt = { id: string; filamentId: number; spoolId?: number; title: string; sub: string; price: string; spool: boolean };
const q = ref("");
const active = ref(0);
const ready = computed(() => store.spoolman.state === "ok");
const preset = computed(() => props.match.slot.preset);

const groups = computed(() => {
  const needle = q.value.trim().toLowerCase();
  const { filaments, spools } = store.spoolman.data;
  const out = new Map<string, Opt[]>();
  for (const f of filaments) {
    const mine = spools.filter((s) => s.filamentId === f.id && !s.archived);
    const hay = [f.id, f.vendor, f.name, f.material, ...mine.map((s) => `spool ${s.id}`)].join(" ").toLowerCase();
    if (needle && !hay.includes(needle)) continue;
    const fp = pricePerKg(f, spools);
    const rows: Opt[] = [{ id: `fil-${f.id}`, filamentId: f.id, title: `#${f.id} ${f.vendor ?? ""} ${f.name}`.replace(/\s+/g, " "), sub: "", price: fp ? perKg(fp.pricePerKg) : UNKNOWN, spool: false }];
    for (const s of mine) {
      const sp = pricePerKg(f, spools, s.id);
      const left = typeof s.remainingWeight === "number" ? grams(Math.max(0, s.remainingWeight), locale.value) : UNKNOWN;
      rows.push({ id: `sp-${s.id}`, filamentId: f.id, spoolId: s.id, title: "", sub: t("picker.spoolLine", { id: s.id, left, price: sp ? kgMoney(sp.pricePerKg) : UNKNOWN }), price: "", spool: true });
    }
    const key = f.material ?? UNKNOWN;
    out.set(key, [...(out.get(key) ?? []), ...rows]);
  }
  // The slot's own material opens first: Enter on the first option must not silently price PLA as ASA.
  const mine = (props.match.slot.material ?? "").toLowerCase();
  const rank = (k: string): number => (mine && k.toLowerCase() === mine ? 0 : 1);
  return [...out.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b)).map(([material, opts]) => ({ material, opts }));
});
const flat = computed(() => groups.value.flatMap((g) => g.opts));
watch(q, () => { active.value = 0; });
watch(() => props.open, (o) => { if (o) { q.value = ""; active.value = 0; } });

const isSel = (o: Opt): boolean => (o.spoolId === undefined ? props.match.filamentId === o.filamentId && props.match.spoolId === null : props.match.spoolId === o.spoolId);
function pick(o: Opt | undefined): void {
  if (!o) return;
  setSlotOverride(preset.value, o.spoolId === undefined ? { filamentId: o.filamentId } : { filamentId: o.filamentId, spoolId: o.spoolId });
  emit("close");
}
function onKey(e: KeyboardEvent): void {
  const n = flat.value.length;
  if (!n) return;
  if (e.key === "ArrowDown") { e.preventDefault(); active.value = (active.value + 1) % n; }
  else if (e.key === "ArrowUp") { e.preventDefault(); active.value = (active.value - 1 + n) % n; }
  else if (e.key === "Home") { e.preventDefault(); active.value = 0; }
  else if (e.key === "End") { e.preventDefault(); active.value = n - 1; }
  else if (e.key === "Enter") { e.preventDefault(); pick(flat.value[active.value]); }
  else return;
  document.getElementById(`${lid}-${flat.value[active.value]?.id}`)?.scrollIntoView?.({ block: "nearest" });
}
const lid = `sp-${useId()}`;
const typed = computed(() => store.settings.manualPrices[preset.value] ?? null);
</script>

<template>
  <Popover :open="open" :anchor="anchor" :label="t('match.change')" @close="emit('close')">
    <div class="picker">
      <template v-if="ready">
        <div class="search">
          <Icon name="search" />
          <input v-model="q" type="text" role="combobox" aria-expanded="true" autocomplete="off" spellcheck="false" :aria-controls="lid" :aria-activedescendant="flat.length ? `${lid}-${flat[active]?.id}` : undefined" :aria-label="t('picker.search')" :placeholder="t('picker.search')" @keydown="onKey" />
        </div>
        <div :id="lid" role="listbox" :aria-label="t('picker.search')" class="list">
          <div v-for="g in groups" :key="g.material" role="group" :aria-label="g.material">
            <p class="xs muted group" aria-hidden="true">{{ g.material }}</p>
            <div v-for="o in g.opts" :id="`${lid}-${o.id}`" :key="o.id" role="option" class="opt" :class="{ spool: o.spool, on: flat[active]?.id === o.id }" :aria-selected="isSel(o) ? 'true' : 'false'" @mousedown.prevent @click="pick(o)">
              <span v-if="!o.spool" class="title truncate">{{ o.title }}</span>
              <span v-if="!o.spool" class="num sm muted">{{ o.price }}</span>
              <span v-else class="num sm muted sub">{{ o.sub }}</span>
              <Icon v-if="isSel(o)" name="check" />
            </div>
          </div>
          <p v-if="!flat.length" class="sm muted empty">{{ t("picker.empty", { q }) }}</p>
        </div>
      </template>
      <p v-else class="sm muted">{{ t("picker.connect") }}</p>
      <div class="hairline typed">
        <MoneyField :model-value="typed" :label="t('picker.typePrice')" :digits="digits" :currency="currency" :step="10 ** Math.max(0, digits - 1)" unit="/kg" nullable @update:model-value="(v) => setManualPrice(preset, v)" />
        <p v-if="match.source === 'none' || match.source === 'preset'" class="xs muted">{{ t("picker.noPresetCost") }}</p>
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.picker > * + * { margin-top: 8px; }
.search { display: flex; align-items: center; color: var(--opc-muted); }
.search input { flex: 1; min-width: 0; margin-left: 8px; }
.list { max-height: 200px; overflow-y: auto; }
.group { padding: 8px 8px 4px; text-transform: uppercase; letter-spacing: 0.04em; }
.opt { display: flex; align-items: center; justify-content: space-between; min-height: 28px; padding: 4px 8px; border-radius: var(--opc-r-control); cursor: pointer; }
.opt > * + * { margin-left: 8px; }
.opt .title { flex: 1; min-width: 0; }
.opt.spool { padding-left: 24px; min-height: 24px; }
.opt.on, .opt:hover { background: var(--opc-hover); }
.opt[aria-selected="true"] { color: var(--opc-accent-text); }
.typed { padding-top: 8px; }
.typed > * + * { margin-top: 4px; }
.empty { padding: 8px; }
</style>
