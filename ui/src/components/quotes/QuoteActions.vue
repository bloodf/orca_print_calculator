<script setup lang="ts">
// Save / print / CSV row of the price panel (docs/ux.md §5.3 QuoteActions). Blocked exports show a reason, never a disabled button.
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import { computed, nextTick, ref } from "vue";
import { elOf } from "../base/el";
import Icon from "../base/Icon.vue";
import { intlLocale, t } from "../../i18n";
import { quoteNo } from "../../format";
import { exportBlock, exportQuote, isDirty, savedOf } from "../../quoteFlow";
import { saveBusy, saveQuote } from "../../state/quotes";
import { patchDraft, setView, store } from "../../state/store";
import GapList from "./GapList.vue";

const draft = computed(() => store.draft);
const saved = computed(() => savedOf());
const dirty = computed(() => isDirty());
const blockKey = computed(() => exportBlock());
const gapBlock = computed(() => blockKey.value === "quote.blockedUnknown" || blockKey.value === "quote.blockedIncomplete");
const open = ref(false);
const showMore = computed(() => open.value || !!draft.value.customer || !!draft.value.note);
const customer = ref<HTMLElement | null>(null);
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
      <InputText id="qa-title" type="text" :model-value="draft.title" :placeholder="store.host.projectName ?? ''" fluid @input="onInput('title', $event)" />
    </div>
    <Button v-if="!showMore" text type="button" class="add" @click="reveal"><Icon name="plus" /><span>{{ t("quote.addCustomer") }}</span></Button>
    <template v-else>
      <div class="field">
        <label class="sm muted" for="qa-customer">{{ t("quote.customer") }}</label>
        <InputText id="qa-customer" :ref="(c) => (customer = elOf(c))" type="text" :model-value="draft.customer" fluid @input="onInput('customer', $event)" />
      </div>
      <div class="field">
        <label class="sm muted" for="qa-note">{{ t("quote.note") }}</label>
        <Textarea id="qa-note" rows="2" auto-resize :model-value="draft.note" fluid @input="onInput('note', $event)" />
      </div>
    </template>
    <div class="row actions">
      <template v-if="!saved || dirty">
        <Button id="qa-save" type="button" :disabled="saveBusy" :aria-busy="saveBusy ? 'true' : undefined" @click="saveQuote()">{{ saved ? t("quote.saveChanges") : t("quote.save") }}</Button>
        <Button v-if="saved" text type="button" :disabled="saveBusy" :aria-busy="saveBusy ? 'true' : undefined" @click="saveQuote(true)">{{ t("quote.saveAsNew") }}</Button>
      </template>
      <template v-else>
        <span class="sm muted">{{ t("quote.savedAs", { no }) }}</span>
        <Button text type="button" :disabled="saveBusy" @click="saveQuote(true)">{{ t("quote.saveAsNew") }}</Button>
        <Button text type="button" @click="setView('quotes')">{{ t("quote.openList") }}</Button>
      </template>
    </div>
    <GapList v-if="gapBlock" />
    <p v-else-if="blockKey" class="sm muted" role="status">{{ t(blockKey) }}</p>
    <div v-else class="row actions">
      <Button severity="secondary" outlined type="button" @click="print"><Icon name="print" /><span>{{ t("quote.print") }}</span></Button>
      <Button severity="secondary" outlined type="button" @click="exportQuote('csv')"><Icon name="download" /><span>{{ t("quote.csv") }}</span></Button>
    </div>
  </div>
</template>

<style scoped>
.qa > * + * { margin-top: 8px; }
.field { display: grid; grid-row-gap: 4px; }
.add { justify-self: start; margin-left: -8px; }
.actions { flex-wrap: wrap; }
</style>
