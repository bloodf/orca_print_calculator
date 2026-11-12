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
    <ChannelSelect v-if="multi" :model-value="derived.selectedChannelId" @update:model-value="(id) => patchDraft({ channelId: id })" />
    <div class="oc-row">
      <div class="oc-qty">
        <p class="sm muted oc-lbl">{{ t("field.quantity") }}</p>
        <Stepper :model-value="store.draft.quantity" :min="1" :max="100000" :label="t('field.quantity')" @update:model-value="(v) => patchDraft({ quantity: v })" />
        <p v-if="run" class="sm muted oc-sum" data-testid="qty-summary">{{ run.summary }}<template v-if="run.plates"><br>{{ run.plates }}</template></p>
        <p v-if="spare > 0" class="sm muted num oc-spare">{{ t("price.spare", { n: spare }) }}. {{ t('price.spareWhy', { set: store.draft.unitsPerSet, n: spare }) }}</p>
      </div>
      <MarkupField
        id="price-margin" :model-value="derived.defaults.targetMarginBp" :label="t('field.margin')" :helper="t('field.marginHelp')"
        :default-value="store.settings.defaults.targetMarginBp" @update:model-value="onMargin" @reset="margin.reset"
      />
    </div>
  </div>
</template>

<style scoped>
.oc > * + * { margin-top: 8px; }
.oc-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: start; }
.oc-lbl { min-height: 24px; display: flex; align-items: center; }
.oc-sum { margin-top: 4px; white-space: normal; }
.oc-spare { margin-top: 4px; }
</style>
