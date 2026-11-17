<script setup lang="ts">
// App shell: skip link, app bar, the view for the selected tab, host-error screen, price live region, toasts.
import Button from "primevue/button";
import { usePrimeVue } from "primevue/config";
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppHeader from "./components/AppHeader.vue";
import HelpGuide from "./components/HelpGuide.vue";
import { OuiEmpty, OuiIcon, OuiPanel, OuiToastHost } from "../shared/src/components";
import * as I from "../shared/src/icons";
import { currentLocale, t } from "./i18n";
import { primeLocale } from "./orcaUi";
import { priceAnnouncement } from "./state/announce";
import { useToastFocusReturn } from "./state/toastFocus";
import { currency, derived, init, loadState, locale, setView, store } from "./state/store";
import CalculatorView from "./views/CalculatorView.vue";
import QuotesView from "./views/QuotesView.vue";
import SettingsView from "./views/SettingsView.vue";
import StockView from "./views/StockView.vue";

const DevBar = import.meta.env.DEV ? defineAsyncComponent(() => import("./mock/DevBar.vue")) : null;

// PrimeVue's own strings (dialog close, empty table, ...) follow the plugin language, which Settings can change at runtime.
const pv = usePrimeVue();
const enLocale = { ...pv.config.locale } as NonNullable<typeof pv.config.locale>;
watch(currentLocale, (l) => { pv.config.locale = { ...enLocale, ...primeLocale(l) } as typeof enLocale; }, { immediate: true });

useToastFocusReturn();
const live = ref("");
const tech = ref(false); // the raw host code stays behind a disclosure
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
  <Button v-if="store.view === 'calc' && store.status !== 'error'" type="button" text size="small" class="skip-link app-chrome" @click="skipToPrice">{{ t("nav.skipToPrice") }}</Button>
  <AppHeader :view="store.view" @update:view="setView" />
  <div class="view" role="tabpanel" :aria-labelledby="`oui-tab-${store.view}`">
    <main v-if="store.status === 'error'" class="oui-page host-error">
      <OuiPanel>
        <OuiEmpty state="error" :title="t('host.errorTitle')">
          <span class="msg">{{ t("host.errorBody") }}</span>
          <template #actions><Button type="button" @click="loadState()"><OuiIcon :icon="I.refresh" :size="14" /><span>{{ t("host.tryAgain") }}</span></Button></template>
        </OuiEmpty>
        <template #footer>
          <div class="tech" data-tech-details>
            <Button text severity="secondary" size="small" type="button" :aria-expanded="tech" aria-controls="host-error-detail" @click="tech = !tech">
              <OuiIcon :icon="tech ? I.chevronDown : I.chevronRight" :size="14" /><span>{{ t("host.details") }}</span>
            </Button>
            <code v-show="tech" id="host-error-detail" class="oui-error-detail">{{ store.error }}</code>
          </div>
        </template>
      </OuiPanel>
    </main>
    <CalculatorView v-else-if="store.view === 'calc'" />
    <QuotesView v-else-if="store.view === 'quotes'" />
    <StockView v-else-if="store.view === 'stock'" />
    <SettingsView v-else />
  </div>
  <div class="oui-sr app-chrome" aria-live="polite" aria-atomic="true">{{ live }}</div>
  <HelpGuide />
  <component :is="DevBar" v-if="DevBar" />
  <!-- Settings keeps its save bar along the bottom edge (and the narrow calculator its price bar, app.css): the stack sits above it -->
  <OuiToastHost :close-label="t('common.close')" :label="t('common.notifications')" :style="store.view === 'settings' ? { '--oui-toast-bottom': '60px' } : undefined" />
</template>

<style scoped>
.host-error { max-width: 560px; margin: var(--oui-s8) auto 0; }
.tech { display: grid; gap: var(--oui-s2); min-width: 0; }
.tech code { user-select: text; -webkit-user-select: text; }
</style>
