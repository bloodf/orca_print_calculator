<script setup lang="ts">
// App shell: skip link, header, view switch, host-error screen, price live region, toasts (docs/ux.md §2, §3, §7.8).
import Button from "primevue/button";
import { usePrimeVue } from "primevue/config";
import Fieldset from "primevue/fieldset";
import Message from "primevue/message";
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppHeader from "./components/AppHeader.vue";
import HelpGuide from "./components/HelpGuide.vue";
import Icon from "./components/base/Icon.vue";
import ToastHost from "./components/base/ToastHost.vue";
import { t } from "./i18n";
import { primeLocale } from "./orcaUi";
import { priceAnnouncement } from "./state/announce";
import { currency, derived, init, loadState, locale, setView, store } from "./state/store";
import CalculatorView from "./views/CalculatorView.vue";
import QuotesView from "./views/QuotesView.vue";
import SettingsView from "./views/SettingsView.vue";
import StockView from "./views/StockView.vue";

const DevBar = import.meta.env.DEV ? defineAsyncComponent(() => import("./mock/DevBar.vue")) : null;

// PrimeVue's own strings (dialog close, empty table, ...) follow the plugin language, which Settings can change at runtime.
const pv = usePrimeVue();
const enLocale = { ...pv.config.locale } as NonNullable<typeof pv.config.locale>;
watch(locale, (l) => { pv.config.locale = l === "pt-BR" ? ({ ...enLocale, ...primeLocale("pt-BR") } as typeof enLocale) : enLocale; }, { immediate: true });

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
  <Button v-if="store.view === 'calc' && store.status !== 'error'" type="button" text size="small" class="skip-link app-chrome" @click="skipToPrice">{{ t("nav.skipToPrice") }}</Button>
  <AppHeader :view="store.view" @update:view="setView" />
  <main v-if="store.status === 'error'" class="host-error">
    <Message severity="error" :closable="false" role="alert">
      <template #icon><Icon name="alert-circle" :size="20" /></template>
      <div class="msg">
        <h1 class="view-title" tabindex="-1" data-view-title>{{ t("host.errorTitle") }}</h1>
        <p>{{ t("host.errorBody") }}</p>
        <div class="row"><Button type="button" @click="loadState()">{{ t("host.tryAgain") }}</Button></div>
      </div>
    </Message>
    <Fieldset :legend="t('host.details')" toggleable collapsed class="tech sm" data-tech-details>
      <code class="details">{{ store.error }}</code>
    </Fieldset>
  </main>
  <CalculatorView v-else-if="store.view === 'calc'" />
  <QuotesView v-else-if="store.view === 'quotes'" />
  <StockView v-else-if="store.view === 'stock'" />
  <SettingsView v-else />
  <div class="sr-only app-chrome" aria-live="polite" aria-atomic="true">{{ live }}</div>
  <HelpGuide />
  <ToastHost />
  <component :is="DevBar" v-if="DevBar" />
</template>

<style scoped>
.host-error { max-width: 520px; margin: 64px auto 0; padding: 0 16px; }
.host-error .msg > * + * { margin-top: 8px; }
.host-error .msg h1 { margin: 0; }
.tech { margin-top: 12px; }
.tech code { display: block; overflow-wrap: anywhere; white-space: pre-wrap; user-select: text; }
</style>
