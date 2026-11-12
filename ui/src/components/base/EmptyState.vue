<script setup lang="ts">
import plate from "../../assets/empty-plate.svg?raw";
import quote from "../../assets/empty-quote.svg?raw";
import spool from "../../assets/empty-spool.svg?raw";

import Art from "./Art.vue";

const ART = { plate, quote, spool };
defineProps<{ art: "plate" | "spool" | "quote"; title: string; body?: string }>();
</script>

<template>
  <div class="empty">
    <div class="empty-art"><Art :svg="ART[art]" /></div>
    <p class="lg">{{ title }}</p>
    <p v-if="body" class="sm muted">{{ body }}</p>
    <div class="empty-actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
.empty { max-width: 360px; margin: 0 auto; padding: 24px 0; text-align: center; }
.empty-art { color: var(--opc-muted); display: flex; justify-content: center; }
.empty-art :deep(svg) { width: 240px; height: 160px; }
.empty p { margin-top: 8px; }
.empty-actions { margin-top: 12px; }
</style>
