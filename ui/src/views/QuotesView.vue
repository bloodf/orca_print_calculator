<script setup lang="ts">
// Saved quotes: search, reopen, duplicate, print, CSV, delete with undo. Frozen snapshots, never recomputed here.
import Button from "primevue/button";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import Menu from "primevue/menu";
import { computed, ref } from "vue";
import { OuiBanner, OuiEmpty, OuiIcon, OuiPanel, OuiToolbar, type OuiIconData } from "../../shared/src/components";
import * as I from "../../shared/src/icons";
import { lead } from "../components/base/lead";
import { count, date, money, percent, quoteNo } from "../format";
import { intlLocale, t } from "../i18n";
import { exportQuote, exportQuoteList, printQuote } from "../quoteFlow";
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
// The row menu is PrimeVue's popup Menu (menu/menuitem roles, arrow keys, Esc, focus back to the trigger); `target` is the row it was opened for.
const menu = ref<InstanceType<typeof Menu> | null>(null);
const target = ref<SavedQuote | null>(null);
const run = (fn: (x: SavedQuote) => unknown): void => { const x = target.value; if (x) void fn(x); };
const items = computed(() => [
  { key: "dup", label: t("quotes.duplicate"), icon: I.copy, command: () => run((x) => duplicateQuote(x.id)) },
  { key: "print", label: t("quote.print"), icon: I.file, command: () => run(printQuote) },
  { key: "csv", label: t("quote.csv"), icon: I.download, command: () => run((x) => exportQuote("csv", x)) },
  { key: "del", label: t("quotes.delete"), icon: I.trash, danger: true, command: () => run((x) => deleteQuote(x.id)) },
]);
function openMenu(quote: SavedQuote, e: Event): void { target.value = quote; menu.value?.toggle(e); }
const goCalc = (): void => setView("calc");
const skipped = computed(() => lead(t("quotes.skipped", { n: store.skippedQuotes })));
</script>

<template>
  <main class="oui-page quotes" tabindex="-1">
    <OuiBanner v-if="store.skippedQuotes" class="skipped" tone="warn" :title="skipped[0]">{{ skipped[1] }}</OuiBanner>
    <OuiPanel class="q-panel" :icon="I.receipt" tone="accent" flush :meta="t('quotes.count', { n: store.quotes.length })" aria-labelledby="quotes-title">
      <template #title><span id="quotes-title" tabindex="-1" data-view-title>{{ t("quotes.title") }}</span></template>
      <OuiToolbar v-if="store.quotes.length" :label="t('quotes.title')" :summary="q.trim() && shown.length ? t('quotes.count', { n: shown.length }) : undefined">
        <IconField class="search">
          <InputIcon><OuiIcon :icon="I.search" :size="14" /></InputIcon>
          <InputText v-model="q" type="search" size="small" :aria-label="t('quotes.search')" :placeholder="t('quotes.search')" fluid />
        </IconField>
        <template v-if="shown.length" #end>
          <Button severity="secondary" size="small" type="button" :title="t('quotes.exportListHelp')" @click="exportQuoteList(shown)"><OuiIcon :icon="I.download" :size="14" /><span>{{ t("quotes.exportList") }}</span></Button>
        </template>
      </OuiToolbar>
      <OuiEmpty v-if="!store.quotes.length" :icon="I.receipt" :title="t('empty.quote.title')" :text="t('empty.quote.body')">
        <template #actions><Button type="button" @click="goCalc"><OuiIcon :icon="I.calculator" :size="14" /><span>{{ t("empty.quote.action") }}</span></Button></template>
      </OuiEmpty>
      <div v-else-if="!shown.length" class="none" role="status"><OuiEmpty compact :icon="I.search" tone="neutral" :title="t('quotes.noMatch', { q: q.trim() })" /></div>
      <div v-else class="opc-table-wrap list">
        <table class="opc-table" aria-labelledby="quotes-title">
          <thead>
            <tr>
              <th scope="col">{{ t("quotes.col.no") }}</th><th scope="col">{{ t("quotes.col.title") }}</th>
              <th scope="col" class="opt2">{{ t("quotes.col.date") }}</th><th scope="col" class="r opt2">{{ t("quotes.col.qty") }}</th><th scope="col" class="opt">{{ t("quotes.col.channel") }}</th>
              <th scope="col" class="r">{{ t("quotes.col.total") }}</th><th scope="col" class="r opt">{{ t("quotes.col.margin") }}</th><th scope="col"><span class="oui-sr">{{ t("quotes.col.actions") }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="x in shown" :key="x.id">
              <td class="num no">{{ quoteNo(x.no, loc) }}</td>
              <td><div class="what"><span class="oui-strong oui-truncate title" :title="x.title">{{ x.title }}</span><span class="oui-meta oui-truncate cust">{{ x.customer || "—" }}</span></div></td>
              <td class="num opt2">{{ date(x.updatedAt, loc) }}</td>
              <td class="num r opt2">{{ count(x.summary.quantity, loc) }}</td>
              <td class="opt"><span class="oui-chip chan">{{ x.summary.channelName }}</span></td>
              <td class="num r oui-strong">{{ money(x.summary.grandTotal, x.currency, loc) }}</td>
              <td class="num r oui-muted opt">{{ percent(x.summary.marginBp, loc) }}</td>
              <td class="acts">
                <Button severity="secondary" size="small" type="button" @click="openQuote(x.id)">{{ t("quotes.open") }}</Button>
                <Button text severity="secondary" type="button" class="icon-btn-sm" :aria-label="t('quotes.more', { no: quoteNo(x.no, loc) })" aria-haspopup="menu" @click="openMenu(x, $event)"><OuiIcon :icon="I.more" /></Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </OuiPanel>
    <Menu ref="menu" popup :model="items" :aria-label="target ? t('quotes.more', { no: quoteNo(target.no, loc) }) : t('quotes.col.actions')" class="opc-menu">
      <template #item="{ item, props }">
        <a v-bind="props.action" class="mi" :class="{ danger: (item as { danger?: boolean }).danger }"><OuiIcon :icon="(item as { icon: OuiIconData }).icon" :size="14" /><span>{{ item.label }}</span></a>
      </template>
    </Menu>
  </main>
</template>

<style scoped>
.quotes:focus { outline: none; }
.q-panel { width: 100%; max-width: 1280px; margin-inline: auto; }
.skipped { width: 100%; max-width: 1280px; margin-inline: auto; }
.what { display: grid; gap: 1px; max-width: 340px; min-width: 0; }
.what > * { display: block; }
.acts { text-align: end; white-space: nowrap; }
.acts > * + * { margin-inline-start: 4px; }
.list tbody tr:hover { background: var(--oui-raised); }
/* narrow window or zoom: channel and margin give way so the Open button stays inside the window (both are on the opened quote) */
@container oui-page (max-width: 860px) { .opt { display: none; } }
@container oui-page (max-width: 660px) { .opt2 { display: none; } }
.none { padding: var(--oui-s2) var(--oui-s3); }
.mi { display: flex; align-items: center; gap: 8px; padding: 6px 12px; color: inherit; text-decoration: none; cursor: pointer; }
.mi.danger { color: var(--oui-danger); }
</style>
