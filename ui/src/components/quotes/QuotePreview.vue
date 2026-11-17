<script setup lang="ts">
// In-tab quote preview, a sub-state of Calculator (docs/ux.md §5.3). Only the sheet prints (theme.css hides .app-chrome).
import Button from "primevue/button";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { elOf } from "../base/el";
import { OuiBanner, OuiIcon } from "../../../shared/src/components";
import * as I from "../../../shared/src/icons";
import { lead } from "../base/lead";
import Segmented from "../base/Segmented.vue";
import { t } from "../../i18n";
import { exportBlock, exportQuote, savedOf } from "../../quoteFlow";
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
// Same barrier as the Print and CSV buttons: an incomplete quote never reaches a sheet, a file or a printer.
const block = computed(() => exportBlock());
const stale = computed(() => !store.draft.frozenPlates && store.plates.some((p) => p.stale));
const imported = computed(() => plateOrigin.value === "import");
const staleKey = computed(() => store.plates.filter((p) => p.stale).map((p) => p.index).join(","));
const importKey = computed(() => store.plates.find((p) => p.source === "file")?.fileName ?? "");
const back = ref<HTMLElement | null>(null);
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
      <Button :ref="(c) => (back = elOf(c))" text type="button" @click="close"><OuiIcon :icon="I.chevronRight" class="back-chev" /><span>{{ t("sheet.back") }}</span></Button>
      <Segmented v-model="mode" :label="t('quote.print')" :options="[{ value: 'itemized', label: t('sheet.itemized') }, { value: 'summary', label: t('sheet.summary') }]" />
      <span class="grow" />
      <span v-if="savedOf()?.sheet" class="sm oui-muted">{{ t("sheet.frozenHint") }}</span>
      <Button text type="button" @click="editDetails"><OuiIcon :icon="I.edit" /><span>{{ t("sheet.editDetails") }}</span></Button>
      <template v-if="!block">
        <Button severity="secondary" type="button" @click="exportQuote('html')"><OuiIcon :icon="I.download" /><span>{{ t("sheet.saveHtml") }}</span></Button>
        <Button type="button" @click="printNow"><OuiIcon :icon="I.file" /><span>{{ t("sheet.printPdf") }}</span></Button>
      </template>
    </div>
    <OuiBanner v-if="stale" class="warn app-chrome" tone="warn" dismissible :dismiss-key="`preview-stale:${staleKey}`" :close-label="t('common.close')" :title="lead(t('sheet.staleWarning'))[0]">{{ lead(t("sheet.staleWarning"))[1] }}</OuiBanner>
    <OuiBanner v-if="imported" class="warn app-chrome" tone="info" dismissible :dismiss-key="`preview-imported:${importKey}`" :close-label="t('common.close')" :title="lead(t('sheet.importedWarning'))[0]">{{ lead(t("sheet.importedWarning"))[1] }}</OuiBanner>
    <QuoteSheet v-if="model && !block" :model="model" />
    <p v-else class="oui-muted sm app-chrome none" role="status">{{ t(block || "quote.blockedNoPrice") }}</p>
  </main>
</template>

<style scoped>
.preview { min-height: calc(100vh - 52px); background: var(--oui-background); padding-bottom: 32px; }
.toolbar { display: flex; align-items: center; flex-wrap: wrap; min-height: 44px; padding: 6px 12px; background: var(--oui-surface); border-bottom: 1px solid var(--oui-border); margin-bottom: 16px; }
.toolbar > * + * { margin-left: 8px; }
.grow { flex: 1; }
/* foundation-gap: the icon set has no chevronLeft/arrowLeft; 4.0.2 should add one. Until then the right chevron is mirrored, which
   points back in left-to-right text; in a right-to-left page it is drawn as is, so it still points back. */
.back-chev { transform: scaleX(-1); }
:dir(rtl) .back-chev { transform: none; }
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
