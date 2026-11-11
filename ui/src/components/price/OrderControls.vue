<script setup lang="ts">
// Channel (2+ channels only), quantity and target margin; the spare-pieces note sits under the quantity.
import { computed } from "vue";
import { t } from "../../i18n";
import PercentField from "../base/PercentField.vue";
import Stepper from "../base/Stepper.vue";
import { derived, patchDraft, result, store } from "../../state/store";
import { useDefault } from "../costs/shared";
import ChannelSelect from "./ChannelSelect.vue";

const multi = computed(() => store.settings.channels.length >= 2);
const spare = computed(() => (result.value.ok ? result.value.sparePieces : 0));
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
        <p v-if="spare > 0" class="sm muted num oc-spare" :title="t('price.spareWhy', { set: store.draft.unitsPerSet, n: spare })">{{ t("price.spare", { n: spare }) }}</p>
      </div>
      <PercentField
        id="price-margin" :model-value="derived.defaults.targetMarginBp" :label="t('field.margin')" :min="0" :max="9500" :step="100"
        :default-value="store.settings.defaults.targetMarginBp" @update:model-value="onMargin" @reset="margin.reset"
      />
    </div>
  </div>
</template>

<style scoped>
.oc > * + * { margin-top: 8px; }
.oc-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: start; }
.oc-lbl { min-height: 24px; display: flex; align-items: center; }
.oc-spare { margin-top: 4px; cursor: help; }
</style>
