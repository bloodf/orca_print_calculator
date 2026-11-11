<script setup lang="ts" generic="V extends string">
import { ref } from "vue";
import Icon from "./Icon.vue";
import type { IconName } from "./icons";

export type SegOption<T extends string> = { value: T; label: string; icon?: IconName };
/** `manual`: arrows and Home/End only move focus; Enter or Space (a click) activates (header tabs switch whole views). */
const props = defineProps<{ options: SegOption<V>[]; modelValue: V; label: string; iconOnlyNarrow?: boolean; manual?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: V] }>();
const btns = ref<HTMLElement[]>([]);

function move(to: number): void {
  const o = props.options[(to + props.options.length) % props.options.length];
  if (!o) return;
  if (!props.manual) emit("update:modelValue", o.value);
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
</script>

<template>
  <div class="seg" role="radiogroup" :aria-label="label">
    <button
      v-for="(o, i) in options" :key="o.value" :ref="(el) => { if (el) btns[i] = el as HTMLElement; }" type="button" role="radio"
      class="seg-opt" :class="{ on: o.value === modelValue }" :aria-checked="o.value === modelValue" :tabindex="o.value === modelValue ? 0 : -1"
      :aria-label="iconOnlyNarrow ? o.label : undefined" :title="iconOnlyNarrow ? o.label : undefined" @click="emit('update:modelValue', o.value)" @keydown="onKey($event, i)"
    >
      <Icon v-if="o.icon" :name="o.icon" :size="iconOnlyNarrow ? 20 : 16" />
      <span class="seg-label" :class="{ 'hide-narrow': iconOnlyNarrow }">{{ o.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.seg { display: inline-flex; min-width: 0; border: 1px solid var(--opc-border); border-radius: var(--opc-r-control); overflow: hidden; }
.seg-opt { display: inline-flex; align-items: center; height: 26px; padding: 0 12px; border: 0; background: transparent; color: var(--opc-fg); font-weight: 500; white-space: nowrap; }
.seg-opt > * + * { margin-left: 6px; }
.seg-opt + .seg-opt { border-left: 1px solid var(--opc-border); }
.seg-opt:hover { background: var(--opc-hover); }
.seg-opt.on { background: var(--opc-primary-bg); color: var(--opc-accent-fg); }
.seg-opt:focus { position: relative; z-index: 1; }
@media (max-width: 1179px) { .hide-narrow { display: none; } }
</style>
