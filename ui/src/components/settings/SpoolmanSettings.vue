<script setup lang="ts">
// Settings › Spoolman: address, Test connection (spoolman_fetch), Spooler hint (docs/ux.md §5.3 Settings 1).
import { computed, ref } from "vue";
import { call, errorCode } from "../../bridge";
import { t } from "../../i18n";
import { store } from "../../state/store";
import Icon from "../base/Icon.vue";
import InlineAlert from "../base/InlineAlert.vue";
import CopyValue from "./CopyValue.vue";
import { spoolmanErrorMessage, urlHost } from "./spoolmanError";
import { EXAMPLE_URL, useSpoolmanUrl } from "./useSpoolmanUrl";

type Test = { state: "idle" | "testing" } | { state: "ok" | "bad"; text: string };
const { url, error, problem, commit, use, touched } = useSpoolmanUrl();
const test = ref<Test>({ state: "idle" });
const spoolerUrl = computed(() => (store.spooler?.url && store.spooler.url !== store.settings.spoolman.url ? store.spooler.url : null));
const saved = computed(() => store.settings.spoolman.url);
const canTest = computed(() => !!url.value.trim() && !problem.value && test.value.state !== "testing");

async function runTest(): Promise<void> {
  touched.value = true;
  if (!canTest.value) return;
  test.value = { state: "testing" };
  try {
    const d = await call("spoolman_fetch", { url: url.value.trim() });
    test.value = { state: "ok", text: t("spoolman.connected", { spools: d.spools.length, filaments: d.filaments.length, currency: d.currency ?? "—" }) };
  } catch (e) {
    test.value = { state: "bad", text: spoolmanErrorMessage(errorCode(e)) };
  }
}
</script>

<template>
  <div class="stack">
    <InlineAlert v-if="spoolerUrl" tone="info" :actions="[{ label: t('spoolman.useIt'), run: () => use(spoolerUrl!) }]">{{ t("spoolman.spoolerHint", { url: spoolerUrl }) }}</InlineAlert>
    <div>
      <label for="settings-spoolman-url" class="sm muted lbl">{{ t("spoolman.url") }}</label>
      <div class="url-row">
        <input
          id="settings-spoolman-url" v-model="url" type="text" inputmode="url" autocomplete="off" spellcheck="false" :placeholder="EXAMPLE_URL"
          :aria-invalid="error ? 'true' : undefined" :aria-describedby="error ? 'settings-spoolman-err' : 'settings-spoolman-hint'" @change="commit" @keydown.enter="commit"
        />
        <button type="button" class="btn" :aria-disabled="!canTest" :aria-busy="test.state === 'testing'" @click="runTest">
          {{ test.state === "testing" ? t("spoolman.testing") : t("spoolman.test") }}
        </button>
      </div>
      <p v-if="error" id="settings-spoolman-err" class="sm bad" role="alert">{{ error }}</p>
      <p v-else id="settings-spoolman-hint" class="sm muted">{{ t("spoolman.saveHint") }}</p>
    </div>
    <p v-if="test.state === 'ok' || test.state === 'bad'" class="sm result row" :class="test.state" :role="test.state === 'bad' ? 'alert' : 'status'">
      <Icon :name="test.state === 'ok' ? 'check' : 'alert-circle'" /><span>{{ test.text }}</span>
    </p>
    <CopyValue v-if="saved" :value="saved" :label="t('spoolman.url')" />
  </div>
</template>

<style scoped>
.stack > * + * { margin-top: 8px; }
.lbl { display: block; min-height: 24px; line-height: 24px; }
.url-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-column-gap: 8px; align-items: center; }
.url-row input { width: 100%; }
.bad { color: var(--opc-bad); margin-top: 2px; }
.result > * + * { margin-left: 6px; }
.result.ok { color: var(--opc-accent-text); }
.result.bad { color: var(--opc-bad); }
</style>
