<script setup lang="ts">
// Settings view: one group at a time behind tabs (vertical rail >= 900px, wrapping row below), "Saved" status, no Save button.
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
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

const mq = typeof matchMedia === "function" ? matchMedia("(min-width: 900px)") : null;
const vertical = ref(mq?.matches ?? true);
const onMq = (e: MediaQueryListEvent): void => { vertical.value = e.matches; };
mq?.addEventListener("change", onMq);
onBeforeUnmount(() => mq?.removeEventListener("change", onMq));

async function select(id: SettingsTab, focus = false): Promise<void> {
  settingsTab.value = id;
  if (!focus) return;
  await nextTick();
  document.getElementById(`settings-tab-${id}`)?.focus();
}
function onKey(e: KeyboardEvent): void {
  const i = SETTINGS_TABS.indexOf(settingsTab.value);
  const n = SETTINGS_TABS.length;
  const k = e.key;
  const to = k === "ArrowDown" || k === "ArrowRight" ? i + 1 : k === "ArrowUp" || k === "ArrowLeft" ? i - 1 : k === "Home" ? 0 : k === "End" ? n - 1 : null;
  if (to === null) return;
  e.preventDefault();
  void select(SETTINGS_TABS[(to + n) % n]!, true);
}
</script>

<template>
  <main class="settings" :aria-label="t('settings.title')">
    <div class="head row">
      <h1 class="view-title" tabindex="-1" data-view-title>{{ t("settings.title") }}</h1>
      <span class="sm status" :class="{ bad: store.saveStatus === 'error' }" role="status">
        <template v-if="store.saveStatus === 'saved'">{{ t("settings.saved") }}</template>
        <template v-else-if="store.saveStatus === 'error'">{{ t("settings.saveFailed") }} <button type="button" class="btn ghost" @click="flushSettings()">{{ t("settings.retry") }}</button></template>
      </span>
    </div>
    <div class="rail app-chrome" role="tablist" :aria-orientation="vertical ? 'vertical' : 'horizontal'" :aria-label="t('settings.nav')" @keydown="onKey">
      <button
        v-for="id in SETTINGS_TABS" :id="`settings-tab-${id}`" :key="id" type="button" role="tab" class="rail-btn"
        :class="{ on: id === settingsTab }" :aria-selected="id === settingsTab" :aria-controls="`settings-${id}`" :tabindex="id === settingsTab ? 0 : -1"
        @click="select(id)"
      >{{ t(`settings.group.${id}`) }}</button>
    </div>
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
.rail { display: flex; flex-wrap: wrap; margin: -2px; padding-bottom: 8px; border-bottom: 1px solid var(--opc-border); } /* no flex gap: Safari 14 floor */
.rail-btn { margin: 2px; height: 28px; padding: 0 10px; border: 0; border-radius: var(--opc-r-control); background: transparent; color: var(--opc-muted); text-align: left; white-space: nowrap; }
.rail-btn:hover { background: var(--opc-hover); color: var(--opc-fg); }
.rail-btn.on { background: var(--opc-selected); color: var(--opc-accent-text); font-weight: 500; }
.grp { max-width: 760px; min-width: 0; padding: 16px 0 24px; scroll-margin-top: calc(var(--opc-header-h) + 12px); }
.grp.wide { max-width: none; } /* the quote editor puts its live sample beside the form */
.grp > h2 { margin-bottom: 4px; }
.grp > .help { margin-bottom: 8px; }
.grp > h2 + :not(.help) { margin-top: 12px; }
@media (min-width: 900px) {
  .settings { display: grid; grid-template-columns: 200px minmax(0, 1fr); grid-column-gap: 24px; align-items: start; padding: 16px; }
  .head { grid-column: 1 / -1; }
  .rail { display: block; position: sticky; top: calc(var(--opc-header-h) + 12px); margin: 0; padding: 0; border: 0; }
  .rail-btn { display: block; width: 100%; margin: 0; }
  .rail-btn + .rail-btn { margin-top: 2px; }
  .grp { padding-top: 0; }
}
</style>
