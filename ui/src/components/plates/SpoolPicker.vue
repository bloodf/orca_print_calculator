<script setup lang="ts">
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import Listbox from "primevue/listbox";
import { computed, ref, useId, watch } from "vue";
import { grams, safeColor } from "../../format";
import { fitScore, pinnedPrice } from "../../engine/match";
import { t } from "../../i18n";
import { currency, digits, locale, store } from "../../state/store";
import type { SlotMatchView } from "../../state/types";
import { OuiIcon, OuiSwatch } from "../../../shared/src/components";
import * as I from "../../../shared/src/icons";
import MoneyField from "../base/MoneyField.vue";
import Popover from "../base/Popover.vue";
import { kgMoney, setManualPrice, setSlotSpool, slotSpoolOf, UNKNOWN } from "./slots";

const props = defineProps<{ match: SlotMatchView; open: boolean; anchor: HTMLElement | null }>();
const emit = defineEmits<{ close: [] }>();

type Opt = { id: string; filamentId?: number; spoolId?: number; title: string; sub: string; color: string | null; score: number };
const AUTO = "auto";
const q = ref("");
const list = ref<{ $el?: HTMLElement } | null>(null);
const ready = computed(() => store.spoolman.state === "ok");
const preset = computed(() => props.match.slot.preset);

/** Auto, then every spool Spoolman has in use, best fit for this slot first: same material, then the nearest colour. */
const flat = computed(() => {
  const needle = q.value.trim().toLowerCase();
  const { filaments, spools } = store.spoolman.data;
  const opts: Opt[] = [];
  for (const s of spools) {
    const f = s.archived ? undefined : filaments.find((x) => x.id === s.filamentId);
    if (!f) continue;
    const hay = [`#${s.id}`, `spool ${s.id}`, f.vendor, f.name, f.material].join(" ").toLowerCase();
    if (needle && !hay.includes(needle)) continue;
    const sp = pinnedPrice(f, s);
    const price = sp ? kgMoney(sp.pricePerKg) : UNKNOWN;
    const left = typeof s.remainingWeight === "number" ? grams(Math.max(0, s.remainingWeight), locale.value) : UNKNOWN;
    opts.push({
      id: `sp-${s.id}`, filamentId: f.id, spoolId: s.id, color: safeColor(f.colorHex), score: fitScore(props.match.slot, f),
      title: [f.vendor, f.name].filter(Boolean).join(" ") || `#${f.id}`,
      sub: [f.material, t("picker.spoolLine", { id: s.id, left, price })].filter(Boolean).join(" · "),
    });
  }
  opts.sort((a, b) => a.score - b.score || a.spoolId! - b.spoolId!);
  return needle ? opts : [{ id: AUTO, title: t("picker.auto"), sub: t("picker.autoHint"), color: null, score: -1 }, ...opts];
});
watch(() => props.open, (o) => { if (o) q.value = ""; });

const chosen = computed(() => slotSpoolOf(props.match));
const selectedId = computed(() => (chosen.value === null ? AUTO : `sp-${chosen.value}`));
function pick(o: Opt | undefined): void {
  if (!o) return;
  setSlotSpool(props.match, o.spoolId === undefined || o.filamentId === undefined ? null : { filamentId: o.filamentId, spoolId: o.spoolId });
  emit("close");
}
const byId = (id: string | null): Opt | undefined => flat.value.find((o) => o.id === id);
// Enter in the search picks the first result (the best fit); ArrowDown moves into the list.
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
          <InputIcon><OuiIcon :icon="I.search" /></InputIcon>
          <InputText v-model="q" type="text" autocomplete="off" spellcheck="false" fluid :aria-label="t('picker.search')" :placeholder="t('picker.search')" @keydown="onSearchKey" />
        </IconField>
        <Listbox
          :id="lid" ref="list" class="list" :model-value="selectedId" :options="flat" option-label="title" option-value="id"
          :aria-label="t('picker.search')" @change="(e) => e.value && pick(byId(e.value))"
        >
          <template #option="{ option }">
            <span class="opt" :data-spool="option.spoolId" @click.stop="pick(option)">
              <OuiSwatch v-if="option.spoolId !== undefined" :color="option.color" :size="12" />
              <OuiIcon v-else :icon="I.refresh" :size="12" />
              <span class="text">
                <span class="title oui-truncate">{{ option.title }}</span>
                <span class="sub sm oui-muted num oui-truncate">{{ option.sub }}</span>
              </span>
            </span>
          </template>
          <template #empty><span class="sm oui-muted empty">{{ t("picker.empty", { q }) }}</span></template>
        </Listbox>
      </template>
      <p v-else class="sm oui-muted">{{ t("picker.connect") }}</p>
      <div class="hairline typed">
        <MoneyField :model-value="typed" :label="t('picker.typePrice')" :digits="digits" :currency="currency" :step="10 ** Math.max(0, digits - 1)" unit="/kg" nullable @update:model-value="(v) => setManualPrice(preset, v)" />
        <p v-if="match.source === 'none' || match.source === 'preset'" class="sm oui-muted">{{ t("picker.noPresetCost") }}</p>
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.picker > * + * { margin-top: 8px; }
.search { display: block; }
.list :deep(.p-listbox-option) { padding: 0; }
.opt { display: flex; align-items: center; width: 100%; min-height: 36px; padding: 6px 12px; }
.opt > * + * { margin-left: 8px; }
.text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.typed { padding-top: 8px; }
.typed > * + * { margin-top: 4px; }
.empty { padding: 8px; display: block; }
</style>
