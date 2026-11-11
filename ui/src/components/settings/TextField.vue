<script setup lang="ts">
// Labelled text input or textarea for settings (name, shop, footer, currency code). Emits on every input; the store debounces the save.
import { useId } from "vue";
const props = withDefaults(
  defineProps<{ modelValue: string; label: string; maxlength?: number; error?: string; helper?: string; multiline?: boolean; rows?: number; width?: "sm" | "md"; upper?: boolean; id?: string }>(),
  { maxlength: undefined, error: undefined, helper: undefined, multiline: false, rows: 3, width: undefined, upper: false, id: undefined },
);
const emit = defineEmits<{ "update:modelValue": [value: string]; change: [] }>();
const fid = props.id ?? `tf-${useId()}`;
const onInput = (e: Event): void => {
  const el = e.target as HTMLInputElement | HTMLTextAreaElement;
  emit("update:modelValue", props.upper ? el.value.toUpperCase() : el.value);
};
</script>

<template>
  <div class="tf" :class="width">
    <label :for="fid" class="sm muted tf-label">{{ label }}</label>
    <textarea v-if="multiline" :id="fid" :value="modelValue" :rows="rows" :maxlength="maxlength" :aria-invalid="error ? 'true' : undefined" :aria-describedby="error || helper ? `${fid}-d` : undefined" @input="onInput" @change="emit('change')" />
    <input v-else :id="fid" type="text" autocomplete="off" spellcheck="false" :value="modelValue" :maxlength="maxlength" :aria-invalid="error ? 'true' : undefined" :aria-describedby="error || helper ? `${fid}-d` : undefined" @input="onInput" @change="emit('change')" />
    <p v-if="error || helper" :id="`${fid}-d`" class="sm tf-help" :class="{ bad: !!error }" :role="error ? 'alert' : undefined">{{ error || helper }}</p>
  </div>
</template>

<style scoped>
.tf { min-width: 0; }
.tf.sm { max-width: 112px; }
.tf.md { max-width: 220px; }
.tf-label { display: block; min-height: 24px; line-height: 24px; }
.tf input, .tf textarea { width: 100%; }
.tf textarea { resize: vertical; line-height: 1.4; }
.tf-help { margin-top: 2px; color: var(--opc-muted); }
.tf-help.bad { color: var(--opc-bad); }
</style>
