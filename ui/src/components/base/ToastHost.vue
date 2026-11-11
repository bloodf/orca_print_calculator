<script setup lang="ts">
import { t } from "../../i18n";
import { dismiss, toasts } from "../../state/toast";
import Icon from "./Icon.vue";
</script>

<template>
  <div class="toast-host app-chrome">
    <div v-for="x in toasts.list" :key="x.id" class="toast" :class="x.tone" :role="x.tone === 'bad' ? 'alert' : 'status'">
      <Icon v-if="x.tone === 'bad'" name="alert-circle" />
      <span class="toast-text">{{ x.text }}</span>
      <button v-if="x.action" type="button" class="btn ghost" @click="x.action.run(); dismiss(x.id)">{{ x.action.label }}</button>
      <button type="button" class="btn icon" :aria-label="t('common.close')" @click="dismiss(x.id)"><Icon name="x" /></button>
    </div>
  </div>
</template>

<style scoped>
.toast-host { position: fixed; right: 16px; bottom: 16px; z-index: 100; width: 360px; max-width: calc(100vw - 32px); display: grid; grid-row-gap: 8px; pointer-events: none; }
.toast { animation: opc-toast-in var(--opc-dur) var(--opc-ease-out); pointer-events: auto; display: flex; align-items: center; padding: 8px 8px 8px 12px; background: var(--opc-raised); border: 1px solid var(--opc-border); border-radius: var(--opc-r-surface); box-shadow: var(--opc-shadow); }
.toast > * + * { margin-left: 8px; }
.toast.bad { background: var(--opc-bad-bg); color: var(--opc-bad); }
.toast-text { flex: 1 1 auto; min-width: 0; color: var(--opc-fg); }
.toast.bad .toast-text { color: var(--opc-fg); }
</style>
