<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import { nextTick, watch } from "vue";
import { t } from "../../i18n";
import { dismiss, pause, resume, toasts } from "../../state/toast";
import Icon from "./Icon.vue";

const severity = { bad: "error", ok: "success", info: "info" } as const;
const returnFocus = new Map<number, HTMLElement>();
function focusIn(id: number, e: FocusEvent): void {
  pause(id);
  if (e.relatedTarget instanceof HTMLElement && !(e.currentTarget as HTMLElement).contains(e.relatedTarget)) returnFocus.set(id, e.relatedTarget);
}
function resumeOutside(id: number, e: Event): void {
  const host = e.currentTarget as HTMLElement;
  queueMicrotask(() => { if (!host.matches(":hover") && !host.contains(document.activeElement)) resume(id); });
}
watch(() => toasts.list.map((x) => x.id), (ids) => {
  const focused = document.activeElement?.closest<HTMLElement>("[data-toast-id]");
  const id = Number(focused?.dataset.toastId);
  if (focused && !ids.includes(id)) {
    const target = returnFocus.get(id);
    void nextTick(() => {
      if (document.activeElement === document.body || focused.contains(document.activeElement)) {
        (target?.isConnected ? target : document.querySelector<HTMLElement>("main"))?.focus();
      }
    });
  }
  for (const key of returnFocus.keys()) if (!ids.includes(key)) returnFocus.delete(key);
});
</script>

<template>
  <div class="toast-host app-chrome">
    <Message v-for="x in toasts.list" :key="x.id" :data-toast-id="x.id" class="toast" :class="x.tone" :severity="severity[x.tone]" :role="x.tone === 'bad' ? 'alert' : 'status'" :aria-live="x.tone === 'bad' ? 'assertive' : 'polite'" closable :close-button-props="{ 'aria-label': t('common.close') }" @close="dismiss(x.id)"
             @focusin="focusIn(x.id, $event)" @focusout="resumeOutside(x.id, $event)" @mouseenter="pause(x.id)" @mouseleave="resumeOutside(x.id, $event)">
      <template #icon><Icon :name="x.tone === 'bad' ? 'alert-circle' : x.tone === 'ok' ? 'check' : 'info'" /></template>
      <span class="toast-text">{{ x.text }}</span>
      <Button v-if="x.action" type="button" text size="small" @click="x.action.run(); dismiss(x.id)">{{ x.action.label }}</Button>
    </Message>
  </div>
</template>

<style scoped>
.toast-host { position: fixed; right: 16px; bottom: 16px; z-index: 100; width: 360px; max-width: calc(100vw - 32px); display: grid; grid-row-gap: 8px; pointer-events: none; }
/* narrow layout: the sticky price bar owns the bottom edge */
@media (max-width: 899px) { .toast-host { bottom: 80px; } }
.toast-host :deep(.p-message) { pointer-events: auto; box-shadow: var(--opc-shadow); }
.toast-host :deep(.p-message-text) { display: flex; align-items: center; flex-wrap: wrap; min-width: 0; }
.toast-text { flex: 1 1 auto; min-width: 0; color: var(--opc-fg); }
</style>
