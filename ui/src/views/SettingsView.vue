<script setup lang="ts">
// Settings view: left rail of anchor buttons (>= 900px), nine groups, "Saved" status, no Save button (docs/ux.md §5.3 Settings).
import { t } from "../i18n";
import { flushSettings, store } from "../state/store";
import AboutSettings from "../components/settings/AboutSettings.vue";
import ChannelEditor from "../components/settings/ChannelEditor.vue";
import CostDefaults from "../components/settings/CostDefaults.vue";
import ExtrasCatalog from "../components/settings/ExtrasCatalog.vue";
import LanguageCurrency from "../components/settings/LanguageCurrency.vue";
import PricingDefaults from "../components/settings/PricingDefaults.vue";
import PrinterProfiles from "../components/settings/PrinterProfiles.vue";
import SheetSettings from "../components/settings/SheetSettings.vue";
import SpoolmanSettings from "../components/settings/SpoolmanSettings.vue";

const GROUPS = [
  { id: "spoolman", comp: SpoolmanSettings }, { id: "costs", comp: CostDefaults, help: "settings.costsHelp" }, { id: "pricing", comp: PricingDefaults },
  { id: "channels", comp: ChannelEditor }, { id: "printers", comp: PrinterProfiles }, { id: "extras", comp: ExtrasCatalog },
  { id: "sheet", comp: SheetSettings }, { id: "language", comp: LanguageCurrency }, { id: "about", comp: AboutSettings },
] as const;

const goto = (id: string): void => document.getElementById(`settings-${id}`)?.scrollIntoView({ block: "start" });
</script>

<template>
  <main class="settings" :aria-label="t('settings.title')">
    <nav class="rail app-chrome" :aria-label="t('settings.nav')">
      <button v-for="g in GROUPS" :key="g.id" type="button" class="rail-btn" @click="goto(g.id)">{{ t(`settings.group.${g.id}`) }}</button>
    </nav>
    <div class="body">
      <div class="head row">
        <h1 class="view-title" tabindex="-1" data-view-title>{{ t("settings.title") }}</h1>
        <span class="sm status" :class="{ bad: store.saveStatus === 'error' }" role="status">
          <template v-if="store.saveStatus === 'saved'">{{ t("settings.saved") }}</template>
          <template v-else-if="store.saveStatus === 'error'">{{ t("settings.saveFailed") }} <button type="button" class="btn ghost" @click="flushSettings()">{{ t("settings.retry") }}</button></template>
        </span>
      </div>
      <section v-for="g in GROUPS" :id="`settings-${g.id}`" :key="g.id" class="grp" :aria-labelledby="`settings-${g.id}-h`">
        <h2 :id="`settings-${g.id}-h`" class="lg">{{ t(`settings.group.${g.id}`) }}</h2>
        <p v-if="'help' in g" class="sm muted help">{{ t(g.help) }}</p>
        <component :is="g.comp" />
      </section>
    </div>
  </main>
</template>

<style scoped>
.settings { padding: 12px; }
.body { max-width: 760px; }
.rail { display: none; }
.head { min-height: 32px; margin-bottom: 12px; }
.head > * + * { margin-left: 12px; }
.status { color: var(--opc-muted); min-height: 20px; }
.status.bad { color: var(--opc-bad); }
.grp { scroll-margin-top: calc(var(--opc-header-h) + 12px); padding: 24px 0; border-top: 1px solid var(--opc-border); }
.grp > h2 { margin-bottom: 4px; }
.grp > .help { margin-bottom: 8px; }
.grp > h2 + :not(.help) { margin-top: 12px; }
.grp:first-of-type { border-top: 0; padding-top: 12px; }
@media (min-width: 900px) {
  .settings { display: grid; grid-template-columns: 200px minmax(0, 1fr); grid-column-gap: 24px; align-items: start; padding: 16px; }
  .rail { display: block; position: sticky; top: calc(var(--opc-header-h) + 12px); }
  .rail-btn { display: block; width: 100%; text-align: left; height: 28px; padding: 0 10px; border: 0; border-radius: var(--opc-r-control); background: transparent; color: var(--opc-muted); }
  .rail-btn:hover { background: var(--opc-hover); color: var(--opc-fg); }
}
</style>
