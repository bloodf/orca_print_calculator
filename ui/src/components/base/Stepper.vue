<script setup lang="ts">
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { ref, watch } from "vue";
import { intlLocale, t } from "../../i18n";
import { count } from "../../format";
import Icon from "./Icon.vue";
import { clamp, keyDelta } from "./numeric";

const props = defineProps<{ modelValue: number; min: number; max: number; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: number] }>();

const text = ref(count(props.modelValue, intlLocale()));
const parse = (s: string): number | null => (/^\d+$/.test(s.replace(/[.,\s ]/g, "")) ? Number(s.replace(/[.,\s ]/g, "")) : null);
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
    <Button type="button" severity="secondary" outlined class="stepper-btn" :aria-label="t('a11y.decrease', { label })" :aria-disabled="modelValue <= min ? 'true' : undefined" @click="modelValue > min && set(modelValue - 1)"><Icon name="minus" /></Button>
    <InputText type="text" inputmode="numeric" autocomplete="off" spellcheck="false" class="num stepper-input" :model-value="text" :aria-label="label" @input="onInput" @keydown="onKey" @blur="onBlur" @focus="(e: FocusEvent) => (e.target as HTMLInputElement).select()" />
    <Button type="button" severity="secondary" outlined class="stepper-btn" :aria-label="t('a11y.increase', { label })" :aria-disabled="modelValue >= max ? 'true' : undefined" @click="modelValue < max && set(modelValue + 1)"><Icon name="plus" /></Button>
  </div>
</template>

<style scoped>
.stepper { display: inline-grid; grid-template-columns: 36px minmax(48px, 72px) 36px; align-items: stretch; }
.stepper :deep(.stepper-btn) { width: 36px; padding: 0; }
.stepper :deep(.stepper-btn:first-child) { border-radius: var(--opc-r-control) 0 0 var(--opc-r-control); }
.stepper :deep(.stepper-btn:last-child) { border-radius: 0 var(--opc-r-control) var(--opc-r-control) 0; }
.stepper :deep(.stepper-input) { border-radius: 0; text-align: center; min-width: 0; width: 100%; margin: 0 -1px; }
.stepper :deep(.p-inputtext:focus-visible), .stepper :deep(.p-button:focus-visible) { position: relative; z-index: 1; }
</style>
