<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import type { PlateRow } from "../../engine/quote";
import { duration, grams, money, slicedTime, date } from "../../format";
import { t } from "../../i18n";
import { currency, locale, store } from "../../state/store";
import type { HostPlate, PlateSnapshot, SlotMatchView } from "../../state/types";
import Badge from "../base/Badge.vue";
import Icon from "../base/Icon.vue";
import Stepper from "../base/Stepper.vue";
import FilamentChip from "./FilamentChip.vue";
import MaterialRow from "./MaterialRow.vue";
import { pickRequest } from "./pickRequest";
import { UNKNOWN } from "./slots";
import emptyPlate from "../../assets/empty-plate.svg?raw";

const props = defineProps<{ plate: HostPlate | PlateSnapshot; row: PlateRow | null; matches: SlotMatchView[]; include: boolean; copies: number; stale: boolean; frozen: boolean }>();
const emit = defineEmits<{ "update:include": [value: boolean]; "update:copies": [value: number] }>();

const id = `plate-${props.plate.index}-${useId()}`;
const open = ref(false);
const list = ref<HTMLElement | null>(null);
const n = computed(() => props.plate.index + 1);
const host = computed(() => ("slicedAt" in props.plate ? props.plate : null));
const title = computed(() => (props.plate.name ? t("plate.titleNamed", { n: n.value, name: props.plate.name }) : t("plate.title", { n: n.value })));
const seconds = computed(() => props.plate.seconds);
const totalGrams = computed<number | null>(() => {
  const g = props.matches.map((m) => m.slot.grams);
  return g.length && g.every((x) => x !== null) ? (g as number[]).reduce((a, b) => a + b, 0) : null;
});
const provenance = computed(() => {
  const h = host.value;
  if (!h) return "";
  if (h.source === "file" && h.fileName) return t("plate.fromFile", { file: h.fileName });
  return h.slicedAt ? t("plate.slicedAt", { time: slicedTime(h.slicedAt, locale.value) }) : "";
});
const savedDate = computed(() => {
  const q = store.quotes.find((x) => x.id === store.draft.quoteId);
  return q ? date(q.updatedAt, locale.value) : "";
});
const thumbSvg = emptyPlate.replace(/ role="img" aria-label="[^"]*"/, ' aria-hidden="true" focusable="false"');

watch(() => pickRequest.seq, () => { if (pickRequest.plate === props.plate.index) open.value = true; });
const unpriced = computed(() => props.include && props.matches.some((m) => m.pricePerKg === null));

async function toggle(slotN: number): Promise<void> {
  open.value = !open.value;
  if (!open.value) return;
  await nextTick();
  list.value?.querySelectorAll<HTMLElement>(".mrow")[props.matches.findIndex((m) => m.slot.n === slotN)]?.focus();
}
</script>

<template>
  <article class="card" :class="{ off: !include }" :aria-label="title">
    <input type="checkbox" class="inc" :checked="include" :aria-label="t('plate.include', { n })" @change="emit('update:include', ($event.target as HTMLInputElement).checked)" />
    <img v-if="host?.thumb" class="thumb" :src="host.thumb" alt="" width="64" height="64" />
    <span v-else class="thumb none" v-html="thumbSvg" />
    <div class="main">
      <div class="head">
        <h3 class="lg truncate">{{ title }}</h3>
        <Badge v-if="frozen && savedDate" tone="neutral" :text="t('plate.saved', { date: savedDate })" />
        <Badge v-else-if="stale" class="badge-in" tone="warn" :text="t('plate.stale')" :title="t('plate.staleWhy')" />
      </div>
      <p class="meta muted sm">
        <span class="num"><template v-if="seconds !== null">{{ duration(seconds, locale) }}</template><template v-else><span aria-hidden="true">{{ UNKNOWN }}</span><span class="sr-only">{{ t("a11y.unknown") }}</span></template></span>
        <span class="sep" aria-hidden="true">·</span>
        <span class="num"><template v-if="totalGrams !== null">{{ grams(totalGrams, locale) }}</template><template v-else><span aria-hidden="true">{{ UNKNOWN }}</span><span class="sr-only">{{ t("a11y.unknown") }}</span></template></span>
      </p>
      <p v-if="provenance" class="prov sm muted truncate" :title="provenance">{{ provenance }}</p>
    </div>
    <div class="side">
      <p class="cost num"><span v-if="unpriced" class="warn-icon"><Icon name="alert-circle" /><span class="sr-only">{{ t("plate.missingPrice") }} </span></span>
        <span v-if="!include" class="sm muted">{{ t("plate.excluded") }}</span>
        <template v-else-if="row"><span class="sr-only">{{ t("a11y.costPrefix") }} </span>{{ money(row.totalMinor, currency, locale) }}</template>
        <template v-else><span aria-hidden="true">{{ UNKNOWN }}</span><span class="sr-only">{{ t("a11y.unknown") }}</span></template>
      </p>
      <p v-if="include" class="sm muted num">{{ copies > 1 ? t("plate.costTimes", { n: copies }) : t("plate.cost") }}</p>
    </div>
    <div class="chips"><!-- DOM order = visual order = §7.7: checkbox, chips, copies -->
      <FilamentChip v-for="m in matches" :key="m.slot.n" :slot="m.slot" :match="m" :aria-expanded="open ? 'true' : 'false'" :aria-controls="open ? id : undefined" @toggle="toggle(m.slot.n)" />
    </div>
    <div class="copies">
      <Stepper :model-value="copies" :min="1" :max="999" :label="t('plate.copies', { n })" @update:model-value="(v) => emit('update:copies', v)" />
    </div>
    <div v-if="open" :id="id" ref="list" class="rows hairline">
      <MaterialRow v-for="m in matches" :key="m.slot.n" :match="m" />
    </div>
  </article>
</template>

<style scoped>
.card { display: grid; grid-template-columns: 16px 64px minmax(0, 1fr) auto; column-gap: 12px; align-items: start; min-height: 88px; padding: 12px; background: var(--opc-raised); border: 1px solid var(--opc-border); border-radius: var(--opc-r-surface); }
.card.off { border-style: dashed; color: var(--opc-muted); }
.inc { margin: 4px 0 0; width: 14px; height: 14px; }
.thumb { width: 64px; height: 64px; object-fit: cover; border-radius: var(--opc-r-control); background: var(--opc-track); display: flex; align-items: center; justify-content: center; }
.thumb.none { color: var(--opc-muted); overflow: hidden; }
.thumb.none :deep(svg) { width: 64px; height: 43px; }
.main { min-width: 0; }
.head { display: flex; flex-wrap: wrap; align-items: center; min-width: 0; } /* the badge drops under the title instead of squeezing it */
.head > * { margin-right: 8px; }
.head h3 { margin: 0; min-width: 0; max-width: 100%; }
.meta { margin-top: 2px; display: flex; min-width: 0; white-space: nowrap; }
.meta .num { flex: none; }
.sep { flex: none; padding: 0 0.5em; }
.prov { margin-top: 1px; }
/* Chips take the whole card width under the title row, so a material name never competes with the copies stepper. */
.chips { grid-column: 3 / -1; grid-row: 2; display: flex; flex-wrap: wrap; margin-left: -4px; }
.chips > * { margin: 4px 0 0 4px; }
.warn-icon { display: inline-flex; vertical-align: -2px; margin-right: 4px; color: var(--opc-bad); }
.side { grid-column: 4; grid-row: 1; display: flex; flex-direction: column; align-items: flex-end; }
.side > * + * { margin-top: 2px; }
.copies { grid-column: 3 / -1; grid-row: 3; justify-self: end; margin-top: 8px; }
.cost { font-size: var(--opc-fs-lg); font-weight: 500; color: var(--opc-fg); line-height: 1.25; }
.rows { grid-column: 1 / -1; margin-top: 12px; }
.card.off .cost { font-weight: 400; }
@media (max-width: 420px) { .card { grid-template-columns: 16px 48px minmax(0, 1fr); } .thumb { width: 48px; height: 48px; } .side { grid-column: 3; grid-row: 2; align-items: flex-start; } .chips { grid-row: 3; } .copies { grid-column: 3; grid-row: 4; justify-self: start; } }
</style>
