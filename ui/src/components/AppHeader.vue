<script setup lang="ts">
// Header (docs/ux.md §5.3): mark, tabs, project name, printer chip, Spoolman status, currency chip, language select.
import { computed } from "vue";
import { t } from "../i18n";
import { currency, currencySource, derived, setLanguage, store } from "../state/store";
import type { Lang, View } from "../state/types";
import Icon from "./base/Icon.vue";
import Segmented, { type SegOption } from "./base/Segmented.vue";
import { gotoSettings } from "./costs/shared";
import PrinterChip from "./PrinterChip.vue";
import SpoolmanStatus from "./SpoolmanStatus.vue";

defineProps<{ view: View }>();
defineEmits<{ "update:view": [value: View] }>();
const tabs = (): SegOption<View>[] => [
  { value: "calc", label: t("nav.calc"), icon: "calc" },
  { value: "quotes", label: t("nav.quotes"), icon: "list" },
  { value: "settings", label: t("nav.settings"), icon: "sliders" },
];
const langs = computed<{ value: Lang; label: string }[]>(() => [
  { value: "auto", label: t("lang.auto") }, { value: "en", label: t("lang.en") }, { value: "pt-BR", label: t("lang.pt") },
]);
const printer = computed(() => derived.value.printer);
const source = computed(() => t(currencySource.value === "spoolman" ? "header.currencyFromSpoolman" : "header.currencyFromSettings"));
</script>

<template>
  <header class="app-header app-chrome">
    <span class="mark" :title="t('app.name')"><Icon name="mark" :size="20" /></span>
    <Segmented :options="tabs()" :model-value="view" :label="t('app.name')" icon-only-narrow manual @update:model-value="$emit('update:view', $event)" />
    <template v-if="store.status === 'ready'">
    <span class="muted truncate proj" :title="store.host.projectName ?? undefined">{{ store.host.projectName ?? t("header.untitled") }}</span>
    <PrinterChip :model="store.host.printerModel" :watts="printer.watts" :source="printer.source" :estimated="printer.source === 'match' && printer.match.estimated" />
    <SpoolmanStatus :state="store.spoolman.state" :spools="store.spoolman.data.spools.length" :error="store.spoolman.error ?? undefined" />
    <button type="button" class="btn cur num" :title="source" :aria-label="`${t('currency.label')}: ${currency}. ${source}`" @click="gotoSettings('settings-language')">{{ currency }}</button>
    <select class="lang" :aria-label="t('header.language')" :value="store.settings.language" @change="setLanguage(($event.target as HTMLSelectElement).value as Lang)">
      <option v-for="l in langs" :key="l.value" :value="l.value">{{ l.label }}</option>
    </select>
    </template>
  </header>
</template>

<style scoped>
.app-header { position: sticky; top: 0; z-index: 20; height: var(--opc-header-h); display: grid; grid-template-columns: 20px auto minmax(0, 1fr) auto auto auto auto; grid-column-gap: 12px; align-items: center; padding: 0 12px; background: var(--opc-bg); border-bottom: 1px solid var(--opc-border); }
.mark { color: var(--opc-accent-text); display: inline-flex; }
.lang { height: 28px; max-width: 150px; }
@media (min-width: 1100px) { .app-header { padding: 0 16px; } }
@media (max-width: 1279px) { .proj { visibility: hidden; } } /* the title is on the plate list; below 1280 the chips need the room */
@media (max-width: 899px) { .lang { max-width: 96px; } .app-header { grid-column-gap: 8px; } }
</style>
