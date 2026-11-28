<script setup lang="ts">
// Settings › Connections: what is connected (Spoolman, Spooler), then Spoolman's address with Test connection (spoolman_fetch)
// and Spooler's offer of its own address (docs/ux.md §5.3 Settings 1).
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import { computed, ref } from "vue";
import { call, errorCode } from "../../bridge";
import { t } from "../../i18n";
import { patchSettings, store } from "../../state/store";
import { cleanEvery } from "../../autorefresh";
import { OuiBanner, OuiIcon, showToast } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";
import { lead } from "../base/lead";
import RequirementsSettings from "./RequirementsSettings.vue";
import { spoolmanErrorMessage, urlHost } from "./spoolmanError";
import { EXAMPLE_URL, useSpoolmanUrl } from "./useSpoolmanUrl";

const { url, error, problem, commit, use, touched } = useSpoolmanUrl();
const testing = ref(false);
const spoolerUrl = computed(() => (store.spooler?.url && store.spooler.url !== store.settings.spoolman.url ? store.spooler.url : null));
// the permission note matters at one moment only: while the address in the field is not the saved one yet
const unsaved = computed(() => url.value.trim() !== store.settings.spoolman.url.trim());
// How often the stock and the spool picker re-read Spoolman while the page shows (0 = off).
const every = computed(() => cleanEvery(store.settings.spoolman.refreshS));
const everyOptions = computed(() => [0, 10, 15, 30, 60, 120, 300].map((n) => ({ value: n, label: n ? t("spoolman.everyOption", { n }) : t("spoolman.everyOff") })));
const setEvery = (n: number) => patchSettings((s) => ({ spoolman: { ...s.spoolman, refreshS: n } }));
const canTest = computed(() => !!url.value.trim() && !problem.value && !testing.value);

async function runTest(): Promise<void> {
  touched.value = true;
  if (!canTest.value) return;
  testing.value = true;
  try {
    const d = await call("spoolman_fetch", { url: url.value.trim() });
    showToast({ tone: "success", key: "spoolman-test", title: t("spoolman.connected", { spools: d.spools.length, filaments: d.filaments.length, currency: d.currency ?? "—" }) });
  } catch (e) {
    showToast({ tone: "error", key: "spoolman-test", title: spoolmanErrorMessage(errorCode(e)) });
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <div class="stack">
    <RequirementsSettings />
    <OuiBanner :show="!!spoolerUrl" tone="info" dismissible :dismiss-key="`spooler-hint:${spoolerUrl ?? ''}`" :close-label="t('common.close')" :title="lead(t('spoolman.spoolerHint', { url: spoolerUrl ?? '' }))[0]">
      {{ lead(t("spoolman.spoolerHint", { url: spoolerUrl ?? "" }))[1] }}
      <template #actions><Button severity="secondary" size="small" type="button" @click="use(spoolerUrl!)">{{ t("spoolman.useIt") }}</Button></template>
    </OuiBanner>
    <div>
      <label for="settings-spoolman-url" class="sm oui-muted lbl">{{ t("spoolman.url") }}</label>
      <div class="url-row">
        <InputText
          id="settings-spoolman-url" v-model="url" type="text" inputmode="url" autocomplete="off" spellcheck="false" :placeholder="EXAMPLE_URL"
          :invalid="!!error" :aria-invalid="error ? 'true' : undefined" :aria-describedby="error ? 'settings-spoolman-err' : (!url.trim() && !spoolerUrl) || unsaved ? 'settings-spoolman-hint' : undefined" @change="commit" @keydown.enter="commit"
        />
        <Button severity="secondary" type="button" :aria-disabled="!canTest" :aria-busy="testing" @click="runTest">
          {{ testing ? t("spoolman.testing") : t("spoolman.test") }}
        </Button>
      </div>
      <p v-if="error" id="settings-spoolman-err" class="sm bad" role="alert">{{ error }}</p>
      <p v-else-if="!url.trim() && !spoolerUrl" id="settings-spoolman-hint" class="sm oui-muted" data-test-off>{{ t("spoolman.testOff") }}</p>
      <p v-else-if="unsaved" id="settings-spoolman-hint" class="sm oui-muted" data-save-hint>{{ t("spoolman.saveHint") }}</p>
    </div>
    <div>
      <label id="settings-spoolman-every-l" class="sm oui-muted lbl">{{ t("spoolman.every") }}</label>
      <Select :model-value="every" :options="everyOptions" option-label="label" option-value="value" aria-labelledby="settings-spoolman-every-l"
              aria-describedby="settings-spoolman-every-hint" data-test="spoolman-every" @update:model-value="setEvery($event as number)" />
      <p id="settings-spoolman-every-hint" class="sm oui-muted">{{ t("spoolman.everyHelp") }}</p>
    </div>
  </div>
</template>

<style scoped>
.stack > * + * { margin-top: var(--oui-s3); }
.lbl { display: block; min-height: 24px; line-height: 24px; }
.url-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-column-gap: 8px; align-items: center; }
.url-row :deep(.p-inputtext) { width: 100%; }
.bad { color: var(--oui-danger); margin-top: 2px; }
</style>
