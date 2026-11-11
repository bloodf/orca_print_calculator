<script setup lang="ts">
// Settings › Quote sheet: logo, company details, payment, footer, accent, validity and numbering, with a live sample beside the form.
import { computed, ref } from "vue";
import { t } from "../../i18n";
import { logoFromFile } from "../../logoFile";
import { sampleSheetModel } from "../../quoteExport";
import { DEFAULT_ACCENT } from "../../state/sheet";
import { currency, patchSettings, store } from "../../state/store";
import { toast } from "../../state/toast";
import Icon from "../base/Icon.vue";
import NumberField from "../base/NumberField.vue";
import QuoteSheet from "../quotes/QuoteSheet.vue";
import TextField from "./TextField.vue";
import { UNIT } from "./units";

type Sheet = typeof store.settings.sheet;
const sheet = computed(() => store.settings.sheet);
const patchSheet = (patch: Partial<Sheet>): void => patchSettings((s) => ({ sheet: { ...s.sheet, ...patch } }));
const sample = computed(() => sampleSheetModel(sheet.value, currency.value));

const file = ref<HTMLInputElement | null>(null);
const busy = ref(false);
async function onPick(e: Event): Promise<void> {
  const el = e.target as HTMLInputElement;
  const f = el.files?.[0];
  el.value = ""; // the same file can be picked again
  if (!f) return;
  busy.value = true;
  const r = await logoFromFile(f);
  busy.value = false;
  if (r.ok) patchSheet({ logo: r.logo });
  else toast({ text: t(`sheet.logoError.${r.error}`), tone: "bad" });
}
function removeLogo(): void {
  const before = sheet.value.logo;
  patchSheet({ logo: "" });
  toast({ text: t("sheet.logoRemoved"), action: { label: t("common.undo"), run: () => patchSheet({ logo: before }) } });
}
</script>

<template>
  <div class="se">
    <div class="se-form">
      <fieldset class="se-group">
        <legend class="sm muted">{{ t("sheet.groupBrand") }}</legend>
        <div class="se-logo row">
          <span class="se-thumb" :class="{ empty: !sheet.logo }"><img v-if="sheet.logo" :src="sheet.logo" :alt="t('sheet.logo')"><Icon v-else name="upload" /></span>
          <div>
            <div class="row se-logo-btns">
              <button type="button" class="btn" :aria-busy="busy ? 'true' : undefined" @click="file?.click()"><Icon name="upload" /><span>{{ t(sheet.logo ? "sheet.logoReplace" : "sheet.logoAdd") }}</span></button>
              <button v-if="sheet.logo" type="button" class="btn ghost" @click="removeLogo"><Icon name="trash" /><span>{{ t("sheet.logoRemove") }}</span></button>
            </div>
            <p class="sm muted">{{ t("sheet.logoHelp") }}</p>
          </div>
          <input ref="file" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" tabindex="-1" aria-hidden="true" data-testid="logo-file" @change="onPick">
        </div>
        <div class="form-grid">
          <TextField :model-value="sheet.shopName" :label="t('sheet.shopName')" :maxlength="60" @update:model-value="(v) => patchSheet({ shopName: v })" />
          <TextField :model-value="sheet.taxId" :label="t('sheet.taxId')" :maxlength="40" :helper="t('sheet.taxIdHelp')" @update:model-value="(v) => patchSheet({ taxId: v })" />
          <div class="se-color">
            <label for="sheet-accent" class="sm muted">{{ t("sheet.accent") }}</label>
            <div class="row">
              <input id="sheet-accent" type="color" :value="sheet.accent" @input="(e) => patchSheet({ accent: (e.target as HTMLInputElement).value })">
              <button v-if="sheet.accent.toLowerCase() !== DEFAULT_ACCENT.toLowerCase()" type="button" class="btn ghost" @click="patchSheet({ accent: DEFAULT_ACCENT })">{{ t("sheet.accentReset") }}</button>
            </div>
          </div>
        </div>
      </fieldset>
      <fieldset class="se-group">
        <legend class="sm muted">{{ t("sheet.groupContact") }}</legend>
        <div class="form-grid">
          <TextField :model-value="sheet.phone" :label="t('sheet.phone')" :maxlength="40" @update:model-value="(v) => patchSheet({ phone: v })" />
          <TextField :model-value="sheet.email" :label="t('sheet.email')" :maxlength="80" @update:model-value="(v) => patchSheet({ email: v })" />
          <TextField :model-value="sheet.website" :label="t('sheet.website')" :maxlength="80" @update:model-value="(v) => patchSheet({ website: v })" />
        </div>
        <TextField :model-value="sheet.address" :label="t('sheet.address')" :maxlength="280" multiline :rows="2" @update:model-value="(v) => patchSheet({ address: v })" />
      </fieldset>
      <fieldset class="se-group">
        <legend class="sm muted">{{ t("sheet.groupTerms") }}</legend>
        <TextField :model-value="sheet.payment" :label="t('sheet.payment')" :maxlength="280" multiline :rows="2" :helper="t('sheet.paymentHelp')" @update:model-value="(v) => patchSheet({ payment: v })" />
        <TextField :model-value="sheet.footer" :label="t('sheet.footer')" :maxlength="280" multiline :rows="2" :helper="t('sheet.footerHelp')" @update:model-value="(v) => patchSheet({ footer: v })" />
        <div class="form-grid">
          <NumberField
            :model-value="sheet.validityDays" :label="t('sheet.validity')" :scale="1" :step="1" :max="3650" :unit="t('sheet.validityUnit')" :helper="t('sheet.validityHelp')"
            @update:model-value="(v) => v !== null && patchSheet({ validityDays: v })"
          />
          <NumberField :model-value="sheet.nextNo" :label="t('sheet.nextNo')" :scale="1" :step="1" :min="1" :max="999999" @update:model-value="(v) => v !== null && patchSheet({ nextNo: v })" />
        </div>
      </fieldset>
    </div>
    <div class="se-preview">
      <p class="sm muted">{{ t("sheet.previewLabel") }}</p>
      <QuoteSheet :model="sample" />
    </div>
  </div>
</template>

<style scoped>
.hidden { display: none; }
.se-group { border: 0; margin: 0 0 20px; padding: 0; min-width: 0; }
.se-group > legend { padding: 0; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
.se-group > * + * { margin-top: 12px; }
.se-logo > * + * { margin-left: 12px; }
.se-logo-btns > * + * { margin-left: 8px; }
.se-thumb { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 96px; height: 56px; padding: 4px; background: #FFFFFF; border: 1px solid var(--opc-border); border-radius: var(--opc-r-control); color: #5C6664; }
.se-thumb.empty { border-style: dashed; }
.se-thumb img { max-width: 100%; max-height: 100%; }
.se-color label { display: block; min-height: 24px; line-height: 24px; }
.se-color input { width: 44px; height: 28px; padding: 2px; }
.se-color .row > * + * { margin-left: 8px; }
.se-preview > p { margin-bottom: 6px; }
.se-preview :deep(.quote-sheet) { width: 100%; margin: 0; padding: 20px; font-size: 9.5pt; }
@media (min-width: 1280px) {
  .se { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-column-gap: 24px; align-items: start; }
  .se-preview { position: sticky; top: calc(var(--opc-header-h) + 12px); }
}
</style>
