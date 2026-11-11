<script setup lang="ts">
// Settings › Language and currency (docs/ux.md §5.3 Settings 8).
import { computed, ref, watch } from "vue";
import { t } from "../../i18n";
import { currency, patchSettings, setLanguage, store } from "../../state/store";
import type { Lang } from "../../state/types";
import InlineAlert from "../base/InlineAlert.vue";
import SelectField from "../costs/SelectField.vue";
import TextField from "./TextField.vue";

const fromSpoolman = computed(() => store.spoolman.data.currency);
const code = ref(store.settings.currency ?? currency.value);
watch(() => store.settings.currency, (v) => { if (v) code.value = v; });
const validCode = (c: string): boolean => {
  if (!/^[A-Z]{3}$/.test(c)) return false;
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency: c });
    return true;
  } catch {
    return false;
  }
};
const codeError = computed(() => (code.value && !validCode(code.value) ? t("currency.invalid") : ""));
function setCode(v: string): void {
  code.value = v;
  // Stored amounts keep their digits across a code change; remember where they were entered so the mismatch alert shows.
  if (validCode(v)) patchSettings({ currency: v, defaultsCurrency: store.settings.defaultsCurrency ?? currency.value });
}
const langs = (): { value: string; label: string }[] => [
  { value: "auto", label: t("lang.auto") }, { value: "en", label: t("lang.en") }, { value: "pt-BR", label: t("lang.pt") },
];
const mismatch = computed(() => !!store.settings.defaultsCurrency && store.settings.defaultsCurrency !== currency.value);
</script>

<template>
  <div class="stack">
    <div class="form-grid">
      <SelectField :model-value="store.settings.language" :label="t('header.language')" :options="langs()" @update:model-value="(v) => setLanguage(v as Lang)" />
      <p v-if="fromSpoolman" class="sm muted cur"><span class="sm muted">{{ t("currency.label") }}</span><br /><span class="num">{{ t("currency.fromSpoolman", { currency: fromSpoolman }) }}</span></p>
      <TextField v-else :model-value="code" :label="t('currency.label')" :maxlength="3" width="sm" upper :error="codeError" @update:model-value="setCode" />
    </div>
    <InlineAlert v-if="mismatch" tone="warn" :actions="[{ label: t('currency.fine'), run: () => patchSettings({ defaultsCurrency: currency }) }]">{{ t("currency.mismatch", { old: store.settings.defaultsCurrency ?? "" }) }}</InlineAlert>
  </div>
</template>

<style scoped>
.stack > * + * { margin-top: 12px; }
.cur { padding-top: 0; }
</style>
