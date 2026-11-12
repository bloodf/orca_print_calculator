<script setup lang="ts">
// Extras rows + "+ Extra" catalog menu (docs/ux.md §5.3). Rows are per-quote; removing a row offers Undo.
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Menu from "primevue/menu";
import Message from "primevue/message";
import { computed, nextTick, ref } from "vue";
import { intlLocale, t } from "../../i18n";
import { money } from "../../format";
import { currency, derived, digits, patchDraft, patchSettings, store } from "../../state/store";
import { catalogItemOf, demandByItem, planOf } from "../../state/extrasDemand";
import { toast } from "../../state/toast";
import type { CatalogExtra, QuoteExtra } from "../../state/types";
import Icon from "../base/Icon.vue";
import MoneyField from "../base/MoneyField.vue";
import NumberField from "../base/NumberField.vue";
import { elOf } from "../base/el";
import SelectField from "./SelectField.vue";
import { newKey, smallStep } from "./shared";

type Per = QuoteExtra["per"];
const rows = computed(() => store.draft.extras);
const catalog = computed(() => store.settings.extrasCatalog);
const pers = computed(() => (["piece", "plate", "order"] as Per[]).map((value) => ({ value, label: t(`extra.per.${value}`) })));
const addBtn = ref<HTMLElement | null>(null);
const menu = ref<InstanceType<typeof Menu> | null>(null);
const touched = ref<Set<string>>(new Set());
const m = (n: number) => money(n, currency.value, intlLocale());

const setRows = (extras: QuoteExtra[]) => patchDraft({ extras });
const patchRow = (key: string, patch: Partial<QuoteExtra>) => setRows(rows.value.map((r) => (r.key === key ? { ...r, ...patch } : r)));
const inCatalog = (r: QuoteExtra) => catalog.value.some((c) => c.label === r.label); // by name: a renamed row can be saved as a new item
const units = (e3: number): string => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 3 }).format(e3 / 1000);
// What the whole quote needs of each catalog item (every row of it, every scope), computed once per change.
const demand = computed(() => demandByItem(rows.value, catalog.value, planOf(derived.value.quoteInput)));
/** Stock of the matching catalog item, and a shortage line when the quote's total need of that item exceeds it. Nothing is deducted. */
function stockOf(r: QuoteExtra): { have: string; short: string } | null {
  const item = catalogItemOf(r, catalog.value);
  const have = item?.stockE3;
  if (!item || typeof have !== "number") return null;
  const need = demand.value.get(item.key) ?? 0;
  return { have: units(have), short: need > have ? t("extras.short", { need: units(need), have: units(have) }) : "" };
}

async function add(base: Omit<QuoteExtra, "key">): Promise<void> {
  setRows([...rows.value, { ...base, key: newKey("x") }]);
  await nextTick();
  const names = document.querySelectorAll<HTMLInputElement>("[data-extra-name]");
  if (!base.label) names[names.length - 1]?.focus();
}
const addCatalog = (c: CatalogExtra) => add({ label: c.label, unitMinor: c.unitMinor, qtyE3: c.qtyE3, per: c.per, catalogKey: c.key });
const addCustom = () => add({ label: "", unitMinor: 0, qtyE3: 1000, per: "piece" });

/** Keyboard focus must not fall to the page when the focused control goes away: land on the neighbouring row, else on "+ Extra". */
async function focusAfterRemove(at: number): Promise<void> {
  await nextTick();
  const names = document.querySelectorAll<HTMLInputElement>("[data-extra-name]");
  (names[Math.min(at, names.length - 1)] ?? addBtn.value)?.focus();
}
function remove(r: QuoteExtra): void {
  const at = rows.value.findIndex((x) => x.key === r.key);
  setRows(rows.value.filter((x) => x.key !== r.key));
  void focusAfterRemove(at);
  toast({
    text: t("extras.removed"),
    action: { label: t("common.undo"), run: () => { const cur = rows.value; setRows([...cur.slice(0, Math.min(at, cur.length)), r, ...cur.slice(Math.min(at, cur.length))]); } },
  });
}
function saveToCatalog(r: QuoteExtra): void {
  const key = newKey("c");
  patchSettings((s) => ({ extrasCatalog: [...s.extrasCatalog, { key, label: r.label, unitMinor: r.unitMinor, qtyE3: r.qtyE3, per: r.per }] }));
  patchRow(r.key, { catalogKey: key });
  toast({ text: t("extras.saved") });
  void nextTick().then(() => document.getElementById(`xn-${r.key}`)?.focus()); // the pressed button is gone
}
// PrimeVue's Menu gives the menu role, arrow/Home/End keys, Esc and focus return; the items are the catalog plus "custom".
type MenuRow = { key: string; label: string; price?: string; custom?: boolean; command: () => void };
const menuItems = computed<MenuRow[]>(() => [
  ...catalog.value.map((c) => ({ key: c.key, label: c.label, price: `${m(c.unitMinor)} · ${t(`extra.per.${c.per}`)}`, command: () => void addCatalog(c) })),
  { key: "custom", label: t("extras.custom"), custom: true, command: () => void addCustom() },
]);
</script>

<template>
  <div class="ex">
    <p v-if="!rows.length" class="sm muted">{{ t("extras.help") }}</p>
    <div v-for="(r, i) in rows" :key="r.key" class="xrow" :class="{ later: i > 0 }">
      <div class="xname">
        <label :for="`xn-${r.key}`" class="sm muted xl">{{ t("field.extraName") }}</label>
        <InputText
          :id="`xn-${r.key}`" data-extra-name type="text" autocomplete="off" spellcheck="false" :model-value="r.label" :invalid="touched.has(r.key) && !r.label.trim()"
          :aria-invalid="touched.has(r.key) && !r.label.trim() ? 'true' : undefined" required
          @input="patchRow(r.key, { label: ($event.target as HTMLInputElement).value })" @blur="touched = new Set(touched).add(r.key)"
        />
        <Message v-if="touched.has(r.key) && !r.label.trim()" class="bad-text" severity="error" size="small" variant="simple" role="alert">{{ t("field.extraNameRequired") }}</Message>
      </div>
      <MoneyField :model-value="r.unitMinor" :label="t('field.extraCost')" :digits="digits" :currency="currency" :step="smallStep(digits)" @update:model-value="(v) => patchRow(r.key, { unitMinor: v ?? 0 })" />
      <NumberField :model-value="r.qtyE3" :label="t('field.extraQty')" :scale="1000" :step="1000" :max="1000000" required @update:model-value="(v) => patchRow(r.key, { qtyE3: v ?? 0 })" />
      <SelectField :model-value="r.per" :label="t('field.extraPer')" :options="pers" @update:model-value="(v) => patchRow(r.key, { per: v as Per })" />
      <Button text severity="secondary" type="button" class="xdel icon-btn" :aria-label="t('common.removeNamed', { name: r.label || t('field.extraName') })" :title="t('common.remove')" @click="remove(r)"><Icon name="trash" /></Button>
      <p v-if="stockOf(r)" class="xstock sm">
        <span class="muted">{{ t("extras.inStock", { n: stockOf(r)!.have }) }}</span>
        <span v-if="stockOf(r)!.short" class="short"><Icon name="alert-triangle" /><span>{{ stockOf(r)!.short }}</span></span>
      </p>
      <div v-if="r.label.trim() && !inCatalog(r)" class="xsave"><Button text type="button" @click="saveToCatalog(r)">{{ t("extras.saveToCatalog") }}</Button></div>
    </div>
    <div class="add">
      <Button :ref="(c) => (addBtn = elOf(c))" severity="secondary" outlined type="button" aria-haspopup="menu" aria-controls="extras-menu" :aria-label="t('extras.menu')" @click="menu?.toggle($event)"><Icon name="plus" /><span>{{ t("extras.add") }}</span></Button>
    </div>
    <Menu id="extras-menu" ref="menu" popup :model="menuItems" :aria-label="t('extras.menu')" class="opc-menu">
      <template #item="{ item, props }">
        <a v-bind="props.action" class="mi" :class="{ custom: (item as MenuRow).custom }">
          <span class="truncate">{{ item.label }}</span><span v-if="(item as MenuRow).price" class="sm muted num">{{ (item as MenuRow).price }}</span>
        </a>
      </template>
    </Menu>
  </div>
</template>

<style scoped>
.bad-text :deep(.p-message-text) { color: var(--opc-bad); }
.xrow { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-gap: var(--opc-s2) var(--opc-s3); align-items: end; padding: var(--opc-s2) 0; border-bottom: 1px solid var(--opc-border); }
.xrow:first-of-type { padding-top: 0; }
.xname { grid-column: 1 / -1; min-width: 0; }
.xname :deep(.p-inputtext) { width: 100%; }
.xl { display: block; min-height: 24px; line-height: 24px; }
.bad-text { color: var(--opc-bad); margin-top: 2px; }
.xdel { justify-self: end; margin-bottom: 2px; }
.xsave { grid-column: 1 / -1; justify-self: start; }
.xstock { grid-column: 1 / -1; }
.xstock > * + * { margin-left: 12px; }
.short { display: inline-flex; align-items: center; color: var(--opc-warn); }
.short > * + * { margin-left: 4px; }
.add { margin-top: var(--opc-s2); }
.mi { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 8px 12px; text-decoration: none; color: inherit; cursor: pointer; }
.mi > * + * { margin-left: 12px; }
.mi.custom { color: var(--opc-accent-text); }
@media (min-width: 1100px) {
  .xrow { grid-template-columns: minmax(0, 2fr) 128px 96px 140px 36px; }
  .xname { grid-column: auto; }
  .xsave, .xstock { grid-column: 1 / -1; }
  .xrow.later .xl, .xrow.later :deep(.nf-head), .xrow.later :deep(.sf-head) { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
}
</style>
