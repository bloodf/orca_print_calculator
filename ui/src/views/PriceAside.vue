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
.price-aside > :deep(.oui-panel > .oui-panel-body) { min-height: 0; overflow-y: auto; padding-bottom: 0; }
/* The body scrolls inside the panel when the window is short, and overlay scrollbars do not show that. Its last lines fade out
   while there is more below: a strip that sticks to the bottom edge of the body and, at the end of the list, comes to rest over
   the body's own bottom space, where it hides nothing. */
.price-aside > :deep(.oui-panel > .oui-panel-body)::after { content: ""; display: block; position: sticky; bottom: 0; height: 24px; pointer-events: none;
  background: linear-gradient(to bottom, transparent, var(--oui-surface)); }
@media (forced-colors: active) { .price-aside > :deep(.oui-panel > .oui-panel-body)::after { display: none; } }
</style>
