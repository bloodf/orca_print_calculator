<script setup lang="ts" generic="V extends string">
// A radio group of PrimeVue buttons: one choice, roving tabindex, arrows and Home/End (PrimeVue's SelectButton is a row of
// toggle buttons with no radio semantics or arrow keys, so the group behaviour lives here).
import Button from "primevue/button";
import { ref } from "vue";
import Icon from "./Icon.vue";
import type { IconName } from "./icons";

export type SegOption<T extends string> = { value: T; label: string; icon?: IconName };
const props = defineProps<{ options: SegOption<V>[]; modelValue: V; label: string }>();
const emit = defineEmits<{ "update:modelValue": [value: V] }>();
const btns = ref<HTMLElement[]>([]);

function move(to: number): void {
  const o = props.options[(to + props.options.length) % props.options.length];
  if (!o) return;
  emit("update:modelValue", o.value);
  queueMicrotask(() => btns.value[props.options.indexOf(o)]?.focus());
}
function onKey(e: KeyboardEvent, i: number): void {
  const k = e.key;
  if (k === "ArrowRight" || k === "ArrowDown") move(i + 1);
  else if (k === "ArrowLeft" || k === "ArrowUp") move(i - 1);
  else if (k === "Home") move(0);
  else if (k === "End") move(props.options.length - 1);
  else return;
  e.preventDefault();
}
const el = (c: unknown): HTMLElement | undefined => (c as { $el?: HTMLElement } | null)?.$el;
</script>

<template>
  <div class="seg" role="radiogroup" :aria-label="label">
    <Button
      v-for="(o, i) in options" :key="o.value" :ref="(c) => { const n = el(c); if (n) btns[i] = n; }" type="button" role="radio" size="small"
      :severity="o.value === modelValue ? 'primary' : 'secondary'" :outlined="o.value !== modelValue"
      class="seg-opt" :aria-checked="o.value === modelValue" :tabindex="o.value === modelValue ? 0 : -1" @click="emit('update:modelValue', o.value)" @keydown="onKey($event, i)"
    >
      <Icon v-if="o.icon" :name="o.icon" />
      <span>{{ o.label }}</span>
    </Button>
  </div>
</template>

<style scoped>
.seg { display: inline-flex; flex-wrap: wrap; min-width: 0; }
.seg :deep(.seg-opt) { border-radius: 0; }
.seg :deep(.seg-opt + .seg-opt) { margin-left: -1px; }
.seg :deep(.seg-opt:first-child) { border-radius: var(--opc-r-control) 0 0 var(--opc-r-control); }
.seg :deep(.seg-opt:last-child) { border-radius: 0 var(--opc-r-control) var(--opc-r-control) 0; }
.seg :deep(.seg-opt:focus-visible) { position: relative; z-index: 1; }
</style>
