<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { ref, watch } from "vue";
import { intlLocale, t } from "../../i18n";
import { count } from "../../format";
import { OuiIcon } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";
import { clamp, keyDelta } from "./numeric";

const props = defineProps<{ modelValue: number; min: number; max: number; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: number] }>();

const text = ref(count(props.modelValue, intlLocale()));
// Whole counts: plain digits, or thousands groups of exactly three ("1.000", "1,000", "1 000"). "2.5" is refused, never 25.
const parse = (s: string): number | null => {
  const v = s.trim();
  return /^\d+$/.test(v) || /^\d{1,3}(?:[.,\s]\d{3})+$/.test(v) ? Number(v.replace(/\D/g, "")) : null;
};
watch(() => props.modelValue, (v) => { if (parse(text.value) !== v) text.value = count(v, intlLocale()); });

function set(v: number): void {
  const n = clamp(v, props.min, props.max);
  text.value = count(n, intlLocale());
  if (n !== props.modelValue) emit("update:modelValue", n);
}
function onInput(e: Event): void {
  text.value = (e.target as HTMLInputElement).value;
  const n = parse(text.value);
  if (n !== null && n >= props.min && n <= props.max && n !== props.modelValue) emit("update:modelValue", n);
}
function onBlur(): void {
  const n = parse(text.value);
  set(n ?? props.modelValue);
}
function onKey(e: KeyboardEvent): void {
  if (e.key === "Enter") { onBlur(); return; }
  if (e.key === "Escape") { text.value = count(props.modelValue, intlLocale()); (e.target as HTMLElement).blur(); return; }
  const d = keyDelta(e, 1, false);
  if (d === null) return;
  e.preventDefault();
  set(props.modelValue + d);
}
</script>

<template>
  <div class="stepper" role="group" :aria-label="label">
    <Button type="button" severity="secondary" class="stepper-btn" :aria-label="t('a11y.decrease', { label })" :aria-disabled="modelValue <= min ? 'true' : undefined" @click="modelValue > min && set(modelValue - 1)"><OuiIcon :icon="I.minus" /></Button>
    <InputText type="text" inputmode="numeric" autocomplete="off" spellcheck="false" class="num stepper-input" :model-value="text" :aria-label="label" @input="onInput" @keydown="onKey" @blur="onBlur" @focus="(e: FocusEvent) => (e.target as HTMLInputElement).select()" />
    <Button type="button" severity="secondary" class="stepper-btn" :aria-label="t('a11y.increase', { label })" :aria-disabled="modelValue >= max ? 'true' : undefined" @click="modelValue < max && set(modelValue + 1)"><OuiIcon :icon="I.plus" /></Button>
  </div>
</template>

<style scoped>
.stepper { display: inline-grid; grid-template-columns: 36px minmax(48px, 72px) 36px; align-items: stretch; }
.stepper :deep(.stepper-btn) { width: 36px; padding: 0; }
.stepper :deep(.stepper-btn:first-child) { border-radius: var(--oui-radius) 0 0 var(--oui-radius); }
.stepper :deep(.stepper-btn:last-child) { border-radius: 0 var(--oui-radius) var(--oui-radius) 0; }
.stepper :deep(.stepper-input) { border-radius: 0; text-align: center; min-width: 0; width: 100%; margin: 0 -1px; }
.stepper :deep(.p-inputtext:focus-visible), .stepper :deep(.p-button:focus-visible) { position: relative; z-index: 1; }
</style>
