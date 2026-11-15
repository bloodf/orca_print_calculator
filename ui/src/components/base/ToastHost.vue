<script setup lang="ts">
// foundation-gap: no shared toast. 4.0.2 should add OuiToast (tone, text, one action, close, pause on hover/focus); this card composes
// OuiIcon and the --oui-* tone tokens only.
import Button from "primevue/button";
import { nextTick, watch } from "vue";
import { t } from "../../i18n";
import { dismiss, pause, resume, toasts } from "../../state/toast";
import { OuiIcon } from "../../../shared/src/components";
import * as I from "../../../shared/src/icons";

const TONE = { bad: "danger", ok: "success", info: "info" } as const;
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
    <div v-for="x in toasts.list" :key="x.id" :data-toast-id="x.id" class="toast" :class="x.tone" :data-tone="TONE[x.tone]" :role="x.tone === 'bad' ? 'alert' : 'status'" :aria-live="x.tone === 'bad' ? 'assertive' : 'polite'"
         @focusin="focusIn(x.id, $event)" @focusout="resumeOutside(x.id, $event)" @mouseenter="pause(x.id)" @mouseleave="resumeOutside(x.id, $event)">
      <OuiIcon :icon="x.tone === 'bad' ? I.error : x.tone === 'ok' ? I.check : I.info" :size="14" tile :tone="TONE[x.tone]" />
      <span class="toast-text">{{ x.text }}</span>
      <Button v-if="x.action" type="button" text size="small" @click="x.action.run(); dismiss(x.id)">{{ x.action.label }}</Button>
      <Button type="button" text severity="secondary" size="small" class="icon-btn-sm toast-close" :aria-label="t('common.close')" @click="dismiss(x.id)"><OuiIcon :icon="I.x" :size="14" /></Button>
    </div>
  </div>
</template>

<style scoped>
.toast-host { position: fixed; right: 16px; bottom: 16px; z-index: 100; width: 360px; max-width: calc(100vw - 32px); display: grid; grid-row-gap: 8px; pointer-events: none; }
/* narrow layout: the sticky price bar owns the bottom edge */
@media (max-width: 899px) { .toast-host { bottom: 80px; } }
/* a toast is a small raised card on the page's surface, tinted by its tone like a banner */
.toast { pointer-events: auto; display: flex; align-items: center; gap: var(--oui-s2); min-height: 44px; padding: 6px 6px 6px 8px; border-radius: var(--oui-radius-lg);
  background: var(--oui-surface); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--oui-tone) 45%, transparent), var(--oui-shadow-overlay); }
.toast-text { flex: 1 1 auto; min-width: 0; color: var(--oui-text); }
.toast-close { flex: none; color: var(--oui-muted); }
</style>
