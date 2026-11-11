<script setup lang="ts">
// App shell: skip link, header, view switch, host-error screen, price live region, toasts (docs/ux.md §2, §3, §7.8).
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppHeader from "./components/AppHeader.vue";
import Icon from "./components/base/Icon.vue";
import ToastHost from "./components/base/ToastHost.vue";
import { t } from "./i18n";
import { priceAnnouncement } from "./state/announce";
import { currency, derived, init, loadState, locale, setView, store } from "./state/store";
import CalculatorView from "./views/CalculatorView.vue";
import QuotesView from "./views/QuotesView.vue";
import SettingsView from "./views/SettingsView.vue";

const DevBar = import.meta.env.DEV ? defineAsyncComponent(() => import("./mock/DevBar.vue")) : null;

const live = ref("");
const announcement = computed(() => priceAnnouncement(derived.value, { currency: currency.value, locale: locale.value, hasPlates: store.plates.length > 0 || !!store.draft.frozenPlates }));
let settle: ReturnType<typeof setTimeout> | undefined;
// Announce once per settle (1 s after the last change), and only when the text actually changed.
watch(announcement, (text) => {
  clearTimeout(settle);
  settle = setTimeout(() => { if (text !== live.value) live.value = text; }, 1000);
});

watch(() => store.view, async () => {
  await nextTick();
  (document.querySelector<HTMLElement>("[data-view-title]") ?? document.querySelector<HTMLElement>("main"))?.focus();
});

function skipToPrice(): void {
  const el = document.getElementById("price");
  el?.scrollIntoView({ block: "start" });
  el?.focus();
}

let stop: (() => void) | null = null;
onMounted(() => { stop = init(); });
onBeforeUnmount(() => { stop?.(); clearTimeout(settle); });
</script>

<template>
  <button v-if="store.view === 'calc' && store.status !== 'error'" type="button" class="skip-link app-chrome" @click="skipToPrice">{{ t("nav.skipToPrice") }}</button>
  <AppHeader :view="store.view" @update:view="setView" />
  <main v-if="store.status === 'error'" class="host-error" role="alert">
    <span class="bad-icon"><Icon name="alert-circle" :size="20" /></span>
    <h1 class="view-title" tabindex="-1" data-view-title>{{ t("host.errorTitle") }}</h1>
    <p class="muted">{{ t("host.errorBody") }}</p>
    <div class="row">
      <button type="button" class="btn primary" @click="loadState()">{{ t("host.tryAgain") }}</button>
      <span class="sm muted"><span>{{ t("host.details") }}:</span> <span class="details">{{ store.error }}</span></span>
    </div>
  </main>
  <CalculatorView v-else-if="store.view === 'calc'" />
  <QuotesView v-else-if="store.view === 'quotes'" />
  <SettingsView v-else />
  <div class="sr-only app-chrome" aria-live="polite" aria-atomic="true">{{ live }}</div>
  <ToastHost />
  <component :is="DevBar" v-if="DevBar" />
</template>

<style scoped>
.host-error { max-width: 480px; margin: 64px auto 0; padding: 0 16px; text-align: center; }
.host-error > * + * { margin-top: 12px; }
.host-error .row { justify-content: center; }
.bad-icon { color: var(--opc-bad); display: inline-flex; }
.details { user-select: text; }
</style>
