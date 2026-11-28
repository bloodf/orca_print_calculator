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
/* Layout of this bar's own parts; the band, the tabs and the buttons on it come from the shared app bar. */
.app-header .proj { flex: 0 2 auto; min-width: 4em; font-weight: 650; }
.app-header .oui-appbar-status > :not(.proj) { min-width: 0; }
/* A tab name is never cut. The tabs keep their full width; beside them the project and the printer give way, and where the
   bar cannot hold the tabs next to the rest they take a line of their own, which leaves the first line to the project,
   the printer and the actions. (ui-foundation's bar only did this from 760 px down: between there and 1100 px it cut the tabs.) */
.app-header .oui-appbar-tabs { flex-shrink: 0; }
@container oui-appbar (max-width: 1099px) {
  .app-header .oui-appbar-row { flex-wrap: wrap; }
  .app-header .oui-appbar-id, .app-header .oui-appbar-status, .app-header .oui-appbar-actions { min-height: 40px; }
  .app-header .oui-appbar-tabs { order: 5; flex: 1 0 100%; min-height: 36px; margin-inline: -10px; overflow-x: auto; box-shadow: inset 0 1px 0 var(--oui-border); }
  /* the project and the printer take what the first line has left and shorten inside it: a long project name never pushes the actions to a third line */
  .app-header .oui-appbar-row > .oui-spacer { display: none; }
  .app-header .oui-appbar-status { flex: 1 1 0; justify-content: flex-end; }
}
.app-header .ah-act { gap: 6px; }
/* What gives way where the tabs share the line (1100 px up): the Spoolman count shortens to the one word "Spoolman", then to its dot.
   German, Spanish and Polish tab names are longer: there the action labels give way too, so the project and printer keep their room. */
.app-header .sm-short { display: none; }
@container oui-appbar (min-width: 1100px) and (max-width: 1499px) { .app-header .sm-text { display: none; } .app-header .sm-short { display: inline; } }
@container oui-appbar (min-width: 1100px) and (max-width: 1439px) { .app-header .sm-short { display: none; } .app-header .sp-chip .oui-status { gap: 0; padding-inline: 7px; } }
@container oui-appbar (min-width: 1100px) and (max-width: 1379px) { :lang(de) .app-header .ah-label, :lang(es) .app-header .ah-label, :lang(pl) .app-header .ah-label { display: none; } :lang(de) .app-header .ah-act, :lang(es) .app-header .ah-act, :lang(pl) .app-header .ah-act { padding-inline: 8px; } }
/* With the tabs on their own line the first line has room for the words again, down to about 1000 px; under that, the dot and the icons
   (their names stay as title and accessible name). */
@container oui-appbar (max-width: 999px) { .app-header .sm-text, .app-header .ah-label { display: none; } .app-header .sp-chip .oui-status { gap: 0; padding-inline: 7px; } .app-header .ah-act { padding-inline: 8px; } }
@container oui-appbar (max-width: 520px) { .app-header .oui-appbar-status { order: 4; flex: 1 0 100%; min-height: 28px; padding-bottom: 4px; } }
</style>
