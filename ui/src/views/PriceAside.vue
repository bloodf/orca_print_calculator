<script setup lang="ts">
// The price column landmark. `id="price"` is the skip-link and PriceBar target.
import PricePanel from "../components/price/PricePanel.vue";
// part: at N the summary is the landmark (the PriceBar watches it) and the details follow the sections.
defineProps<{ part?: "all" | "summary" | "details" }>();
</script>

<template>
  <aside v-if="part !== 'details'" id="price" class="price-aside" tabindex="-1" aria-labelledby="price-title"><PricePanel :part="part ?? 'all'" /></aside>
  <PricePanel v-else part="details" />
</template>

<style scoped>
.price-aside { min-width: 0; }
.price-aside:focus { box-shadow: none; }
</style>
