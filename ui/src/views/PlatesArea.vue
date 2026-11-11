<script setup lang="ts">
// Left column, top: first-run checklist + plate list (T4.2 owns this wrapper; children are T4.6 / T4.3).
import InlineAlert from "../components/base/InlineAlert.vue";
import { filesText } from "../files";
import { settingLabel } from "../components/settingLabels";
import { t } from "../i18n";
import { dismissSettingsReset, store } from "../state/store";
import FirstRunChecklist from "../components/FirstRunChecklist.vue";
import PlateList from "../components/plates/PlateList.vue";
</script>

<template>
  <div class="plates-area">
    <div v-if="store.settingsReset.length" data-settings-reset>
      <InlineAlert tone="warn" :actions="[{ label: t('common.close'), run: dismissSettingsReset }]"><p>{{ t("settings.reset", { names: store.settingsReset.map(settingLabel).join(", ") }) }}</p></InlineAlert>
    </div>
    <div v-if="store.unreadable.length" data-unreadable>
      <InlineAlert tone="bad"><p>{{ t("host.unreadable", { files: filesText(store.unreadable) }) }}</p></InlineAlert>
    </div>
    <FirstRunChecklist v-if="!store.settings.onboarded && !store.unreadable.length" />
    <PlateList />
  </div>
</template>

<style scoped>
.plates-area > * + * { margin-top: 12px; }
</style>
