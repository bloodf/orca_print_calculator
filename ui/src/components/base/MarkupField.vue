<script setup lang="ts">
// Shows a margin-on-price model (basis points) as markup over cost. Keeps the typed markup while it still maps to
// the stored margin, so "33.34" is not rewritten to "33.33" under the cursor.
import { computed, ref } from "vue";
import { MAX_MARKUP_BP, marginOf, markupOf } from "../../state/markup";
import PercentField from "./PercentField.vue";

const props = withDefaults(
  defineProps<{ modelValue: number; label: string; defaultValue?: number; helper?: string; id?: string; width?: "sm" | "md" }>(),
  { defaultValue: undefined, helper: undefined, id: undefined, width: undefined },
);
const emit = defineEmits<{ "update:modelValue": [value: number]; reset: [] }>();
const typed = ref<number | null>(null);
const shown = computed(() => (typed.value !== null && marginOf(typed.value) === props.modelValue ? typed.value : markupOf(props.modelValue)));
function onUpdate(v: number | null): void {
  if (v === null) return;
  typed.value = v;
  emit("update:modelValue", marginOf(v));
}
</script>

<template>
  <PercentField
    :id="id" :model-value="shown" :label="label" :helper="helper" :width="width" :min="0" :max="MAX_MARKUP_BP" :step="500"
    :default-value="defaultValue === undefined ? undefined : markupOf(defaultValue)" @update:model-value="onUpdate" @reset="emit('reset')"
  />
</template>
