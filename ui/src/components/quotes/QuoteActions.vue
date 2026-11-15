<script setup lang="ts">
// The quote's actions, in the price panel's footer: save, print, CSV, and the order total. A blocked print or export is
// disabled and points at its reason (the incomplete notice, or the line here), which is said once.
import Button from "primevue/button";
import { computed } from "vue";
import { OuiIcon } from "../../../shared/src/components";
import * as I from "../../../shared/src/icons";
import { intlLocale, t } from "../../i18n";
import { quoteNo } from "../../format";
import { exportBlock, exportQuote, isDirty, savedOf } from "../../quoteFlow";
import { saveBusy, saveQuote } from "../../state/quotes";
import { setView, store } from "../../state/store";
import { priced, m } from "../price/priceState";

const saved = computed(() => savedOf());
const dirty = computed(() => isDirty());
const blockKey = computed(() => exportBlock());
const gapBlock = computed(() => blockKey.value === "quote.blockedUnknown" || blockKey.value === "quote.blockedIncomplete");
// where a disabled Print or CSV finds its reason: the list of what is missing, else the line below
const why = computed(() => (!blockKey.value ? undefined : gapBlock.value ? "quote-gaps" : "qa-block"));
const no = computed(() => (saved.value ? quoteNo(saved.value.no, intlLocale()) : ""));
const total = computed(() => (priced.value && store.draft.quantity > 1 ? t("bar.total", { total: m(priced.value.grandTotal), n: store.draft.quantity }) : ""));
async function print(): Promise<void> {
  if (isDirty() && !(await saveQuote())) return;
  store.preview = true;
}
</script>

<template>
  <div class="qa">
    <div class="oui-row actions">
      <template v-if="!saved || dirty">
        <Button id="qa-save" type="button" :disabled="saveBusy" :aria-busy="saveBusy ? 'true' : undefined" @click="saveQuote()"><OuiIcon :icon="I.save" :size="14" /><span>{{ saved ? t("quote.saveChanges") : t("quote.save") }}</span></Button>
        <Button v-if="saved" text severity="secondary" type="button" :disabled="saveBusy" :aria-busy="saveBusy ? 'true' : undefined" @click="saveQuote(true)">{{ t("quote.saveAsNew") }}</Button>
      </template>
      <template v-else>
        <span class="oui-meta saved"><OuiIcon :icon="I.check" :size="14" tone="success" />{{ t("quote.savedAs", { no }) }}</span>
        <Button text severity="secondary" type="button" :disabled="saveBusy" @click="saveQuote(true)">{{ t("quote.saveAsNew") }}</Button>
        <Button text severity="secondary" type="button" @click="setView('quotes')">{{ t("quote.openList") }}</Button>
      </template>
      <Button severity="secondary" type="button" :disabled="!!blockKey" :aria-describedby="why" data-testid="print" @click="print">{{ t("quote.print") }}</Button>
      <Button severity="secondary" text type="button" :disabled="!!blockKey" :aria-describedby="why" data-testid="csv" @click="exportQuote('csv')"><OuiIcon :icon="I.download" :size="14" /><span>{{ t("quote.csv") }}</span></Button>
      <span v-if="total" class="oui-meta num total">{{ total }}</span>
    </div>
    <p v-if="blockKey && !gapBlock" id="qa-block" class="oui-meta" role="status">{{ t(blockKey) }}</p>
  </div>
</template>

<style scoped>
.qa { flex: 1 1 auto; display: grid; gap: var(--oui-s1); min-width: 0; }
.saved { display: inline-flex; align-items: center; gap: var(--oui-s1); }
.total { margin-inline-start: auto; }
</style>
