<script setup lang="ts">
// Settings › General: language and currency, then what the plugin is (version, where to read more) and Reset all settings.
import { t } from "../../i18n";
import AboutSettings from "./AboutSettings.vue";
import LanguageCurrency from "./LanguageCurrency.vue";
</script>

<template>
  <div class="general">
    <LanguageCurrency />
    <section class="about hairline" :aria-label="t('settings.group.about')" data-about><AboutSettings /></section>
  </div>
</template>

<style scoped>
.about { margin-top: var(--oui-s4); padding-top: var(--oui-s4); }
</style>
