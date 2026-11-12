<script setup lang="ts">
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import Listbox from "primevue/listbox";
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
const list = ref<{ $el?: HTMLElement } | null>(null);
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
watch(() => props.open, (o) => { if (o) q.value = ""; });

const selectedId = computed(() => flat.value.find((o) => (o.spoolId === undefined ? props.match.filamentId === o.filamentId && props.match.spoolId === null : props.match.spoolId === o.spoolId))?.id ?? null);
function pick(o: Opt | undefined): void {
  if (!o) return;
  setSlotOverride(preset.value, o.spoolId === undefined ? { filamentId: o.filamentId } : { filamentId: o.filamentId, spoolId: o.spoolId });
  emit("close");
}
const byId = (id: string | null): Opt | undefined => flat.value.find((o) => o.id === id);
// Enter in the search picks the first result (the slot's own material is listed first); ArrowDown moves into the list.
function onSearchKey(e: KeyboardEvent): void {
  if (e.key === "Enter") { e.preventDefault(); pick(flat.value[0]); }
  else if (e.key === "ArrowDown") { e.preventDefault(); list.value?.$el?.querySelector<HTMLElement>(".p-listbox-list")?.focus(); }
}
const lid = `sp-${useId()}`;
const typed = computed(() => store.settings.manualPrices[preset.value] ?? null);
</script>

<template>
  <Popover :open="open" :anchor="anchor" :label="t('match.change')" @close="emit('close')">
    <div class="picker">
      <template v-if="ready">
        <IconField class="search">
          <InputIcon><Icon name="search" /></InputIcon>
          <InputText v-model="q" type="text" autocomplete="off" spellcheck="false" fluid :aria-label="t('picker.search')" :placeholder="t('picker.search')" @keydown="onSearchKey" />
        </IconField>
        <Listbox
          :id="lid" ref="list" class="list" :model-value="selectedId" :options="groups" option-label="title" option-value="id" option-group-label="material" option-group-children="opts"
          :aria-label="t('picker.search')" @change="(e) => e.value && pick(byId(e.value))"
        >
          <template #optiongroup="{ option }"><span class="xs muted group">{{ option.material }}</span></template>
          <template #option="{ option }">
            <span class="opt" :class="{ spool: option.spool }" @click.stop="pick(option)">
              <span v-if="!option.spool" class="title truncate">{{ option.title }}</span>
              <span v-if="!option.spool" class="num sm muted">{{ option.price }}</span>
              <span v-else class="num sm muted sub">{{ option.sub }}</span>
            </span>
          </template>
          <template #empty><span class="sm muted empty">{{ t("picker.empty", { q }) }}</span></template>
        </Listbox>
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
.search { display: block; }
.list :deep(.p-listbox-option) { padding: 0; }
.list :deep(.p-listbox-option-group) { padding: 8px 8px 4px; text-transform: uppercase; letter-spacing: 0.04em; }
.opt { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 32px; padding: 6px 12px; }
.opt > * + * { margin-left: 8px; }
.opt .title { flex: 1; min-width: 0; }
.opt.spool { padding-left: 28px; min-height: 28px; }
.typed { padding-top: 8px; }
.typed > * + * { margin-top: 4px; }
.empty { padding: 8px; display: block; }
</style>
