<script setup lang="ts">
import Button from "primevue/button";
import { onBeforeUnmount, ref, watch } from "vue";
import { bytes } from "../../format";
import { t } from "../../i18n";
import { locale } from "../../state/store";
import { OuiIcon } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";
import { cancelImport, importFile, importState } from "./importFlow";

/** `bar`: the quiet version for the app bar (its label gives way when the bar is narrow). */
defineProps<{ bar?: boolean }>();
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
  <span class="import">
    <Button severity="secondary" :text="bar" :size="bar ? 'small' : undefined" type="button" class="ah-act" :aria-busy="busy() ? 'true' : undefined" :aria-disabled="busy() ? 'true' : undefined" :title="t('plates.import')" @click="!busy() && input?.click()">
      <OuiIcon :icon="I.upload" :size="14" />
      <span v-if="importState.phase === 'reading'">{{ t("plates.importing", { name: importState.name, size: bytes(importState.size, locale) }) }}</span>
      <span v-else-if="importState.phase === 'parsing'">{{ t("plates.importParsing", { name: importState.name }) }}</span>
      <span v-else :class="{ 'ah-label': bar }">{{ t("plates.import") }}</span>
    </Button>
    <Button v-if="importState.phase === 'reading'" text severity="secondary" :size="bar ? 'small' : undefined" type="button" @click="cancelImport">{{ t("plates.importCancel") }}</Button>
    <input ref="input" type="file" accept=".3mf" class="hidden" tabindex="-1" aria-hidden="true" @change="onPick" />
  </span>
</template>

<style scoped>
.import { min-width: 0; display: inline-flex; align-items: center; gap: var(--oui-s1); }
.import :deep(.p-button:first-child) { max-width: 300px; gap: 6px; }
.import :deep(.p-button span) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hidden { display: none; }
</style>
