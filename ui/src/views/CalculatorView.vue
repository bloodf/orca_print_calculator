<script setup lang="ts">
// Calculator shell: grid, breakpoints and scroll containers (docs/ux.md §3). Below 900px the price panel sits between the
// plates and the sections (so DOM order = visual order) with its details after the sections; at 900px and up it is the right column.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { store } from "../state/store";
import PriceBar from "../components/price/PriceBar.vue";
import QuotePreview from "../components/quotes/QuotePreview.vue";
import PlatesArea from "./PlatesArea.vue";
import PriceAside from "./PriceAside.vue";
import SectionsArea from "./SectionsArea.vue";
import { t } from "../i18n";

const narrow = ref(false);
const priceVisible = ref(true);
const loading = computed(() => store.status === "loading");
const reveal = ref(false); // skeleton -> content: only after a real load, never on a tab switch
watch(loading, (now, was) => { if (was && !now) reveal.value = true; });
let mq: MediaQueryList | null = null;
let io: IntersectionObserver | null = null;
const onMq = () => { narrow.value = !!mq?.matches; queueMicrotask(observe); };

function observe(): void {
  io?.disconnect();
  // Only the hero block counts, and only the part not covered by the sticky header or the PriceBar itself.
  const el = document.querySelector("#price [data-price-hero]") ?? document.getElementById("price");
  if (el && io) io.observe(el);
}
onMounted(() => {
  if (typeof window.matchMedia === "function") {
    mq = window.matchMedia("(max-width: 899px)");
    narrow.value = mq.matches;
    mq.addEventListener("change", onMq);
  }
  if (typeof IntersectionObserver === "function") {
    io = new IntersectionObserver((e) => { priceVisible.value = e.some((x) => x.isIntersecting); }, { rootMargin: "-44px 0px -56px 0px" });
    observe();
  }
});
watch([loading, narrow], () => void nextTick(observe));
onBeforeUnmount(() => { mq?.removeEventListener("change", onMq); io?.disconnect(); });
</script>

<template>
  <QuotePreview v-if="store.preview" />
  <main v-else class="calc" :class="{ n: narrow, 'bar-on': narrow && !priceVisible, 'reveal-children': reveal }" :aria-label="t('a11y.plates')">
    <div v-if="loading" class="left" aria-busy="true">
      <div v-for="i in 3" :key="i" class="skeleton sk-plate" />
    </div>
    <template v-else-if="narrow">
      <PlatesArea /><PriceAside part="summary" /><SectionsArea /><PriceAside part="details" />
    </template>
    <template v-else>
      <div class="left"><PlatesArea /><div class="gap" /><SectionsArea /></div>
      <PriceAside class="right" />
    </template>
    <aside v-if="loading" class="right" aria-labelledby="price-title">
      <div class="skeleton sk-block" /><div class="skeleton sk-block" /><div class="skeleton sk-price" /><p class="sm muted sk-status" role="status">{{ t("price.waiting") }}</p><p id="price-title" class="sr-only">{{ t("price.label") }}</p>
    </aside>
    <PriceBar v-if="narrow && !loading" :hidden="priceVisible" />
  </main>
</template>

<style scoped>
.calc { padding: 12px; display: grid; grid-template-columns: minmax(0, 1fr); grid-row-gap: 12px; }
.calc.bar-on { padding-bottom: 68px; }
.sk-plate { height: 88px; margin-bottom: 8px; }
.sk-block { height: 28px; margin-bottom: 8px; }
.sk-price { height: 40px; margin-bottom: 8px; }
.sk-status { margin-top: 8px; }
.gap { height: 12px; }
@media (min-width: 900px) {
  .calc { height: calc(100vh - var(--opc-header-h)); grid-template-columns: minmax(0, 1fr) 340px; grid-column-gap: 12px; grid-template-rows: minmax(0, 1fr); }
  .left, .right { min-height: 0; overflow-y: auto; }
  .right { display: flex; flex-direction: column; }
}
@media (min-width: 1100px) { .calc { padding: 16px; grid-template-columns: minmax(0, 1fr) 384px; grid-column-gap: 16px; } }
@media (min-width: 1440px) { .calc { grid-template-columns: minmax(0, 1fr) 440px; grid-column-gap: 24px; width: 100%; max-width: 1680px; margin: 0 auto; } }
</style>
