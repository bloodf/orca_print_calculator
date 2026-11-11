<script setup lang="ts">
import Icon from "./Icon.vue";

export type AlertAction = { label: string; run: () => void };
const props = withDefaults(defineProps<{ tone?: "info" | "warn" | "bad"; title?: string; actions?: AlertAction[] }>(), { tone: "info", title: undefined, actions: () => [] });
const icon = props.tone === "bad" ? "alert-circle" : props.tone === "warn" ? "alert-triangle" : "info";
</script>

<template>
  <div class="alert" :class="tone" :role="tone === 'bad' ? 'alert' : 'status'">
    <span class="alert-icon"><Icon :name="icon" /></span>
    <div class="alert-main">
      <p v-if="title" class="alert-title">{{ title }}</p>
      <div class="alert-body"><slot /></div>
      <div v-if="actions.length" class="alert-actions">
        <button v-for="a in actions" :key="a.label" type="button" class="btn ghost" @click="a.run()">{{ a.label }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.alert { display: grid; grid-template-columns: 16px minmax(0, 1fr); grid-column-gap: 8px; padding: 8px 12px; border-left: 3px solid var(--opc-muted); border-radius: var(--opc-r-control); background: var(--opc-raised); }
.alert.warn { border-left-color: var(--opc-warn); background: var(--opc-warn-bg); }
.alert.bad { border-left-color: var(--opc-bad); background: var(--opc-bad-bg); }
.alert-icon { display: inline-flex; padding-top: 2px; color: var(--opc-muted); }
.warn .alert-icon { color: var(--opc-warn); }
.bad .alert-icon { color: var(--opc-bad); }
.alert-title { font-weight: 500; }
.alert-actions { margin-top: 4px; margin-left: -10px; }
</style>
