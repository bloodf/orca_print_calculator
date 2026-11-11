<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { bytes } from "../../format";
import { t } from "../../i18n";
import { locale } from "../../state/store";
import Icon from "../base/Icon.vue";
import { cancelImport, importFile, importState } from "./importFlow";

const input = ref<HTMLInputElement | null>(null);
const busy = () => importState.phase !== "idle";

function onPick(e: Event): void {
  const el = e.target as HTMLInputElement;
  const f = el.files?.[0];
  el.value = ""; // the same file can be picked again
  if (f) void importFile(f);
}
const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") cancelImport(); };
watch(() => importState.phase, (p) => {
  document.removeEventListener("keydown", onKey);
  if (p === "reading") document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <span class="import row">
    <button type="button" class="btn" :aria-busy="busy() ? 'true' : undefined" :aria-disabled="busy() ? 'true' : undefined" @click="!busy() && input?.click()">
      <Icon name="upload" />
      <span v-if="importState.phase === 'reading'">{{ t("plates.importing", { name: importState.name, size: bytes(importState.size, locale) }) }}</span>
      <span v-else-if="importState.phase === 'parsing'">{{ t("plates.importParsing", { name: importState.name }) }}</span>
      <span v-else>{{ t("plates.import") }}</span>
    </button>
    <button v-if="importState.phase === 'reading'" type="button" class="btn ghost" @click="cancelImport">{{ t("plates.importCancel") }}</button>
    <input ref="input" type="file" accept=".3mf" class="hidden" tabindex="-1" aria-hidden="true" @change="onPick" />
  </span>
</template>

<style scoped>
.import { min-width: 0; display: inline-flex; }
.import .btn:first-child { max-width: 320px; }
.import .btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hidden { display: none; }
</style>
