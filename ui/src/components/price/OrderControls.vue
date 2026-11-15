<script setup lang="ts">
// Channel (2+ channels only), quantity and target margin; the spare-pieces note sits under the quantity.
import { computed } from "vue";
import { t } from "../../i18n";
import MarkupField from "../base/MarkupField.vue";
import Stepper from "../base/Stepper.vue";
import { derived, patchDraft, result, store } from "../../state/store";
import { useDefault } from "../costs/shared";
import ChannelSelect from "./ChannelSelect.vue";

const multi = computed(() => store.settings.channels.length >= 2);
const spare = computed(() => (result.value.ok ? result.value.sparePieces : 0));
// How the three quantities compose, from the engine's own numbers: pieces ordered = runs x pieces per run (spare pieces are the
// rounding up), and every run prints each included plate once per copy. Nothing is recomputed here.
const run = computed(() => {
  const r = result.value;
  if (!r.ok) return null;
  const plates = r.plates.filter((p) => p.include);
  const perRun = plates.reduce((s, p) => s + p.copies, 0);
  const per = store.draft.unitsPerSet;
  const multiCopy = plates.some((p) => p.copies > 1);
  if (store.draft.quantity === 1 && per === 1 && !multiCopy) return null;
  return { summary: t("qty.summary", { pieces: t("qty.pieces", { n: store.draft.quantity }), runs: t("qty.runs", { n: r.runs }), per: t("qty.pieces", { n: per }) }), plates: multiCopy ? t("qty.platesPerRun", { n: perRun }) : "" };
});
const margin = useDefault("targetMarginBp"); // same set/reset (toast + Undo) as every section field
const onMargin = (v: number | null): void => { if (v !== null) margin.set(v); };
</script>

<template>
  <div class="oc">
    <div v-if="multi" class="oui-field">
      <span class="oc-lbl">{{ t("price.channel") }}</span>
      <ChannelSelect :model-value="derived.selectedChannelId" @update:model-value="(id) => patchDraft({ channelId: id })" />
    </div>
    <div class="oui-field oc-qty">
      <span class="oc-lbl">{{ t("field.quantity") }}</span>
      <Stepper :model-value="store.draft.quantity" :min="1" :max="100000" :label="t('field.quantity')" @update:model-value="(v) => patchDraft({ quantity: v })" />
    </div>
    <p v-if="run || spare > 0" class="oui-meta oc-note">
      <span v-if="run" class="oc-sum" data-testid="qty-summary">{{ run.summary }}<template v-if="run.plates"><br>{{ run.plates }}</template></span>
      <span v-if="spare > 0" class="num oc-spare">{{ t("price.spare", { n: spare }) }}. {{ t('price.spareWhy', { set: store.draft.unitsPerSet, n: spare }) }}</span>
    </p>
    <MarkupField
      id="price-margin" class="oc-markup" :model-value="derived.defaults.targetMarginBp" :label="t('field.margin')" :helper="t('field.marginHelp')"
      :default-value="store.settings.defaults.targetMarginBp" @update:model-value="onMargin" @reset="margin.reset"
    />
  </div>
</template>

<style scoped>
.oc { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--oui-s3); align-items: start; }
.oc-lbl { font-size: var(--oui-text-sm); font-weight: 600; color: var(--oui-muted); }
.oc-note { grid-column: 1 / -1; display: grid; gap: 2px; white-space: normal; margin-top: calc(-1 * var(--oui-s1)); }
.oc-spare { white-space: normal; }
/* Markup: the field on the left, what it means beside it, so the one long explanation does not push the form down. */
.oc-markup { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--oui-s3); align-items: start; }
.oc-markup :deep(.nf-head), .oc-markup :deep(.nf-box) { grid-column: 1; }
.oc-markup :deep(.nf-help) { grid-column: 2; grid-row: 1 / span 2; margin: 0; align-self: center; }
</style>
