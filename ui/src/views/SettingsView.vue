<script setup lang="ts">
// Settings view: one group at a time behind PrimeVue tabs, "Saved" status, no Save button.
import Button from "primevue/button";
import Tab from "primevue/tab";
import TabList from "primevue/tablist";
import Tabs from "primevue/tabs";
import { computed } from "vue";
import { t } from "../i18n";
import { SETTINGS_TABS, settingsTab, type SettingsTab } from "../state/settingsTab";
import { flushSettings, store } from "../state/store";
import AboutSettings from "../components/settings/AboutSettings.vue";
import ChannelEditor from "../components/settings/ChannelEditor.vue";
import CostDefaults from "../components/settings/CostDefaults.vue";
import LanguageCurrency from "../components/settings/LanguageCurrency.vue";
import PricingDefaults from "../components/settings/PricingDefaults.vue";
import PrinterProfiles from "../components/settings/PrinterProfiles.vue";
import SheetSettings from "../components/settings/SheetSettings.vue";
import SpoolmanSettings from "../components/settings/SpoolmanSettings.vue";

const COMPS = {
  spoolman: SpoolmanSettings, costs: CostDefaults, pricing: PricingDefaults, channels: ChannelEditor,
  printers: PrinterProfiles, sheet: SheetSettings, language: LanguageCurrency, about: AboutSettings,
} as const;
const HELP: Partial<Record<SettingsTab, string>> = { costs: "settings.costsHelp" };
const help = computed(() => HELP[settingsTab.value]);

const select = (id: SettingsTab): void => { settingsTab.value = id; };
</script>

<template>
  <main class="settings" :aria-label="t('settings.title')">
    <div class="head row">
      <h1 class="view-title" tabindex="-1" data-view-title>{{ t("settings.title") }}</h1>
      <span class="sm status" :class="{ bad: store.saveStatus === 'error' }" role="status">
        <template v-if="store.saveStatus === 'saved'">{{ t("settings.saved") }}</template>
        <template v-else-if="store.saveStatus === 'error'">{{ t("settings.saveFailed") }} <Button text size="small" type="button" @click="flushSettings()">{{ t("settings.retry") }}</Button></template>
      </span>
    </div>
    <Tabs :value="settingsTab" select-on-focus class="rail app-chrome" @update:value="select($event as SettingsTab)">
      <TabList :aria-label="t('settings.nav')">
        <Tab v-for="id in SETTINGS_TABS" :id="`settings-tab-${id}`" :key="id" :value="id" :aria-controls="id === settingsTab ? `settings-${id}` : undefined">{{ t(`settings.group.${id}`) }}</Tab>
      </TabList>
    </Tabs>
    <section :id="`settings-${settingsTab}`" :key="settingsTab" class="grp" :class="{ wide: settingsTab === 'sheet' }" role="tabpanel" :aria-labelledby="`settings-tab-${settingsTab}`" tabindex="0">
      <h2 class="lg">{{ t(`settings.group.${settingsTab}`) }}</h2>
      <p v-if="help" class="sm muted help">{{ t(help) }}</p>
      <component :is="COMPS[settingsTab]" />
    </section>
  </main>
</template>

<style scoped>
.settings { padding: 12px; }
.head { min-height: 32px; margin-bottom: 12px; }
.head > * + * { margin-left: 12px; }
.status { color: var(--opc-muted); min-height: 20px; }
.status.bad { color: var(--opc-bad); }
.rail { margin-bottom: 8px; }
/* eight groups: wrap them instead of hiding some behind scroll arrows at narrow widths or zoom; the current one is marked by fill */
.rail :deep(.p-tablist-content) { overflow: visible; }
.rail :deep(.p-tablist-tab-list) { flex-wrap: wrap; border: 0; background: transparent; gap: 4px; }
.rail :deep(.p-tablist-active-bar) { display: none; }
.rail :deep(.p-tab) { padding: 8px 14px; white-space: nowrap; border: 0; border-radius: var(--opc-r-control); }
.rail :deep(.p-tab-active) { background: var(--opc-selected); }
.grp { max-width: 760px; min-width: 0; padding: 16px 0 24px; scroll-margin-top: calc(var(--opc-header-h) + 12px); }
.grp.wide { max-width: none; } /* the quote editor puts its live sample beside the form */
.grp > h2 { margin-bottom: 4px; }
.grp > .help { margin-bottom: 8px; }
.grp > h2 + :not(.help) { margin-top: 12px; }
@media (min-width: 900px) { .settings { padding: 16px; } }
</style>
