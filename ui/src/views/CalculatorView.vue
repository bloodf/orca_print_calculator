<script setup lang="ts">
// The calculator page: what the page needs said (once) under the app bar, then Plates and Costs beside the Price panel. Three
// columns on a wide tab, two from about 900 px, one below; when the price is off screen in one column, a bar at the bottom carries it.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { store } from "../state/store";
import PriceBar from "../components/price/PriceBar.vue";
import QuotePreview from "../components/quotes/QuotePreview.vue";
import FirstRunChecklist from "../components/FirstRunChecklist.vue";
import PlateList from "../components/plates/PlateList.vue";
import PlateNotices from "../components/plates/PlateNotices.vue";
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
    mq = window.matchMedia("(max-width: 931px)"); // the page container is 900 px wide here: one column below it
    narrow.value = mq.matches;
    mq.addEventListener("change", onMq);
  }
  if (typeof IntersectionObserver === "function") {
    io = new IntersectionObserver((e) => { priceVisible.value = e.some((x) => x.isIntersecting); }, { rootMargin: "-52px 0px -56px 0px" });
    observe();
  }
});
watch([loading, narrow], () => void nextTick(observe));
onBeforeUnmount(() => { mq?.removeEventListener("change", onMq); io?.disconnect(); });
</script>

<template>
  <QuotePreview v-if="store.preview" />
  <main v-else class="oui-page calc" tabindex="-1" :class="{ n: narrow, 'bar-on': narrow && !priceVisible, 'reveal-children': reveal }" :aria-label="t('a11y.plates')">
    <div v-if="loading" class="calc-grid">
      <div class="calc-left" aria-busy="true"><div v-for="i in 2" :key="i" class="skeleton sk-plate" /></div>
      <aside class="right skeleton sk-price" aria-labelledby="price-title">
        <p class="oui-meta sk-status" role="status">{{ t("price.waiting") }}</p><p id="price-title" class="oui-sr">{{ t("price.label") }}</p>
      </aside>
    </div>
    <template v-else>
      <PlateNotices />
      <FirstRunChecklist v-if="!store.settings.onboarded && !store.unreadable.length" />
      <div class="calc-grid">
        <div class="calc-left"><PlateList /><SectionsArea /></div>
        <PriceAside class="right" />
      </div>
      <PriceBar v-if="narrow" :hidden="priceVisible" />
    </template>
  </main>
</template>

<style scoped>
.calc:focus { outline: none; }
.calc.bar-on { padding-bottom: 76px; }
.calc-grid, .calc-left { display: grid; gap: var(--oui-s3); grid-template-columns: minmax(0, 1fr); align-items: start; min-width: 0; }
.sk-plate { height: 180px; }
.sk-price { min-height: 240px; display: grid; place-items: center; }
@container oui-page (min-width: 900px) {
  .calc-grid { grid-template-columns: minmax(0, 1fr) minmax(380px, 440px); }
  /* the price stays in view while the plates and costs scroll; when it is taller than the window its own body scrolls, so the
     hero and the actions are never cut off */
  .right { position: sticky; top: 64px; max-height: calc(100vh - 76px); display: flex; flex-direction: column; }
}
@container oui-page (min-width: 1500px) {
  .calc-grid { grid-template-columns: minmax(0, 1fr) 460px; }
  .calc-left { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
