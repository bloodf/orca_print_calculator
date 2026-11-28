<script setup lang="ts">
import Checkbox from "primevue/checkbox";
import { computed, nextTick, ref, useId, watch } from "vue";
import type { PlateRow } from "../../engine/quote";
import { duration, grams, money, slicedTime, date } from "../../format";
import { t } from "../../i18n";
import { currency, locale, store } from "../../state/store";
import type { HostPlate, PlateSnapshot, SlotMatchView } from "../../state/types";
import { OuiIcon, OuiThumb } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";
import Stepper from "../base/Stepper.vue";
import FilamentChip from "./FilamentChip.vue";
import MaterialRow from "./MaterialRow.vue";
import { pickRequest } from "./pickRequest";
import { UNKNOWN } from "./slots";

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

watch(() => pickRequest.seq, () => { if (pickRequest.plate === props.plate.index) open.value = true; });
// a cost that leaves out an unknown time or weight is partial, and says so
const partial = computed(() => !!props.row && (seconds.value === null || totalGrams.value === null));
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
    <Checkbox binary class="inc" :model-value="include" :aria-label="t('plate.include', { n })" @update:model-value="(v: boolean) => emit('update:include', v)" />
    <OuiThumb v-if="host?.thumb" class="thumb" :src="host.thumb" :size="34" :icon="I.plate" />
    <OuiIcon v-else class="thumb none" :icon="I.plate" :size="22" tile :tone="include ? 'cobalt' : 'neutral'" />
    <div class="main">
      <div class="head">
        <h3 class="oui-strong oui-truncate">{{ title }}</h3>
        <span v-if="frozen && savedDate" class="oui-chip">{{ t("plate.saved", { date: savedDate }) }}</span>
        <span v-else-if="stale" class="oui-chip stale" data-tone="warn" :title="t('plate.staleWhy')">{{ t("plate.stale") }}</span>
      </div>
      <p class="meta oui-meta">
        <span class="num" :class="{ gap: seconds === null }">{{ seconds !== null ? duration(seconds, locale) : t("breakdown.unknown.time") }}</span>
        <span class="sep" aria-hidden="true"> · </span>
        <span class="num" :class="{ gap: totalGrams === null }">{{ totalGrams !== null ? grams(totalGrams, locale) : t("breakdown.unknown.grams") }}</span>
        <template v-if="provenance"><span class="sep" aria-hidden="true"> · </span><span class="prov" :title="provenance">{{ provenance }}</span></template>
      </p>
    </div>
    <div class="chips"><!-- DOM order = visual order: checkbox, chips, copies -->
      <FilamentChip v-for="m in matches" :key="m.slot.n" :slot="m.slot" :match="m" :aria-expanded="open ? 'true' : 'false'" :aria-controls="open ? id : undefined" @toggle="toggle(m.slot.n)" />
    </div>
    <div class="copies">
      <span class="oui-meta cp-lbl" aria-hidden="true">{{ t("plate.copiesLabel") }}</span><span class="oui-meta cp-x" aria-hidden="true" :title="t('plate.copiesLabel')">{{ t("plate.copiesShort") }}</span>
      <Stepper :model-value="copies" :min="1" :max="999" :label="t('plate.copies', { n })" @update:model-value="(v) => emit('update:copies', v)" />
    </div>
    <div class="side">
      <p class="cost num"><span v-if="unpriced" class="warn-icon"><OuiIcon :icon="I.error" :size="14" /><span class="oui-sr">{{ t("plate.missingPrice") }} </span></span>
        <span v-if="!include" class="oui-meta">{{ t("plate.excluded") }}</span>
        <template v-else-if="row"><span class="oui-meta cost-cap">{{ t("a11y.costPrefix") }}</span><strong>{{ money(row.totalMinor, currency, locale) }}</strong></template>
        <template v-else><span aria-hidden="true">{{ UNKNOWN }}</span><span class="oui-sr">{{ t("a11y.unknown") }}</span></template>
      </p>
      <span v-if="include && partial" class="oui-chip" data-tone="warn">{{ t("price.partial") }}</span>
      <p v-else-if="include && copies > 1" class="oui-meta num">{{ t("plate.costTimes", { n: copies }) }}</p>
    </div>
    <div v-if="open" :id="id" ref="list" class="rows">
      <MaterialRow v-for="m in matches" :key="m.slot.n" :match="m" />
    </div>
  </article>
</template>

<style scoped>
/* One plate is one row of the Plates panel: what it is, its filaments, how many copies, what it costs. */
.card { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto auto minmax(84px, auto); grid-template-areas: "inc thumb main chips copies side" "rows rows rows rows rows rows";
  align-items: center; gap: var(--oui-s2) var(--oui-s3); padding: var(--oui-s3) var(--oui-s4); }
/* narrower Plates panel: the filaments take a line of their own under the name, so the stepper and the cost keep their column */
@container plates (max-width: 899px) {
  .card { grid-template-columns: auto auto minmax(0, 1fr) auto minmax(84px, auto); grid-template-areas: "inc thumb main copies side" ". . chips chips chips" "rows rows rows rows rows"; }
}
@container plates (max-width: 519px) {
  .card { grid-template-columns: auto auto minmax(0, 1fr) auto; grid-template-areas: "inc thumb main side" ". . chips chips" ". . copies copies" "rows rows rows rows"; }
}
.inc { grid-area: inc; }
.thumb { grid-area: thumb; }
.main { grid-area: main; }
.chips { grid-area: chips; }
.copies { grid-area: copies; }
.side { grid-area: side; }
.rows { grid-area: rows; }
.thumb { border-radius: var(--oui-radius-lg); }
.main { display: grid; gap: 1px; min-width: 0; }
.head { display: flex; flex-wrap: wrap; align-items: center; gap: 2px var(--oui-s2); min-width: 0; }
.head h3 { min-width: 0; max-width: 100%; }
.meta { min-width: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 0 var(--oui-s2); min-width: 0; }
.copies { display: flex; align-items: center; gap: var(--oui-s1); }
/* the full words fit beside the stepper only on a wide Plates panel; narrower, the one word "Copies" (the stepper's name keeps the full words) */
.cp-x { display: none; }
@container plates (max-width: 899px) { .cp-lbl { display: none; } .cp-x { display: inline; } }
.cost-cap { display: block; font-size: var(--oui-text-xs); }
.side { display: grid; justify-items: end; gap: 2px; text-align: end; }
.warn-icon { display: inline-flex; vertical-align: -2px; margin-inline-end: 4px; color: var(--oui-danger); }
.card.off .cost strong { font-weight: 400; }
.rows { padding: 0 var(--oui-s3); background: var(--oui-inset); border-radius: var(--oui-radius); }
</style>
