<script setup lang="ts">
// Settings › Spoolman: address, Test connection (spoolman_fetch), Spooler hint (docs/ux.md §5.3 Settings 1).
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { computed, ref } from "vue";
import { call, errorCode } from "../../bridge";
import { t } from "../../i18n";
import { fetchSpoolman, store } from "../../state/store";
import { OuiBanner, OuiIcon, OuiRequirement, showToast } from "../../../shared/src/components";
import * as I from "../../../shared/src/icons";
import { lead } from "../base/lead";
import CopyValue from "./CopyValue.vue";
import { spoolmanErrorMessage, urlHost } from "./spoolmanError";
import { EXAMPLE_URL, useSpoolmanUrl } from "./useSpoolmanUrl";

const { url, error, problem, commit, use, touched } = useSpoolmanUrl();
const testing = ref(false);
const spoolerUrl = computed(() => (store.spooler?.url && store.spooler.url !== store.settings.spoolman.url ? store.spooler.url : null));
const saved = computed(() => store.settings.spoolman.url);
// What this page needs on the network: Spoolman, as last seen by the page's own connection. "Check again" reconnects.
const REQ = { ok: ["found", "req.found"], connecting: ["checking", "req.checking"], offline: ["missing", "req.notFound"], unset: ["missing", "req.notSet"] } as const;
const req = computed(() => REQ[store.spoolman.state]);
const reqDetail = computed(() => (store.spoolman.state === "ok" ? `${saved.value} · ${t("spoolman.ok", { n: store.spoolman.data.spools.length })}`
  : store.spoolman.state === "offline" ? `${saved.value} · ${spoolmanErrorMessage(store.spoolman.error ?? "unknown")}` : undefined));
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
    <OuiRequirement
      class="req" name="Spoolman" :why="t('req.spoolmanWhy')" :status="req[0]" :status-label="t(req[1])" :detail="reqDetail"
      :install-text="t('req.spoolmanInstall')" install-url="https://github.com/Donkie/Spoolman" install-label="github.com/Donkie/Spoolman"
      :check-label="t('req.checkAgain')" data-requirement="spoolman" @check="fetchSpoolman(false)"
    />
    <OuiBanner v-if="spoolerUrl" tone="info" dismissible :dismiss-key="`spooler-hint:${spoolerUrl}`" :close-label="t('common.close')" :title="lead(t('spoolman.spoolerHint', { url: spoolerUrl }))[0]">
      {{ lead(t("spoolman.spoolerHint", { url: spoolerUrl }))[1] }}
      <template #actions><Button severity="secondary" size="small" type="button" @click="use(spoolerUrl!)">{{ t("spoolman.useIt") }}</Button></template>
    </OuiBanner>
    <div>
      <label for="settings-spoolman-url" class="sm oui-muted lbl">{{ t("spoolman.url") }}</label>
      <div class="url-row">
        <InputText
          id="settings-spoolman-url" v-model="url" type="text" inputmode="url" autocomplete="off" spellcheck="false" :placeholder="EXAMPLE_URL"
          :invalid="!!error" :aria-invalid="error ? 'true' : undefined" :aria-describedby="error ? 'settings-spoolman-err' : 'settings-spoolman-hint'" @change="commit" @keydown.enter="commit"
        />
        <Button severity="secondary" type="button" :aria-disabled="!canTest" :aria-busy="testing" @click="runTest">
          {{ testing ? t("spoolman.testing") : t("spoolman.test") }}
        </Button>
      </div>
      <p v-if="error" id="settings-spoolman-err" class="sm bad" role="alert">{{ error }}</p>
      <p v-else id="settings-spoolman-hint" class="sm oui-muted">{{ t("spoolman.saveHint") }}</p>
    </div>
    <CopyValue v-if="saved" :value="saved" :label="t('spoolman.url')" />
  </div>
</template>

<style scoped>
.stack > * + * { margin-top: 8px; }
.req { padding: 0 0 var(--oui-s3); border-bottom: 1px solid var(--oui-border); }
.lbl { display: block; min-height: 24px; line-height: 24px; }
.url-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-column-gap: 8px; align-items: center; }
.url-row :deep(.p-inputtext) { width: 100%; }
.bad { color: var(--oui-danger); margin-top: 2px; }
</style>
