<script setup lang="ts">
// Settings › About: version, permission line, README address, Reset all settings (docs/ux.md §5.3 Settings 9, §7.5).
import { onBeforeUnmount, ref } from "vue";
import { t } from "../../i18n";
import { defaultSettings } from "../../state/defaults";
import { fetchSpoolman, patchSettings, store } from "../../state/store";
import { toast } from "../../state/toast";
import CopyValue from "./CopyValue.vue";

const README_URL = "https://github.com/bloodf/orca_print_calculator#readme";
const armed = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(timer));

function restore(before: typeof store.settings): void {
  patchSettings(() => before);
  void fetchSpoolman(true);
}
function reset(): void {
  if (!armed.value) {
    armed.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => (armed.value = false), 4000);
    return;
  }
  clearTimeout(timer);
  armed.value = false;
  const before = store.settings;
  patchSettings(() => defaultSettings(null, t("channel.directName")));
  void fetchSpoolman(true);
  toast({ text: t("about.resetDone"), action: { label: t("common.undo"), run: () => restore(before) } });
}
</script>

<template>
  <div class="stack">
    <p class="num">{{ t("about.version", { v: store.host.pluginVersion || "—" }) }}</p>
    <p class="sm muted perm">{{ t("setup.permission") }}</p>
    <div>
      <p class="sm muted lbl">{{ t("about.readme") }}</p>
      <CopyValue :value="README_URL" :label="t('about.readme')" />
    </div>
    <button type="button" class="btn danger" :aria-live="armed ? 'polite' : undefined" @click="reset">{{ armed ? t("about.resetConfirm") : t("about.resetAll") }}</button>
  </div>
</template>

<style scoped>
.stack > * + * { margin-top: 12px; }
.perm { max-width: 60ch; }
.lbl { min-height: 20px; }
</style>
