<script setup lang="ts">
import { computed } from "vue";
import { currencySymbol } from "../../format";
import { intlLocale } from "../../i18n";
import NumberField from "./NumberField.vue";

// Model = integer minor units at `digits` fraction digits (energy prices pass currencyDigits + 2).
const props = withDefaults(
  defineProps<{
    modelValue: number | null; label: string; digits: number; currency: string; step: number;
    unit?: string; min?: number; max?: number; nullable?: boolean; required?: boolean;
    defaultValue?: number | null; error?: string; helper?: string; id?: string; width?: "sm" | "md"; readonly?: boolean;
  }>(),
  { unit: undefined, min: 0, max: undefined, defaultValue: undefined, error: undefined, helper: undefined, id: undefined, width: undefined, readonly: false },
);
defineEmits<{ "update:modelValue": [value: number | null]; reset: [] }>();
const prefix = computed(() => currencySymbol(props.currency, intlLocale()));
const rest = computed(() => ({ ...props, digits: undefined, currency: undefined }));
</script>

<template>
  <NumberField
    v-bind="rest" :scale="10 ** digits" :prefix="prefix" :money="{ digits, currency }"
    @update:model-value="(v) => $emit('update:modelValue', v)" @reset="$emit('reset')"
  />
</template>
