<script setup lang="ts">
// Anchored overlay on PrimeVue's Popover (teleported to <body>, focus trapped, Esc and outside click dismiss, aria-modal).
// Driven by `open` + `anchor`; focus goes to the first field on open and back to the anchor on close.
import PvPopover from "primevue/popover";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{ open: boolean; anchor: HTMLElement | null; label: string }>();
const emit = defineEmits<{ close: [] }>();
const pop = ref<InstanceType<typeof PvPopover> | null>(null);
const body = ref<HTMLElement | null>(null);
let opener: HTMLElement | null = null;
let live = false;

function show(): void {
  const anchor = props.anchor;
  if (!anchor || !pop.value || live) return;
  opener = document.activeElement as HTMLElement | null;
  live = true;
  pop.value.show({ currentTarget: anchor } as unknown as Event, anchor);
}
function onShow(): void {
  void nextTick(() => body.value?.querySelector<HTMLElement>("input, select, textarea, button, [tabindex]")?.focus());
}
function onHide(): void {
  if (!live) return;
  live = false;
  (props.anchor ?? opener)?.focus?.();
  if (props.open) emit("close");
}
watch(() => [props.open, props.anchor] as const, ([o]) => {
  if (o) show();
  else if (live) pop.value?.hide();
});
// PrimeVue renders the overlay through a Portal that mounts a tick after this component; showing before that skips the enter hook.
onMounted(() => { void nextTick(() => { if (props.open) show(); }); });
onBeforeUnmount(() => { live = false; });
</script>

<template>
  <PvPopover ref="pop" class="opc-pop app-chrome" :aria-label="label" @show="onShow" @hide="onHide">
    <div ref="body"><slot /></div>
  </PvPopover>
</template>
