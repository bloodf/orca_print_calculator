<script setup lang="ts">
// Extras rows + "+ Extra" catalog menu (docs/ux.md §5.3). Rows are per-quote; removing a row offers Undo.
import { computed, nextTick, ref } from "vue";
import { intlLocale, t } from "../../i18n";
import { money } from "../../format";
import { currency, derived, digits, patchDraft, patchSettings, store } from "../../state/store";
import { toast } from "../../state/toast";
import type { CatalogExtra, QuoteExtra } from "../../state/types";
import Icon from "../base/Icon.vue";
import MoneyField from "../base/MoneyField.vue";
import NumberField from "../base/NumberField.vue";
import Popover from "../base/Popover.vue";
import SelectField from "./SelectField.vue";
import { newKey, smallStep } from "./shared";

type Per = QuoteExtra["per"];
const rows = computed(() => store.draft.extras);
const catalog = computed(() => store.settings.extrasCatalog);
const pers = computed(() => (["piece", "plate", "order"] as Per[]).map((value) => ({ value, label: t(`extra.per.${value}`) })));
const menuOpen = ref(false);
const addBtn = ref<HTMLElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const touched = ref<Set<string>>(new Set());
const m = (n: number) => money(n, currency.value, intlLocale());

const setRows = (extras: QuoteExtra[]) => patchDraft({ extras });
const patchRow = (key: string, patch: Partial<QuoteExtra>) => setRows(rows.value.map((r) => (r.key === key ? { ...r, ...patch } : r)));
const inCatalog = (r: QuoteExtra) => catalog.value.some((c) => c.label === r.label);
const units = (e3: number): string => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 3 }).format(e3 / 1000);
/** Stock of the matching catalog item, and a shortage line when this quote needs more (per plate: no estimate). Nothing is deducted. */
function stockOf(r: QuoteExtra): { have: string; short: string } | null {
  const have = catalog.value.find((c) => c.label === r.label)?.stockE3;
  if (typeof have !== "number") return null;
  const res = derived.value.result;
  const pieces = res.ok ? res.piecesPrinted : store.draft.quantity; // spare pieces are printed too
  const need = r.per === "piece" ? r.qtyE3 * pieces : r.per === "order" ? r.qtyE3 : 0;
  return { have: units(have), short: need > have ? t("extras.short", { need: units(need), have: units(have) }) : "" };
}

async function add(base: Omit<QuoteExtra, "key">): Promise<void> {
  menuOpen.value = false;
  setRows([...rows.value, { ...base, key: newKey("x") }]);
  await nextTick();
  const names = document.querySelectorAll<HTMLInputElement>("[data-extra-name]");
  if (!base.label) names[names.length - 1]?.focus();
}
const addCatalog = (c: CatalogExtra) => add({ label: c.label, unitMinor: c.unitMinor, qtyE3: c.qtyE3, per: c.per });
const addCustom = () => add({ label: "", unitMinor: 0, qtyE3: 1000, per: "piece" });

function remove(r: QuoteExtra): void {
  const at = rows.value.findIndex((x) => x.key === r.key);
  setRows(rows.value.filter((x) => x.key !== r.key));
  toast({
    text: t("extras.removed"),
    action: { label: t("common.undo"), run: () => { const cur = rows.value; setRows([...cur.slice(0, Math.min(at, cur.length)), r, ...cur.slice(Math.min(at, cur.length))]); } },
  });
}
function saveToCatalog(r: QuoteExtra): void {
  patchSettings((s) => ({ extrasCatalog: [...s.extrasCatalog, { key: newKey("c"), label: r.label, unitMinor: r.unitMinor, qtyE3: r.qtyE3, per: r.per }] }));
  toast({ text: t("extras.saved") });
}
function onMenuKey(e: KeyboardEvent): void {
  const items = [...(menu.value?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
  const i = items.indexOf(document.activeElement as HTMLElement);
  const to = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
  if (to === null || !items.length) return;
  e.preventDefault();
  items[(to + items.length) % items.length]?.focus();
}
</script>

<template>
  <div class="ex">
    <p v-if="!rows.length" class="sm muted">{{ t("extras.help") }}</p>
    <div v-for="(r, i) in rows" :key="r.key" class="xrow" :class="{ later: i > 0 }">
      <div class="xname">
        <label :for="`xn-${r.key}`" class="sm muted xl">{{ t("field.extraName") }}</label>
        <input
          :id="`xn-${r.key}`" data-extra-name type="text" autocomplete="off" spellcheck="false" :value="r.label" :class="{ bad: touched.has(r.key) && !r.label.trim() }"
          :aria-invalid="touched.has(r.key) && !r.label.trim() ? 'true' : undefined" required
          @input="patchRow(r.key, { label: ($event.target as HTMLInputElement).value })" @blur="touched = new Set(touched).add(r.key)"
        />
        <p v-if="touched.has(r.key) && !r.label.trim()" class="sm bad-text" role="alert">{{ t("field.extraNameRequired") }}</p>
      </div>
      <MoneyField :model-value="r.unitMinor" :label="t('field.extraCost')" :digits="digits" :currency="currency" :step="smallStep(digits)" @update:model-value="(v) => patchRow(r.key, { unitMinor: v ?? 0 })" />
      <NumberField :model-value="r.qtyE3" :label="t('field.extraQty')" :scale="1000" :step="1000" :max="1000000" required @update:model-value="(v) => patchRow(r.key, { qtyE3: v ?? 0 })" />
      <SelectField :model-value="r.per" :label="t('field.extraPer')" :options="pers" @update:model-value="(v) => patchRow(r.key, { per: v as Per })" />
      <button type="button" class="btn icon xdel" :aria-label="t('common.removeNamed', { name: r.label || t('field.extraName') })" :title="t('common.remove')" @click="remove(r)"><Icon name="trash" /></button>
      <p v-if="stockOf(r)" class="xstock sm">
        <span class="muted">{{ t("extras.inStock", { n: stockOf(r)!.have }) }}</span>
        <span v-if="stockOf(r)!.short" class="short"><Icon name="alert-triangle" />{{ stockOf(r)!.short }}</span>
      </p>
      <div v-if="r.label.trim() && !inCatalog(r)" class="xsave"><button type="button" class="btn ghost" @click="saveToCatalog(r)">{{ t("extras.saveToCatalog") }}</button></div>
    </div>
    <div class="add">
      <button ref="addBtn" type="button" class="btn" aria-haspopup="menu" :aria-expanded="menuOpen" :aria-label="t('extras.menu')" @click="menuOpen = !menuOpen"><Icon name="plus" /><span>{{ t("extras.add") }}</span></button>
    </div>
    <Popover :open="menuOpen" :anchor="addBtn" :label="t('extras.menu')" @close="menuOpen = false">
      <div ref="menu" role="menu" class="menu" @keydown="onMenuKey">
        <button v-for="c in catalog" :key="c.key" type="button" role="menuitem" class="mi" @click="addCatalog(c)">
          <span class="truncate">{{ c.label }}</span><span class="sm muted num">{{ m(c.unitMinor) }} · {{ t(`extra.per.${c.per}`) }}</span>
        </button>
        <button type="button" role="menuitem" class="mi custom" @click="addCustom">{{ t("extras.custom") }}</button>
      </div>
    </Popover>
  </div>
</template>

<style scoped>
.xrow { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-gap: var(--opc-s2) var(--opc-s3); align-items: end; padding: var(--opc-s2) 0; border-bottom: 1px solid var(--opc-border); }
.xrow:first-of-type { padding-top: 0; }
.xname { grid-column: 1 / -1; min-width: 0; }
.xname input { width: 100%; height: 28px; }
.xname input.bad { border-color: var(--opc-bad); }
.xl { display: block; min-height: 24px; line-height: 24px; }
.bad-text { color: var(--opc-bad); margin-top: 2px; }
.xdel { justify-self: end; margin-bottom: 2px; }
.xsave { grid-column: 1 / -1; justify-self: start; }
.xstock { grid-column: 1 / -1; }
.xstock > * + * { margin-left: 12px; }
.short { display: inline-flex; align-items: center; color: var(--opc-warn); }
.short > * + * { margin-left: 4px; }
.add { margin-top: var(--opc-s2); }
.menu { display: grid; grid-row-gap: 2px; min-width: 220px; }
.mi { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 28px; padding: 0 8px; border: 0; border-radius: var(--opc-r-control); background: transparent; text-align: left; }
.mi > * + * { margin-left: 12px; }
.mi:hover { background: var(--opc-hover); }
.mi.custom { color: var(--opc-accent-text); border-top: 1px solid var(--opc-border); border-radius: 0 0 var(--opc-r-control) var(--opc-r-control); }
@media (min-width: 1100px) {
  .xrow { grid-template-columns: minmax(0, 2fr) 120px 88px 132px 24px; }
  .xname { grid-column: auto; }
  .xsave, .xstock { grid-column: 1 / -1; }
  .xrow.later .xl, .xrow.later :deep(.nf-head), .xrow.later :deep(.sf-head) { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
}
</style>
