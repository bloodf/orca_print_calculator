<script setup lang="ts">
// Native select with the NumberField head (override dot + reset) so cost sections look uniform.
import { useId } from "vue";
import ResetButton from "../base/ResetButton.vue";
import { t } from "../../i18n";

withDefaults(
  defineProps<{ modelValue: string; label: string; options: { value: string; label: string }[]; overridden?: boolean; defaultText?: string; helper?: string; hideLabel?: boolean }>(),
  { overridden: false, defaultText: "", helper: undefined, hideLabel: false },
);
defineEmits<{ "update:modelValue": [value: string]; reset: [] }>();
const fid = `sf-${useId()}`;
</script>

<template>
  <div class="sf">
    <div class="sf-head row" :class="{ 'sr-only': hideLabel }">
      <span v-if="overridden" class="ovr-dot" aria-hidden="true" />
      <span v-if="overridden" class="sr-only">{{ t("a11y.edited") }}</span>
      <label :for="fid" class="sm muted">{{ label }}</label>
      <ResetButton v-if="overridden" :label="label" :default-text="defaultText" @click="$emit('reset')" />
    </div>
    <select :id="fid" :value="modelValue" :aria-describedby="helper ? `${fid}-d` : undefined" @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
      <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
    <p v-if="helper" :id="`${fid}-d`" class="sm muted sf-help">{{ helper }}</p>
  </div>
</template>

<style scoped>
.sf { min-width: 0; }
.sf select { width: 100%; height: 28px; }
.sf-head { min-height: 24px; }
.sf-head > * + * { margin-left: 4px; }
.sf-help { margin-top: 2px; }
</style>
