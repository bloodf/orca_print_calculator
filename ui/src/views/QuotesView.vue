<script setup lang="ts">
// Saved quotes (docs/ux.md §5.3 QuotesView): search, reopen, duplicate, print, CSV, delete with undo. Frozen snapshots, never recomputed here.
import { computed, ref } from "vue";
import EmptyState from "../components/base/EmptyState.vue";
import Icon from "../components/base/Icon.vue";
import InlineAlert from "../components/base/InlineAlert.vue";
import Popover from "../components/base/Popover.vue";
import { count, date, money, percent, quoteNo } from "../format";
import { intlLocale, t } from "../i18n";
import { exportQuote, printQuote } from "../quoteFlow";
import { deleteQuote, duplicateQuote, openQuote } from "../state/quotes";
import { setView, store } from "../state/store";
import type { SavedQuote } from "../state/types";

const q = ref("");
const loc = computed(() => intlLocale());
const sorted = computed(() => [...store.quotes].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : b.no - a.no)));
const shown = computed(() => {
  const needle = q.value.trim().toLowerCase();
  if (!needle) return sorted.value;
  return sorted.value.filter((x) => [x.title, x.customer, quoteNo(x.no, loc.value), String(x.no)].some((s) => s.toLowerCase().includes(needle)));
});
const menu = ref<{ quote: SavedQuote; anchor: HTMLElement } | null>(null);
function toggle(quote: SavedQuote, e: Event): void {
  const anchor = e.currentTarget as HTMLElement;
  menu.value = menu.value?.quote.id === quote.id ? null : { quote, anchor };
}
function run(fn: (x: SavedQuote) => unknown): void {
  const x = menu.value?.quote;
  menu.value = null;
  if (x) void fn(x);
}
const goCalc = (): void => setView("calc");
</script>

<template>
  <main class="quotes">
    <div class="head row">
      <h1 id="quotes-title" class="view-title" tabindex="-1">{{ t("quotes.title") }}</h1>
      <span class="muted num">{{ t("quotes.count", { n: store.quotes.length }) }}</span>
      <span class="grow" />
      <label v-if="store.quotes.length" class="search">
        <Icon name="search" />
        <input v-model="q" type="search" :aria-label="t('quotes.search')" :placeholder="t('quotes.search')">
      </label>
    </div>
    <InlineAlert v-if="store.skippedQuotes" tone="warn" class="skipped"><p>{{ t("quotes.skipped", { n: store.skippedQuotes }) }}</p></InlineAlert>
    <EmptyState v-if="!store.quotes.length" art="quote" :title="t('empty.quote.title')" :body="t('empty.quote.body')">
      <template #actions><button type="button" class="btn primary" @click="goCalc">{{ t("empty.quote.action") }}</button></template>
    </EmptyState>
    <p v-else-if="!shown.length" class="muted sm none" role="status">{{ t("quotes.noMatch", { q: q.trim() }) }}</p>
    <div v-else class="wrap">
      <table aria-labelledby="quotes-title">
        <thead>
          <tr>
            <th scope="col">{{ t("quotes.col.no") }}</th><th scope="col">{{ t("quotes.col.title") }}</th><th scope="col">{{ t("quotes.col.customer") }}</th>
            <th scope="col">{{ t("quotes.col.date") }}</th><th scope="col" class="r">{{ t("quotes.col.qty") }}</th><th scope="col">{{ t("quotes.col.channel") }}</th>
            <th scope="col" class="r">{{ t("quotes.col.total") }}</th><th scope="col" class="r">{{ t("quotes.col.margin") }}</th><th scope="col" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="x in shown" :key="x.id">
            <td class="num">{{ quoteNo(x.no, loc) }}</td>
            <td class="truncate title">{{ x.title }}</td>
            <td class="truncate cust">{{ x.customer }}</td>
            <td class="num">{{ date(x.updatedAt, loc) }}</td>
            <td class="num r">{{ count(x.summary.quantity, loc) }}</td>
            <td class="truncate chan">{{ x.summary.channelName }}</td>
            <td class="num r">{{ money(x.summary.grandTotal, x.currency, loc) }}</td>
            <td class="num r muted">{{ percent(x.summary.marginBp, loc) }}</td>
            <td class="acts">
              <button type="button" class="btn" @click="openQuote(x.id)">{{ t("quotes.open") }}</button>
              <button type="button" class="btn icon" :aria-label="t('quotes.more', { no: quoteNo(x.no, loc) })" aria-haspopup="dialog" :aria-expanded="menu?.quote.id === x.id" @click="toggle(x, $event)"><Icon name="more" /></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <Popover :open="!!menu" :anchor="menu?.anchor ?? null" :label="menu ? t('quotes.more', { no: quoteNo(menu.quote.no, loc) }) : ''" @close="menu = null">
      <div class="menu">
        <button type="button" class="btn ghost" @click="run((x) => duplicateQuote(x.id))"><Icon name="copy" />{{ t("quotes.duplicate") }}</button>
        <button type="button" class="btn ghost" @click="run(printQuote)"><Icon name="print" />{{ t("quote.print") }}</button>
        <button type="button" class="btn ghost" @click="run((x) => exportQuote('csv', x))"><Icon name="download" />{{ t("quote.csv") }}</button>
        <button type="button" class="btn ghost danger" @click="run((x) => deleteQuote(x.id))"><Icon name="trash" />{{ t("quotes.delete") }}</button>
      </div>
    </Popover>
  </main>
</template>

<style scoped>
.quotes { padding: 16px; max-width: 1280px; margin: 0 auto; }
.head { margin-bottom: 12px; }
.head > * + * { margin-left: 12px; }
.grow { flex: 1; }
.search { position: relative; display: block; width: 240px; max-width: 100%; }
.search svg { position: absolute; left: 8px; top: 6px; color: var(--opc-muted); pointer-events: none; }
.search input { width: 100%; padding-left: 30px; }
.wrap { overflow-x: auto; border: 1px solid var(--opc-border); border-radius: var(--opc-r-surface); }
table { width: 100%; border-collapse: collapse; }
td { height: 36px; padding: 0 8px; border-bottom: 1px solid var(--opc-border); }
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover { background: var(--opc-hover); }
th.r, td.r { text-align: right; }
.title { max-width: 220px; } .cust { max-width: 160px; } .chan { max-width: 140px; }
.acts { text-align: right; white-space: nowrap; }
.acts > * + * { margin-left: 4px; }
.none { text-align: center; padding: 24px 0; }
.menu { display: grid; margin: -6px; }
.menu .btn { justify-content: flex-start; }
</style>
