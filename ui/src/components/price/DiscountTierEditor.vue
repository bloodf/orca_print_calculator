<script setup lang="ts">
import Button from "primevue/button";
// Volume discount tiers: add (max 6), remove with undo, sorted by quantity on blur, duplicate quantities flagged.
// Reused by Settings (no defaultValue there, so no override dot).
import { computed } from "vue";
import { t } from "../../i18n";
import { toast } from "../../state/toast";
import type { DiscountTier } from "../../state/types";
import Icon from "../base/Icon.vue";
import PercentField from "../base/PercentField.vue";
import ResetButton from "../base/ResetButton.vue";
import Stepper from "../base/Stepper.vue";
import { pct } from "./priceState";

const MAX_TIERS = 6;
const props = defineProps<{ modelValue: DiscountTier[]; defaultValue?: DiscountTier[] }>();
const emit = defineEmits<{ "update:modelValue": [value: DiscountTier[]]; reset: [] }>();

const overridden = computed(() => props.defaultValue !== undefined && JSON.stringify(props.modelValue) !== JSON.stringify(props.defaultValue));
const defaultText = computed(() => (props.defaultValue?.length ? props.defaultValue.map((x) => `${x.minQty}: ${pct(x.discountBp)}`).join(", ") : t("tier.none")));
const dupes = computed(() => {
  const seen = new Set<number>(), dup = new Set<number>();
  for (const x of props.modelValue) (seen.has(x.minQty) ? dup : seen).add(x.minQty);
  return dup;
});

const patch = (i: number, p: Partial<DiscountTier>): void => emit("update:modelValue", props.modelValue.map((x, k) => (k === i ? { ...x, ...p } : x)));
function sortOnBlur(e: FocusEvent): void {
  if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) return; // still inside the row
  const sorted = [...props.modelValue].sort((a, b) => a.minQty - b.minQty);
  if (sorted.some((x, k) => x !== props.modelValue[k])) emit("update:modelValue", sorted);
}
function add(): void {
  if (props.modelValue.length >= MAX_TIERS) return;
  const last = props.modelValue.reduce<DiscountTier | null>((b, x) => (!b || x.minQty > b.minQty ? x : b), null);
  const next: DiscountTier = last ? { minQty: Math.min(100000, last.minQty * 2), discountBp: Math.min(9900, last.discountBp + 500) } : { minQty: 10, discountBp: 500 };
  emit("update:modelValue", [...props.modelValue, next]);
}
function remove(i: number): void {
  const before = props.modelValue;
  emit("update:modelValue", before.filter((_, k) => k !== i));
  toast({ text: t("tier.removed"), action: { label: t("common.undo"), run: () => emit("update:modelValue", before) } });
}
</script>

<template>
  <div class="tiers">
    <div v-if="overridden" class="row edited">
      <span class="ovr-dot" aria-hidden="true" /><span class="sr-only">{{ t("a11y.edited") }}</span>
      <ResetButton :label="t('tier.add')" :default-text="defaultText" @click="emit('reset')" />
    </div>
    <div v-for="(tier, i) in modelValue" :key="i" class="tier" data-tier @focusout="sortOnBlur">
      <div class="trow">
        <div class="cell"><p class="sm muted lbl">{{ t("tier.from") }}</p><Stepper :model-value="tier.minQty" :min="2" :max="100000" :label="t('tier.from')" @update:model-value="(v) => patch(i, { minQty: v })" /></div>
        <PercentField :model-value="tier.discountBp" :label="t('tier.discount')" :min="0" :max="9900" :step="100" @update:model-value="(v) => v !== null && patch(i, { discountBp: v })" />
        <Button text severity="secondary" type="button" class="rm icon-btn" :aria-label="t('common.removeNamed', { name: `${t('tier.add')} ${tier.minQty}` })" @click="remove(i)"><Icon name="trash" /></Button>
      </div>
      <p v-if="dupes.has(tier.minQty)" class="sm err" role="alert">{{ t("field.error.duplicateTier") }}</p>
    </div>
    <Button text v-if="modelValue.length < MAX_TIERS" type="button" class="add" @click="add"><Icon name="plus" /><span>{{ t("tier.add") }}</span></Button>
  </div>
</template>

<style scoped>
.tier { margin-top: 8px; }
.trow { display: grid; grid-template-columns: auto minmax(0, 1fr) 24px; gap: 8px; align-items: end; }
.lbl { min-height: 24px; display: flex; align-items: center; }
.rm { margin-bottom: 2px; }
.err { color: var(--opc-bad); margin-top: 2px; }
.add { margin-top: 8px; margin-left: -10px; }
.edited { height: 24px; }
</style>
