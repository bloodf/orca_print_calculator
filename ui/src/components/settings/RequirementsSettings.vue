<script setup lang="ts">
// Settings › Requirements: both are optional; the calculator works without them (Spoolman prices fall back to Orca presets).
import Button from "primevue/button";
import { computed, ref } from "vue";
import { t } from "../../i18n";
import { checkRequirements, store } from "../../state/store";
import { OuiIcon } from "../../../shared/src/components";
import * as I from "../../../shared/src/icons";
import RequirementRow from "./RequirementRow.vue";

const SPOOLMAN_URL = "https://github.com/Donkie/Spoolman";
const SPOOLER_URL = "https://cloud.orcaslicer.com/p/50c35dcbd6f3";
const busy = ref(false);
const saved = computed(() => store.settings.spoolman.url.trim());
const spoolman = computed(() => saved.value ? t("req.spoolman.configured", { url: saved.value })
  : store.spooler?.url ? t("req.spoolman.detected", { url: store.spooler.url }) : t("req.spoolman.unset"));

async function again(): Promise<void> {
  busy.value = true;
  try { await checkRequirements(); } finally { busy.value = false; }
}
</script>

<template>
  <div class="stack">
    <RequirementRow
      name="Spoolman" :ok="!!(saved || store.spooler?.url)" :status="spoolman" :why="t('req.spoolman.why')" :how="t('req.spoolman.how')" :link="SPOOLMAN_URL"
      data-req="spoolman"
    />
    <RequirementRow
      name="Spooler" :ok="!!store.spooler" :status="t(store.spooler ? 'req.spooler.found' : 'req.spooler.missing')" :why="t('req.spooler.why')" :how="t('req.spooler.how')" :link="SPOOLER_URL"
      data-req="spooler"
    />
    <Button severity="secondary" size="small" type="button" :aria-busy="busy ? 'true' : undefined" :disabled="busy" @click="again"><OuiIcon :icon="I.refresh" :size="14" /><span>{{ t("req.checkAgain") }}</span></Button>
  </div>
</template>

<style scoped>
.stack > * + * { margin-top: 12px; }
</style>
