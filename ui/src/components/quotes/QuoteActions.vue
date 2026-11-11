<script setup lang="ts">
// Save / print / CSV row of the price panel (docs/ux.md §5.3 QuoteActions). Blocked exports show a reason, never a disabled button.
import { computed, nextTick, ref } from "vue";
import Icon from "../base/Icon.vue";
import { intlLocale, t } from "../../i18n";
import { quoteNo } from "../../format";
import { exportBlock, exportQuote, isDirty, savedOf } from "../../quoteFlow";
import { saveBusy, saveQuote } from "../../state/quotes";
import { patchDraft, store } from "../../state/store";

const draft = computed(() => store.draft);
const saved = computed(() => savedOf());
const dirty = computed(() => isDirty());
const blocked = computed(() => { const k = exportBlock(); return k ? t(k) : ""; });
const open = ref(false);
const showMore = computed(() => open.value || !!draft.value.customer || !!draft.value.note);
const customer = ref<HTMLInputElement | null>(null);
async function reveal(): Promise<void> { open.value = true; await nextTick(); customer.value?.focus(); }
const no = computed(() => (saved.value ? quoteNo(saved.value.no, intlLocale()) : ""));
const onInput = (key: "title" | "customer" | "note", e: Event): void => patchDraft({ [key]: (e.target as HTMLInputElement).value });
async function print(): Promise<void> {
  if (isDirty() && !(await saveQuote())) return;
  store.preview = true;
}
</script>

<template>
  <div class="qa">
    <div class="field">
      <label class="sm muted" for="qa-title">{{ t("quote.title") }}</label>
      <input id="qa-title" type="text" :value="draft.title" :placeholder="store.host.projectName ?? ''" @input="onInput('title', $event)">
    </div>
    <button v-if="!showMore" type="button" class="btn ghost add" @click="reveal"><Icon name="plus" />{{ t("quote.addCustomer") }}</button>
    <template v-else>
      <div class="field">
        <label class="sm muted" for="qa-customer">{{ t("quote.customer") }}</label>
        <input id="qa-customer" ref="customer" type="text" :value="draft.customer" @input="onInput('customer', $event)">
      </div>
      <div class="field">
        <label class="sm muted" for="qa-note">{{ t("quote.note") }}</label>
        <textarea id="qa-note" rows="2" :value="draft.note" @input="onInput('note', $event)" />
      </div>
    </template>
    <div class="row actions">
      <template v-if="!saved || dirty">
        <button type="button" class="btn primary" :disabled="saveBusy" :aria-busy="saveBusy ? 'true' : undefined" @click="saveQuote()">{{ saved ? t("quote.saveChanges") : t("quote.save") }}</button>
        <button v-if="saved" type="button" class="btn ghost" :disabled="saveBusy" :aria-busy="saveBusy ? 'true' : undefined" @click="saveQuote(true)">{{ t("quote.saveAsNew") }}</button>
      </template>
      <template v-else>
        <span class="sm muted">{{ t("quote.savedAs", { no }) }}</span>
        <button type="button" class="btn ghost" :disabled="saveBusy" @click="saveQuote(true)">{{ t("quote.saveAsNew") }}</button>
      </template>
    </div>
    <p v-if="blocked" class="sm muted" role="status">{{ blocked }}</p>
    <div v-else class="row actions">
      <button type="button" class="btn" @click="print"><Icon name="print" />{{ t("quote.print") }}</button>
      <button type="button" class="btn" @click="exportQuote('csv')"><Icon name="download" />{{ t("quote.csv") }}</button>
    </div>
  </div>
</template>

<style scoped>
.qa > * + * { margin-top: 8px; }
.field { display: grid; grid-row-gap: 2px; }
.field input, .field textarea { width: 100%; }
.add { justify-self: start; margin-left: -8px; }
.actions { flex-wrap: wrap; }
</style>
