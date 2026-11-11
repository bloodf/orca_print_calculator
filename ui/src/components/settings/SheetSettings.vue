<script setup lang="ts">
// Settings › Quote sheet: shop name, footer, validity, next number (docs/ux.md §5.3 Settings 7).
import { t } from "../../i18n";
import { patchSettings, store } from "../../state/store";
import NumberField from "../base/NumberField.vue";
import TextField from "./TextField.vue";
import { UNIT } from "./units";

const patchSheet = (patch: Partial<typeof store.settings.sheet>): void => patchSettings((s) => ({ sheet: { ...s.sheet, ...patch } }));
</script>

<template>
  <div class="stack">
    <TextField :model-value="store.settings.sheet.shopName" :label="t('sheet.shopName')" :maxlength="60" width="md" @update:model-value="(v) => patchSheet({ shopName: v })" />
    <TextField :model-value="store.settings.sheet.footer" :label="t('sheet.footer')" :maxlength="280" multiline :rows="3" :helper="t('sheet.footerHelp')" @update:model-value="(v) => patchSheet({ footer: v })" />
    <div class="form-grid">
      <NumberField
        :model-value="store.settings.sheet.validityDays" :label="t('sheet.validity')" :scale="1" :step="1" :max="3650" :unit="t('sheet.validityUnit')" :helper="t('sheet.validityHelp')"
        @update:model-value="(v) => v !== null && patchSheet({ validityDays: v })"
      />
      <NumberField :model-value="store.settings.sheet.nextNo" :label="t('sheet.nextNo')" :scale="1" :step="1" :min="1" :max="999999" @update:model-value="(v) => v !== null && patchSheet({ nextNo: v })" />
    </div>
  </div>
</template>

<style scoped>
.stack > * + * { margin-top: 12px; }
</style>
