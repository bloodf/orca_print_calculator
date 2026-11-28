<script setup lang="ts">
// The app bar: mark and name, the project with its printer and the Spoolman state, the four task tabs, then the page actions
// (import, refresh, help). The state text gives way first; the tabs drop to their own line when the bar is narrow.
import Button from "primevue/button";
import { computed } from "vue";
import { OuiAppBar, OuiIcon } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";
import mark from "../icon.svg?raw";
import { t } from "../i18n";
import { openHelp } from "../state/help";
import { derived, store } from "../state/store";
import type { View } from "../state/types";
import Art from "./base/Art.vue";
import ImportButton from "./plates/ImportButton.vue";
import { refresh, refreshing } from "./plates/refresh";
import PrinterChip from "./PrinterChip.vue";
import SpoolmanStatus from "./SpoolmanStatus.vue";

const props = defineProps<{ view: View }>();
const emit = defineEmits<{ "update:view": [value: View] }>();
const tabs = computed(() => [
  { value: "calc", label: t("nav.calc"), icon: I.calculator },
  { value: "quotes", label: t("nav.quotes"), icon: I.receipt, ...(store.quotes.length ? { count: store.quotes.length } : {}) },
  { value: "stock", label: t("nav.stock"), icon: I.boxes },
  { value: "settings", label: t("nav.settings"), icon: I.settings },
]);
const printer = computed(() => derived.value.printer);
const ready = computed(() => store.status === "ready");
// Reading the slice again belongs to the calculator, and an open saved quote keeps its own plates.
const canReload = computed(() => ready.value && props.view === "calc" && !store.draft.frozenPlates && !store.preview);
</script>

<template>
  <OuiAppBar class="app-header app-chrome" :name="t('app.short')" :tabs="tabs" :tabs-label="t('app.name')" :model-value="view" @update:model-value="emit('update:view', $event as View)">
    <template #mark><Art :svg="mark" /></template>
    <template v-if="ready" #status>
      <strong class="proj oui-truncate" :title="store.host.projectName ?? undefined">{{ store.host.projectName ?? t("header.untitled") }}</strong>
      <PrinterChip :model="store.host.printerModel" :watts="printer.watts" :source="printer.source" :estimated="printer.source === 'match' && printer.match.estimated" />
    </template>
    <template #actions>
      <template v-if="ready">
        <SpoolmanStatus :state="store.spoolman.state" :spools="store.spoolman.data.spools.length" :error="store.spoolman.error ?? undefined" />
        <template v-if="canReload">
          <ImportButton bar />
          <Button severity="secondary" size="small" type="button" class="ah-act" :aria-busy="refreshing ? 'true' : undefined" :aria-label="t('plates.refresh')" :title="t('plates.refresh')" data-testid="refresh" @click="refresh">
            <OuiIcon :icon="I.refresh" :size="14" /><span class="ah-label">{{ t("plates.refresh") }}</span>
          </Button>
        </template>
        <Button text severity="secondary" size="small" type="button" class="help-btn icon-btn-sm" :title="t('help.open')" :aria-label="t('help.open')" aria-haspopup="dialog" data-testid="help-open" @click="openHelp()"><OuiIcon :icon="I.info" /></Button>
      </template>
    </template>
  </OuiAppBar>
</template>

<style>
/* Layout of this bar's own parts; the band, the tabs and the buttons on it come from the shared app bar, which also moves the
   tabs to a line of their own when the bar cannot hold them beside the rest (a tab name is never cut). */
.app-header .proj { flex: 0 2 auto; min-width: 4em; font-weight: 650; }
.app-header .oui-appbar-status > :not(.proj) { min-width: 0; }
.app-header .ah-act { gap: 6px; }
/* What gives way as the bar narrows, each step at a narrower width than the one before, so the bar never asks for more room as
   it shrinks: the Spoolman count shortens to the one word "Spoolman", then to its dot; then the action labels (their names stay
   as title and accessible name). German, Spanish and Polish tab names are longer: their action labels give way sooner. */
.app-header .sm-short { display: none; }
@container oui-appbar (max-width: 1499px) { .app-header .sm-text { display: none; } .app-header .sm-short { display: inline; } }
@container oui-appbar (max-width: 1439px) { .app-header .sm-short { display: none; } .app-header .sp-chip .oui-status { gap: 0; padding-inline: 7px; } }
@container oui-appbar (max-width: 1379px) { :lang(de) .app-header .ah-label, :lang(es) .app-header .ah-label, :lang(pl) .app-header .ah-label { display: none; } :lang(de) .app-header .ah-act, :lang(es) .app-header .ah-act, :lang(pl) .app-header .ah-act { padding-inline: 8px; } }
@container oui-appbar (max-width: 759px) { .app-header .ah-label { display: none; } .app-header .ah-act { padding-inline: 8px; } }
@container oui-appbar (max-width: 520px) { .app-header .oui-appbar-status { order: 4; flex: 1 0 100%; min-height: 28px; padding-bottom: 4px; } }
</style>
