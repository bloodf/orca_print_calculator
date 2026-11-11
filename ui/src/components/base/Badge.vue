<script setup lang="ts">
export type BadgeTone = "neutral" | "ok" | "warn" | "bad" | "info";
withDefaults(defineProps<{ tone?: BadgeTone; text: string }>(), { tone: "neutral" });
</script>

<template><span class="badge xs" :class="tone">{{ text }}</span></template>

<style scoped>
.badge { display: inline-flex; align-items: center; height: 18px; padding: 0 8px; border-radius: var(--opc-r-pill); font-weight: 500; white-space: nowrap; border: 1px solid transparent; }
.neutral, .info { border-color: var(--opc-border); color: var(--opc-muted); }
.warn { background: var(--opc-warn-bg); color: var(--opc-warn); }
.bad { background: var(--opc-bad-bg); color: var(--opc-bad); }
.ok { background: var(--opc-selected); color: var(--opc-accent-text); }
</style>
