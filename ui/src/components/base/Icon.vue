<script setup lang="ts">
import { ICONS, type IconName } from "./icons";
withDefaults(defineProps<{ name: IconName; size?: 16 | 20 }>(), { size: 16 });
</script>

<template>
  <svg
    :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"
    style="flex: none"
  >
    <template v-for="(part, i) in ICONS[name]" :key="i">
      <path v-if="part.t === 'p'" :d="part.d" />
      <circle v-else-if="part.t === 'c'" :cx="part.cx" :cy="part.cy" :r="part.r" :fill="part.solid ? 'currentColor' : 'none'" :stroke="part.solid ? 'none' : 'currentColor'" />
      <rect v-else :x="part.x" :y="part.y" :width="part.w" :height="part.h" :rx="part.rx" />
    </template>
  </svg>
</template>
