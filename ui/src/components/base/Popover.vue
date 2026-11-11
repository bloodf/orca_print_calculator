<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps<{ open: boolean; anchor: HTMLElement | null; label: string }>();
const emit = defineEmits<{ close: [] }>();
const el = ref<HTMLElement | null>(null);
const pos = ref({ top: 0, left: 0 });
let opener: HTMLElement | null = null;
// Stays mounted for the 120 ms exit fade (.pop.leaving in the stylesheet); the CSS enter animation plays on mount.
const LEAVE_MS = 120;
const shown = ref(props.open);
let leave: ReturnType<typeof setTimeout> | undefined;
watch(() => props.open, (o) => {
  clearTimeout(leave);
  if (o) shown.value = true;
  else leave = setTimeout(() => { shown.value = false; }, LEAVE_MS);
});

function place(): void {
  const a = props.anchor?.getBoundingClientRect();
  if (!a) return;
  const w = el.value?.offsetWidth ?? 280;
  pos.value = { top: a.bottom + 4, left: Math.max(8, Math.min(a.left, window.innerWidth - w - 8)) };
}
function onDoc(e: Event): void {
  const n = e.target as Node;
  if (el.value && !el.value.contains(n) && !props.anchor?.contains(n)) emit("close");
}
function onKey(ev: Event): void {
  const e = ev as KeyboardEvent;
  if (e.key === "Escape") { e.stopPropagation(); emit("close"); }
}
function listen(on: boolean): void {
  const f = on ? document.addEventListener : document.removeEventListener;
  const w = on ? window.addEventListener : window.removeEventListener;
  f.call(document, "mousedown", onDoc);
  f.call(document, "keydown", onKey, true);
  w.call(window, "resize", place);
  w.call(window, "scroll", place, true);
}

watch(() => props.open, async (o, prev) => {
  listen(o);
  if (o) {
    opener = document.activeElement as HTMLElement | null;
    await nextTick();
    place();
    el.value?.querySelector<HTMLElement>("input, select, textarea, button, [tabindex]")?.focus();
  } else if (prev) (props.anchor ?? opener)?.focus?.();
}, { immediate: true });
onBeforeUnmount(() => { listen(false); clearTimeout(leave); });
</script>

<template>
  <div v-if="shown" ref="el" class="pop app-chrome" :class="{ leaving: !open }" role="dialog" :aria-label="label" :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"><slot /></div>
</template>

<style scoped>
.pop { animation: opc-pop-in var(--opc-dur-fast) var(--opc-ease-out); transform-origin: top left; transition: opacity var(--opc-dur-fast) var(--opc-ease); position: fixed; z-index: 60; min-width: 240px; max-width: min(360px, calc(100vw - 16px)); max-height: 320px; overflow-y: auto; padding: 12px; background: var(--opc-bg); border: 1px solid var(--opc-border); border-radius: var(--opc-r-surface); box-shadow: var(--opc-shadow); }
.pop.leaving { opacity: 0; pointer-events: none; }
</style>
