<script setup lang="ts">
// Labelled text input or textarea for settings (name, shop, footer, currency code). Emits on every input; the store debounces the save.
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Textarea from "primevue/textarea";
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
    <Textarea v-if="multiline" :id="fid" :model-value="modelValue" :rows="rows" :maxlength="maxlength" auto-resize :invalid="!!error" :aria-invalid="error ? 'true' : undefined" :aria-describedby="error || helper ? `${fid}-d` : undefined" @input="onInput" @change="emit('change')" />
    <InputText v-else :id="fid" type="text" autocomplete="off" spellcheck="false" :model-value="modelValue" :maxlength="maxlength" :invalid="!!error" :aria-invalid="error ? 'true' : undefined" :aria-describedby="error || helper ? `${fid}-d` : undefined" @input="onInput" @change="emit('change')" />
    <Message v-if="error" :id="`${fid}-d`" class="tf-help bad" severity="error" size="small" variant="simple" role="alert">{{ error }}</Message>
    <p v-else-if="helper" :id="`${fid}-d`" class="sm tf-help">{{ helper }}</p>
  </div>
</template>

<style scoped>
.tf { min-width: 0; }
.tf.sm { max-width: 128px; }
.tf.md { max-width: 220px; }
.tf-label { display: block; min-height: 24px; line-height: 24px; }
.tf :deep(.p-inputtext), .tf :deep(.p-textarea) { width: 100%; }
.tf :deep(.p-textarea) { resize: vertical; line-height: 1.4; }
.tf-help { margin-top: 2px; color: var(--opc-muted); }
.tf-help.bad { color: var(--opc-bad); }
</style>
