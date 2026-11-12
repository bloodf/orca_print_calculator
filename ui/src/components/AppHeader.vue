<script setup lang="ts">
// Header (docs/ux.md §5.3): mark, tabs, project name, printer chip, Spoolman status, currency chip, help. The tabs never shrink
// (the chips truncate instead); the language lives in Settings > Language and currency, not here.
import Button from "primevue/button";
import Tab from "primevue/tab";
import TabList from "primevue/tablist";
import Tabs from "primevue/tabs";
import { computed } from "vue";
import { t } from "../i18n";
import { openHelp } from "../state/help";
import { currency, currencySource, derived, store } from "../state/store";
import type { View } from "../state/types";
import Icon from "./base/Icon.vue";
import type { IconName } from "./base/icons";
import { gotoSettings } from "./costs/shared";
import PrinterChip from "./PrinterChip.vue";
import SpoolmanStatus from "./SpoolmanStatus.vue";

defineProps<{ view: View }>();
const emit = defineEmits<{ "update:view": [value: View] }>();
const tabs = (): { value: View; label: string; icon: IconName }[] => [
  { value: "calc", label: t("nav.calc"), icon: "calc" },
  { value: "quotes", label: t("nav.quotes"), icon: "list" },
  { value: "stock", label: t("nav.stock"), icon: "box" },
  { value: "settings", label: t("nav.settings"), icon: "sliders" },
];
const printer = computed(() => derived.value.printer);
const source = computed(() => t(currencySource.value === "spoolman" ? "header.currencyFromSpoolman" : "header.currencyFromSettings"));
</script>

<template>
  <header class="app-header app-chrome">
    <span class="mark" :title="t('app.name')"><Icon name="mark" :size="20" /></span>
    <Tabs :value="view" class="nav" @update:value="emit('update:view', $event as View)">
      <TabList :aria-label="t('app.name')">
        <Tab v-for="o in tabs()" :key="o.value" :value="o.value" :aria-label="o.label" :title="o.label" :aria-controls="undefined">
          <Icon :name="o.icon" />
          <span class="tab-label" :class="{ 'hide-narrow': o.value !== view }">{{ o.label }}</span>
        </Tab>
      </TabList>
    </Tabs>
    <template v-if="store.status === 'ready'">
    <span class="muted truncate proj" :title="store.host.projectName ?? undefined">{{ store.host.projectName ?? t("header.untitled") }}</span>
    <PrinterChip :model="store.host.printerModel" :watts="printer.watts" :source="printer.source" :estimated="printer.source === 'match' && printer.match.estimated" />
    <SpoolmanStatus :state="store.spoolman.state" :spools="store.spoolman.data.spools.length" :error="store.spoolman.error ?? undefined" />
    <Button severity="secondary" outlined size="small" type="button" class="cur num" :title="source" :aria-label="`${t('currency.label')}: ${currency}. ${source}`" @click="gotoSettings('settings-language')">{{ currency }}</Button>
    <Button text severity="secondary" type="button" class="help-btn icon-btn-sm" :title="t('help.open')" :aria-label="t('help.open')" aria-haspopup="dialog" data-testid="help-open" @click="openHelp()"><Icon name="help" /></Button>
    </template>
  </header>
</template>

<style scoped>
.app-header { position: sticky; top: 0; z-index: 20; min-height: var(--opc-header-h); display: grid; grid-template-columns: 20px max-content minmax(0, 1fr) minmax(0, max-content) minmax(0, max-content) auto auto; grid-column-gap: 12px; align-items: center; padding: 0 12px; background: var(--opc-raised); border-bottom: 1px solid var(--opc-border); }
.mark { color: var(--opc-accent-text); display: inline-flex; }
.nav { min-width: max-content; }
.nav :deep(.p-tablist-tab-list) { background: transparent; border: 0; }
.nav :deep(.p-tablist-content) { overflow: visible; }
.nav :deep(.p-tab) { padding: 12px 14px; gap: 8px; align-items: center; border: 0; }
.nav :deep(.p-tablist-active-bar) { bottom: 0; }
@media (max-width: 999px) { .hide-narrow { display: none; } }
@media (max-width: 599px) { .nav :deep(.p-tab) { padding: 12px 10px; } }
@media (min-width: 1100px) { .app-header { padding: 0 16px; } }
@media (max-width: 1279px) { .proj { visibility: hidden; } } /* the title is on the plate list; below 1280 the chips need the room */
@media (max-width: 899px) { .app-header { grid-column-gap: 8px; } }
/* phone width or 200% zoom: the logo mark gives its column to the Help button, which would otherwise be clipped */
@media (max-width: 599px) { .mark, .proj { display: none; } .app-header { grid-template-columns: max-content minmax(0, max-content) minmax(0, max-content) auto auto; justify-content: space-between; padding: 0 8px; } }
@media (max-width: 479px) {
  .app-header { grid-template-columns: auto auto 1fr auto; row-gap: 4px; padding-bottom: 4px; justify-items: start; }
  .nav { grid-column: 1 / -1; }
  .help-btn { justify-self: end; }
}
</style>
