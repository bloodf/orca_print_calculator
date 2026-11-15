<script setup lang="ts">
// The price column landmark. `id="price"` is the skip-link and PriceBar target.
import PricePanel from "../components/price/PricePanel.vue";
</script>

<template>
  <aside id="price" class="price-aside" tabindex="-1" aria-labelledby="price-title"><PricePanel /></aside>
</template>

<style scoped>
.price-aside { min-width: 0; }
.price-aside:focus { outline: none; }
.price-aside > :deep(.oui-panel) { min-height: 0; flex: 0 1 auto; }
.price-aside > :deep(.oui-panel > .oui-panel-body) { min-height: 0; overflow-y: auto; }
</style>
