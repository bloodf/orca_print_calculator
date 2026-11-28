<script setup lang="ts">
// The two things this plugin can connect to, at the top of Settings › Connections. Both are optional: the calculator works
// without them (filament prices then come from the Orca presets), so one that is absent is not a warning. One "Check again"
// (the list's) looks for both. Where the host looked for Spooler (file names, the data folder) is for the log, not for the page.
import Button from "primevue/button";
import { computed, ref } from "vue";
import { copyText } from "../../clipboard";
import { t } from "../../i18n";
import { checkRequirements, store } from "../../state/store";
import { OuiIcon, OuiRequirement, OuiRequirementList, showToast } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";
import { spoolmanErrorMessage } from "./spoolmanError";

const SPOOLMAN_URL = "https://github.com/Donkie/Spoolman";
const SPOOLER_URL = "https://cloud.orcaslicer.com/p/50c35dcbd6f3";
/** `absent`: optional and not there (a neutral chip, with how to get it). `missing` is kept for what was set up and does not answer. */
type Row = { status: "found" | "missing" | "checking" | "unknown"; label: string; detail?: string; absent?: boolean };
const busy = ref(false);
const saved = computed(() => store.settings.spoolman.url.trim());
const checking = (): Row => ({ status: "checking", label: t("req.checking") });
const spoolman = computed<Row>(() => {
  const sp = store.spoolman;
  if (busy.value) return checking();
  // no address saved: the form below takes one (and offers Spooler's when Spooler knows it)
  if (!saved.value) return { status: "unknown", label: t("req.notConnected"), absent: !store.spooler?.url };
  if (sp.state === "ok") return { status: "found", label: t("req.connected"), detail: t("req.spools", { n: sp.data.spools.length }) };
  if (sp.state === "offline") return { status: "missing", label: t("req.notFound"), detail: spoolmanErrorMessage(sp.error ?? "unknown") };
  return checking();
});
const spooler = computed<Row>(() => (busy.value ? checking()
  : store.spooler ? { status: "found", label: t("req.connected") }
  : { status: "unknown", label: t("req.notConnected"), absent: true, detail: t(store.spoolerLooked.length ? "req.spooler.notFound" : "req.spooler.noFolder") }));

async function again(): Promise<void> {
  busy.value = true;
  try { await checkRequirements(); } finally { busy.value = false; }
}
// A link clicked in OrcaSlicer's page would load over the plugin (docs/ux.md §7.10): the address is copied instead, to paste in a browser.
async function copyLink(url: string): Promise<void> {
  const ok = await copyText(url);
  showToast({ tone: ok ? "success" : "error", key: "req-link", title: t(ok ? "req.linkCopied" : "common.copyFailed") });
}
</script>

<template>
  <OuiRequirementList class="reqs" :check-label="t('req.checkAgain')" :checking="busy" data-reqs @check="again">
    <div v-for="r in [{ id: 'spoolman', name: 'Spoolman', row: spoolman, url: SPOOLMAN_URL }, { id: 'spooler', name: 'Spooler', row: spooler, url: SPOOLER_URL }]" :key="r.id" class="req">
      <OuiRequirement :name="r.name" :why="t(`req.${r.id}.why`)" :status="r.row.status" :status-label="r.row.label" :detail="r.row.detail" :data-req="r.id" />
      <!-- ui-foundation 5.14.0 shows how to get something only on an amber "missing" row; from 5.14.1 (`optional`) this line is the row's own -->
      <p v-if="r.row.absent" class="req-how sm oui-muted" :data-req-how="r.id">
        <span>{{ t(`req.${r.id}.how`) }}</span>
        <Button text size="small" type="button" class="req-link" :data-req-link="r.id" @click="copyLink(r.url)"><OuiIcon :icon="I.copy" :size="13" /><span>{{ t(`req.${r.id}.link`) }}</span></Button>
      </p>
    </div>
  </OuiRequirementList>
</template>

<style scoped>
.reqs { border: 1px solid var(--oui-border); border-radius: var(--oui-radius-lg); }
.req-how { display: flex; flex-wrap: wrap; align-items: center; gap: 2px var(--oui-s2); padding: 0 var(--oui-s4) var(--oui-s3); }
.req-how :deep(.req-link) { gap: 4px; padding-inline: 6px; }
</style>
