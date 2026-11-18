<script setup lang="ts">
// Settings: one page per group, picked from the list (SettingsPages: list beside the page, or list then page when narrow). Nothing here has a Save button: changes are
// saved as they are made, and the one bar at the bottom says so (or says that saving failed, with Retry).
import Button from "primevue/button";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { OuiFormSection, OuiIcon, OuiStatus, type OuiIconData, type OuiTone } from "../../shared/src/components";
import * as I from "../../shared/src/icons";
import { t } from "../i18n";
import { SETTINGS_TABS, settingsLinked, settingsTab, type SettingsTab } from "../state/settingsTab";
import { flushSettings, store } from "../state/store";
import AboutSettings from "../components/settings/AboutSettings.vue";
import ChannelEditor from "../components/settings/ChannelEditor.vue";
import CostDefaults from "../components/settings/CostDefaults.vue";
import LanguageCurrency from "../components/settings/LanguageCurrency.vue";
import PricingDefaults from "../components/settings/PricingDefaults.vue";
import PrinterProfiles from "../components/settings/PrinterProfiles.vue";
import RequirementsSettings from "../components/settings/RequirementsSettings.vue";
import SheetSettings from "../components/settings/SheetSettings.vue";
import SettingsPages from "../components/settings/SettingsPages.vue";
import SpoolmanSettings from "../components/settings/SpoolmanSettings.vue";

const COMPS = {
  spoolman: SpoolmanSettings, costs: CostDefaults, pricing: PricingDefaults, channels: ChannelEditor,
  printers: PrinterProfiles, sheet: SheetSettings, language: LanguageCurrency, requirements: RequirementsSettings, about: AboutSettings,
} as const;
// each group in the hue of its subject (DESIGN.md, hue by domain)
const LOOK: Record<SettingsTab, { icon: OuiIconData; tone: OuiTone }> = {
  spoolman: { icon: I.spoolman, tone: "magenta" }, costs: { icon: I.coins, tone: "orange" }, pricing: { icon: I.tag, tone: "accent" }, channels: { icon: I.store, tone: "teal" },
  printers: { icon: I.printer, tone: "cobalt" }, sheet: { icon: I.receipt, tone: "accent" }, language: { icon: I.languages, tone: "neutral" }, requirements: { icon: I.wrench, tone: "neutral" }, about: { icon: I.info, tone: "neutral" },
};
const HELP: Partial<Record<SettingsTab, string>> = { costs: "settings.costsHelp" };
const sections = computed(() => SETTINGS_TABS.map((id) => ({ id: `settings-${id}`, label: t(`settings.group.${id}`), icon: LOOK[id].icon })));
// the two reading columns; the quote sheet has its live sample beside the form, so it takes the full width under them
const COLUMNS: SettingsTab[][] = [["spoolman", "costs", "pricing"], ["channels", "printers", "language", "requirements", "about"]];

// A shortcut from elsewhere ("Printer price and lifetime", the currency chip) asked for a group: open its page.
const settingsRef = ref<{ select: (id: string) => void }>();
function follow(): void {
  if (!settingsLinked.value) return;
  settingsLinked.value = false;
  void nextTick(() => settingsRef.value?.select(`settings-${settingsTab.value}`));
}
onMounted(follow);
watch([settingsTab, settingsLinked], follow); // asked for again while Settings is already open
</script>

<template>
  <main class="settings" :aria-label="t('settings.title')" tabindex="-1">
    <h2 class="oui-sr" tabindex="-1" data-view-title>{{ t("settings.title") }}</h2>
    <SettingsPages ref="settingsRef" :sections="sections" :nav-label="t('settings.nav')" :back-label="t('sheet.back')" :error-label="t('settings.hasError')">
      <div v-for="(col, i) in COLUMNS" :key="i" class="oui-stack">
        <OuiFormSection v-for="id in col" :id="`settings-${id}`" :key="id" class="grp" :title="t(`settings.group.${id}`)" :icon="LOOK[id].icon" :tone="LOOK[id].tone" :description="HELP[id] ? t(HELP[id]!) : undefined" :data-group="id">
          <div class="grp-body"><component :is="COMPS[id]" /></div>
        </OuiFormSection>
      </div>
      <OuiFormSection id="settings-sheet" class="grp wide" :title="t('settings.group.sheet')" :icon="LOOK.sheet.icon" :tone="LOOK.sheet.tone" data-group="sheet">
        <div class="grp-body"><SheetSettings /></div>
      </OuiFormSection>
      <template #footer>
        <span class="status" :class="{ bad: store.saveStatus === 'error' }" role="status">
          <OuiStatus v-if="store.saveStatus === 'saved'" state="ok" variant="plain">{{ t("settings.saved") }}</OuiStatus>
          <template v-else-if="store.saveStatus === 'error'"><OuiStatus state="error" variant="plain">{{ t("settings.saveFailed") }}</OuiStatus> <Button severity="secondary" size="small" type="button" @click="flushSettings()"><OuiIcon :icon="I.refresh" :size="14" /><span>{{ t("settings.retry") }}</span></Button></template>
        </span>
        <span class="oui-meta">{{ t("settings.autosave") }}</span>
      </template>
    </SettingsPages>
  </main>
</template>

<style scoped>
.settings:focus { outline: none; }
.grp-body { padding: var(--oui-s3) var(--oui-s4) var(--oui-s4); min-width: 0; }
.wide { grid-column: 1 / -1; }
.status { display: inline-flex; align-items: center; gap: var(--oui-s2); }
.status:empty { display: none; }
</style>
