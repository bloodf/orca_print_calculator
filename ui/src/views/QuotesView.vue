<script setup lang="ts">
// Saved quotes (docs/ux.md §5.3 QuotesView): search, reopen, duplicate, print, CSV, delete with undo. Frozen snapshots, never recomputed here.
import Button from "primevue/button";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import Menu from "primevue/menu";
import { computed, ref } from "vue";
import EmptyState from "../components/base/EmptyState.vue";
import Icon from "../components/base/Icon.vue";
import InlineAlert from "../components/base/InlineAlert.vue";
import { count, date, money, percent, quoteNo } from "../format";
import { intlLocale, t } from "../i18n";
import { exportQuote, printQuote } from "../quoteFlow";
import { deleteQuote, duplicateQuote, openQuote } from "../state/quotes";
import { setView, store } from "../state/store";
import type { IconName } from "../components/base/icons";
import type { SavedQuote } from "../state/types";

const q = ref("");
const loc = computed(() => intlLocale());
const sorted = computed(() => [...store.quotes].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : b.no - a.no)));
const shown = computed(() => {
  const needle = q.value.trim().toLowerCase();
  if (!needle) return sorted.value;
  return sorted.value.filter((x) => [x.title, x.customer, quoteNo(x.no, loc.value), String(x.no)].some((s) => s.toLowerCase().includes(needle)));
});
// The row menu is PrimeVue's popup Menu (menu/menuitem roles, arrow keys, Esc, focus back to the trigger); `target` is the row it was opened for.
const menu = ref<InstanceType<typeof Menu> | null>(null);
const target = ref<SavedQuote | null>(null);
const run = (fn: (x: SavedQuote) => unknown): void => { const x = target.value; if (x) void fn(x); };
const items = computed(() => [
  { key: "dup", label: t("quotes.duplicate"), icon: "copy", command: () => run((x) => duplicateQuote(x.id)) },
  { key: "print", label: t("quote.print"), icon: "print", command: () => run(printQuote) },
  { key: "csv", label: t("quote.csv"), icon: "download", command: () => run((x) => exportQuote("csv", x)) },
  { key: "del", label: t("quotes.delete"), icon: "trash", danger: true, command: () => run((x) => deleteQuote(x.id)) },
]);
function openMenu(quote: SavedQuote, e: Event): void { target.value = quote; menu.value?.toggle(e); }
const goCalc = (): void => setView("calc");
</script>

<template>
  <main class="quotes">
    <div class="head row">
      <h1 id="quotes-title" class="view-title" tabindex="-1" data-view-title>{{ t("quotes.title") }}</h1>
      <span class="muted num">{{ t("quotes.count", { n: store.quotes.length }) }}</span>
      <span class="grow" />
      <IconField v-if="store.quotes.length" class="search">
        <InputIcon><Icon name="search" /></InputIcon>
        <InputText v-model="q" type="search" :aria-label="t('quotes.search')" :placeholder="t('quotes.search')" fluid />
      </IconField>
    </div>
    <InlineAlert v-if="store.skippedQuotes" tone="warn" class="skipped"><p>{{ t("quotes.skipped", { n: store.skippedQuotes }) }}</p></InlineAlert>
    <EmptyState v-if="!store.quotes.length" art="quote" :title="t('empty.quote.title')" :body="t('empty.quote.body')">
      <template #actions><Button type="button" @click="goCalc">{{ t("empty.quote.action") }}</Button></template>
    </EmptyState>
    <p v-else-if="!shown.length" class="muted sm none" role="status">{{ t("quotes.noMatch", { q: q.trim() }) }}</p>
    <div v-else class="opc-table-wrap list">
      <table class="opc-table" aria-labelledby="quotes-title">
        <thead>
          <tr>
            <th scope="col">{{ t("quotes.col.no") }}</th><th scope="col">{{ t("quotes.col.title") }}</th><th scope="col">{{ t("quotes.col.customer") }}</th>
            <th scope="col" class="opt2">{{ t("quotes.col.date") }}</th><th scope="col" class="r opt2">{{ t("quotes.col.qty") }}</th><th scope="col" class="opt">{{ t("quotes.col.channel") }}</th>
            <th scope="col" class="r">{{ t("quotes.col.total") }}</th><th scope="col" class="r opt">{{ t("quotes.col.margin") }}</th><th scope="col"><span class="sr-only">{{ t("quotes.col.actions") }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="x in shown" :key="x.id">
            <td class="num">{{ quoteNo(x.no, loc) }}</td>
            <td class="truncate title">{{ x.title }}</td>
            <td class="truncate cust">{{ x.customer }}</td>
            <td class="num opt2">{{ date(x.updatedAt, loc) }}</td>
            <td class="num r opt2">{{ count(x.summary.quantity, loc) }}</td>
            <td class="truncate chan opt">{{ x.summary.channelName }}</td>
            <td class="num r">{{ money(x.summary.grandTotal, x.currency, loc) }}</td>
            <td class="num r muted opt">{{ percent(x.summary.marginBp, loc) }}</td>
            <td class="acts">
              <Button severity="secondary" outlined size="small" type="button" @click="openQuote(x.id)">{{ t("quotes.open") }}</Button>
              <Button text severity="secondary" type="button" class="icon-btn" :aria-label="t('quotes.more', { no: quoteNo(x.no, loc) })" aria-haspopup="menu" @click="openMenu(x, $event)"><Icon name="more" /></Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <Menu ref="menu" popup :model="items" :aria-label="target ? t('quotes.more', { no: quoteNo(target.no, loc) }) : t('quotes.col.actions')" class="opc-menu">
      <template #item="{ item, props }">
        <a v-bind="props.action" class="mi" :class="{ danger: (item as { danger?: boolean }).danger }"><Icon :name="(item as { icon: IconName }).icon" /><span>{{ item.label }}</span></a>
      </template>
    </Menu>
  </main>
</template>

<style scoped>
.quotes { padding: 16px; max-width: 1280px; margin: 0 auto; }
.head { margin-bottom: 12px; }
.head > * + * { margin-left: 12px; }
.grow { flex: 1; }
.search { display: block; width: 240px; max-width: 100%; }
.list { border: 1px solid var(--opc-border); border-radius: var(--opc-r-surface); background: var(--opc-raised); }
.list tbody tr:last-child td { border-bottom: 0; }
.list tbody tr:hover { background: var(--opc-hover); }
.title { max-width: 220px; } .cust { max-width: 160px; } .chan { max-width: 140px; }
.acts { text-align: right; white-space: nowrap; }
.acts > * + * { margin-left: 4px; }
/* narrow window or zoom: channel and margin give way so the Open button stays inside the window (both are on the opened quote) */
@media (max-width: 899px) { .opt { display: none; } }
@media (max-width: 699px) { .opt2 { display: none; } }
.none { text-align: center; padding: 24px 0; }
.mi { display: flex; align-items: center; gap: 8px; padding: 8px 12px; color: inherit; text-decoration: none; cursor: pointer; }
.mi.danger { color: var(--opc-bad); }
</style>
