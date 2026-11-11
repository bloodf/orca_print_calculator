<script setup lang="ts">
// In-tab quote preview, a sub-state of Calculator (docs/ux.md §5.3). Only the sheet prints (theme.css hides .app-chrome).
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "../base/Icon.vue";
import InlineAlert from "../base/InlineAlert.vue";
import Segmented from "../base/Segmented.vue";
import { t } from "../../i18n";
import { exportQuote, savedOf } from "../../quoteFlow";
import { buildSheetModel } from "../../quoteExport";
import { currency, derived, patchSettings, plateOrigin, store } from "../../state/store";
import { gotoSettings } from "../costs/shared";
import QuoteSheet from "./QuoteSheet.vue";

const mode = computed({
  get: () => store.settings.ui.sheetMode,
  set: (v) => patchSettings((s) => ({ ui: { ...s.ui, sheetMode: v } })),
});
const now = new Date().toISOString();
const model = computed(() => {
  const d = derived.value;
  const sel = d.selected;
  if (!d.result.ok || !sel || !sel.ok) return null;
  const saved = savedOf();
  return buildSheetModel({
    no: saved?.no ?? null, dateIso: saved?.updatedAt ?? now, title: store.draft.title || store.host.projectName || "",
    customer: store.draft.customer, note: store.draft.note, currency: saved?.currency ?? currency.value,
    plates: d.quoteInput.plates, quantity: store.draft.quantity, result: d.result, selected: sel,
    sheet: { ...store.settings.sheet, ...saved?.sheet }, itemized: mode.value === "itemized",
  });
});
const stale = computed(() => !store.draft.frozenPlates && store.plates.some((p) => p.stale));
const imported = computed(() => plateOrigin.value === "import");
const back = ref<HTMLButtonElement | null>(null);
const printNow = (): void => window.print();
const close = () => { store.preview = false; };
const editDetails = (): void => { close(); gotoSettings("settings-sheet"); };
function onKey(e: KeyboardEvent): void { if (e.key === "Escape") close(); }
onMounted(() => { back.value?.focus(); document.addEventListener("keydown", onKey); });
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <main class="preview" :aria-label="t('quote.print')">
    <div class="toolbar app-chrome">
      <button ref="back" type="button" class="btn ghost" @click="close"><Icon name="arrow-left" />{{ t("sheet.back") }}</button>
      <Segmented v-model="mode" :label="t('quote.print')" :options="[{ value: 'itemized', label: t('sheet.itemized') }, { value: 'summary', label: t('sheet.summary') }]" />
      <span class="grow" />
      <span v-if="savedOf()?.sheet" class="sm muted">{{ t("sheet.frozenHint") }}</span>
      <button type="button" class="btn ghost" @click="editDetails"><Icon name="pencil" />{{ t("sheet.editDetails") }}</button>
      <button type="button" class="btn" @click="exportQuote('html')"><Icon name="download" />{{ t("sheet.saveHtml") }}</button>
      <button type="button" class="btn primary" @click="printNow"><Icon name="print" />{{ t("sheet.printPdf") }}</button>
    </div>
    <div v-if="stale" class="warn app-chrome"><InlineAlert tone="warn">{{ t("sheet.staleWarning") }}</InlineAlert></div>
    <div v-if="imported" class="warn app-chrome"><InlineAlert tone="info">{{ t("sheet.importedWarning") }}</InlineAlert></div>
    <QuoteSheet v-if="model" :model="model" />
    <p v-else class="muted sm app-chrome none">{{ t("quote.blockedNoPrice") }}</p>
  </main>
</template>

<style scoped>
.preview { min-height: calc(100vh - var(--opc-header-h)); background: var(--opc-raised); padding-bottom: 32px; }
.toolbar { display: flex; align-items: center; flex-wrap: wrap; min-height: 44px; padding: 6px 12px; background: var(--opc-bg); border-bottom: 1px solid var(--opc-border); margin-bottom: 16px; }
.toolbar > * + * { margin-left: 8px; }
.grow { flex: 1; }
.warn { width: 720px; max-width: calc(100% - 24px); margin: 0 auto 12px; }
.none { text-align: center; padding: 24px; }
.preview > .quote-sheet { margin-bottom: 0; }
@media (max-width: 759px) { .preview > :deep(.quote-sheet) { max-width: calc(100% - 24px); } }
</style>

<style>
@media print {
  @page { margin: 16mm; }
  html, body { background: #FFFFFF !important; height: auto !important; overflow: visible !important; }
  .preview { background: none !important; min-height: 0 !important; padding: 0 !important; }
}
</style>
