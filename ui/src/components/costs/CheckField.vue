<script setup lang="ts">
// Checkbox row with the override dot + reset used by the cost sections.
import { useId } from "vue";
import ResetButton from "../base/ResetButton.vue";
import { t } from "../../i18n";

withDefaults(defineProps<{ modelValue: boolean; label: string; overridden?: boolean; defaultText?: string }>(), { overridden: false, defaultText: "" });
defineEmits<{ "update:modelValue": [value: boolean]; reset: [] }>();
const fid = `cf-${useId()}`;
</script>

<template>
  <div class="cf row">
    <input :id="fid" type="checkbox" :checked="modelValue" @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)" />
    <span v-if="overridden" class="ovr-dot" aria-hidden="true" />
    <span v-if="overridden" class="sr-only">{{ t("a11y.edited") }}</span>
    <label :for="fid" class="sm">{{ label }}</label>
    <ResetButton v-if="overridden" :label="label" :default-text="defaultText" @click="$emit('reset')" />
  </div>
</template>

<style scoped>
.cf { min-height: 28px; }
</style>
