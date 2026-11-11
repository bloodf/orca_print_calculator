<script setup lang="ts">
import NumberField from "./NumberField.vue";

// Model = basis points (3000 = 30%).
withDefaults(
  defineProps<{
    modelValue: number | null; label: string; step?: number; min?: number; max?: number; nullable?: boolean; required?: boolean;
    defaultValue?: number | null; error?: string; helper?: string; id?: string; width?: "sm" | "md"; readonly?: boolean;
  }>(),
  { step: 100, min: 0, max: 9900, defaultValue: undefined, error: undefined, helper: undefined, id: undefined, width: undefined, readonly: false },
);
defineEmits<{ "update:modelValue": [value: number | null]; reset: [] }>();
</script>

<template>
  <NumberField
    v-bind="$props" :scale="100" unit="%" :step="step"
    @update:model-value="(v) => $emit('update:modelValue', v)" @reset="$emit('reset')"
  />
</template>
