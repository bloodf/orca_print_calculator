<script setup lang="ts">
// Extras and stock › catalog: items the user adds to quotes often, with an optional count on hand (never deducted automatically).
import { computed } from "vue";
import { t } from "../../i18n";
import { currency, digits, patchSettings, store } from "../../state/store";
import { toast } from "../../state/toast";
import type { CatalogExtra } from "../../state/types";
import Badge from "../base/Badge.vue";
import Icon from "../base/Icon.vue";
import MoneyField from "../base/MoneyField.vue";
import NumberField from "../base/NumberField.vue";
import SelectField from "../costs/SelectField.vue";
import { newKey, smallStep } from "../costs/shared";
import TextField from "./TextField.vue";

const items = computed(() => store.settings.extrasCatalog);
const pers = (): { value: string; label: string }[] => (["piece", "plate", "order"] as const).map((p) => ({ value: p, label: t(`extra.per.${p}`) }));
const patchItems = (f: (l: CatalogExtra[]) => CatalogExtra[]): void => patchSettings((s) => ({ extrasCatalog: f(s.extrasCatalog) }));
const edit = (key: string, patch: Partial<CatalogExtra>): void => patchItems((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));
const add = (): void => patchItems((l) => [...l, { key: newKey("cat"), label: "", unitMinor: 0, qtyE3: 1000, per: "piece" }]);
function remove(key: string): void {
  const index = items.value.findIndex((x) => x.key === key);
  const gone = items.value[index];
  if (!gone) return;
  patchItems((l) => l.filter((x) => x.key !== key));
  toast({
    text: t("catalog.removed", { name: gone.label || t("extras.custom") }),
    action: { label: t("common.undo"), run: () => patchItems((l) => { const n = [...l]; n.splice(Math.min(index, n.length), 0, gone); return n; }) },
  });
}
</script>

<template>
  <div class="ec">
    <p v-if="!items.length" class="muted">{{ t("catalog.empty") }}</p>
    <ul v-else class="ec-list">
      <li v-for="x in items" :key="x.key" class="ec-item">
        <div class="ec-grid">
          <TextField :model-value="x.label" :label="t('field.extraName')" :maxlength="60" :error="x.label.trim() ? '' : t('field.error.required')" @update:model-value="(v) => edit(x.key, { label: v })" />
          <MoneyField :model-value="x.unitMinor" :label="t('field.extraCost')" :digits="digits" :currency="currency" :step="smallStep(digits)" @update:model-value="(v) => v !== null && edit(x.key, { unitMinor: v })" />
          <NumberField :model-value="x.qtyE3" :label="t('field.extraQty')" :scale="1000" :step="1000" :max="1000000" @update:model-value="(v) => v !== null && edit(x.key, { qtyE3: v })" />
          <SelectField :model-value="x.per" :label="t('field.extraPer')" :options="pers()" @update:model-value="(v) => edit(x.key, { per: v as CatalogExtra['per'] })" />
          <NumberField :model-value="x.stockE3 ?? null" :label="t('field.extraStock')" :scale="1000" :step="1000" :max="1000000000" nullable :helper="t('field.extraStockHelp')" @update:model-value="(v) => edit(x.key, { stockE3: v })" />
          <button type="button" class="btn icon ec-rm" :aria-label="t('common.removeNamed', { name: x.label || t('extras.custom') })" @click="remove(x.key)"><Icon name="trash" /></button>
        </div>
        <Badge v-if="x.stockE3 === 0" tone="warn" :text="t('stock.out')" class="ec-out" />
      </li>
    </ul>
    <button type="button" class="btn ghost" @click="add"><Icon name="plus" /><span>{{ t("catalog.add") }}</span></button>
  </div>
</template>

<style scoped>
.ec > * + * { margin-top: 8px; }
.ec-list { list-style: none; margin: 0; padding: 0; }
.ec-item { padding: 4px 0 12px; border-bottom: 1px solid var(--opc-border); }
.ec-item + .ec-item { padding-top: 12px; }
.ec-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; align-items: start; }
.ec-rm { margin-top: 24px; }
.ec-out { margin-top: 8px; }
</style>
