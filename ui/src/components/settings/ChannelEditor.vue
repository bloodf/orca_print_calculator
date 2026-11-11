<script setup lang="ts">
// Settings › Sales channels: Direct plus whatever the user adds; inline editor, one row open at a time (docs/ux.md §5.3).
import { computed, nextTick, ref } from "vue";
import { money, percent } from "../../format";
import { t } from "../../i18n";
import { currency, digits, locale, store } from "../../state/store";
import type { ChannelDef } from "../../state/types";
import Badge from "../base/Badge.vue";
import Icon from "../base/Icon.vue";
import MoneyField from "../base/MoneyField.vue";
import PercentField from "../base/PercentField.vue";
import { addChannel, problemMessage, problemsFor, removeChannel, setCompared, setDefaultChannel, updateChannel, updateTier } from "./channelOps";
import ChannelTierRows from "./ChannelTierRows.vue";
import TextField from "./TextField.vue";

const editing = ref<string | null>(null);
const tiersOpen = ref<Record<string, boolean>>({});
const channels = computed(() => store.settings.channels);
const multi = computed(() => channels.value.length > 1);
const major = computed(() => 10 ** digits.value);

const first = (c: ChannelDef) => c.tiers[0] ?? { minMinor: 0, pctBp: 0, fixedMinor: 0, shippingMinor: 0 };
function summary(c: ChannelDef): string {
  if (c.tiers.length > 1) return t("channel.steps", { n: c.tiers.length });
  const f = first(c);
  return f.pctBp === 0 && f.fixedMinor === 0 ? t("summary.noFees") : t("channel.feeSummary", { pct: percent(f.pctBp, locale.value), fixed: money(f.fixedMinor, currency.value, locale.value) });
}
const invalid = (c: ChannelDef): boolean => problemsFor(c.id).length > 0;
const rowProblems = (c: ChannelDef): string[] => [...new Set(problemsFor(c.id).filter((p) => !p.tier).map(problemMessage))];
const nameError = (c: ChannelDef): string => (problemsFor(c.id).some((p) => p.code === "name_empty") ? t("channel.def.name_empty") : "");
const showTiers = (c: ChannelDef): boolean => c.tiers.length > 1 || !!tiersOpen.value[c.id];
const toggle = (id: string): void => { editing.value = editing.value === id ? null : id; };
async function add(): Promise<void> {
  const id = addChannel();
  editing.value = id;
  await nextTick();
  document.getElementById(`channel-name-${id}`)?.focus();
}
function remove(id: string): void {
  if (removeChannel(id) && editing.value === id) editing.value = null;
}
</script>

<template>
  <div class="ce">
    <p v-if="multi" class="xs muted ce-legend">{{ t("channel.legend") }}</p>
    <ul class="ce-list">
      <li v-for="c in channels" :key="c.id" class="ce-item">
        <div class="ce-row">
          <input v-if="multi" type="checkbox" :checked="store.settings.comparedChannelIds.includes(c.id)" :aria-label="t('channel.compare', { name: c.name })" @change="setCompared(c.id, ($event.target as HTMLInputElement).checked)" />
          <input v-if="multi" type="radio" name="default-channel" :checked="store.settings.defaultChannelId === c.id" :aria-label="`${t('channel.default')}: ${c.name}`" @change="setDefaultChannel(c.id)" />
          <span class="ce-name truncate">{{ c.name }}</span>
          <Badge v-if="invalid(c)" tone="bad" :text="t('channel.fixFees')" />
          <span class="muted num sm ce-fee">{{ summary(c) }}</span>
          <button type="button" class="btn icon" :aria-expanded="editing === c.id" :aria-label="t('channel.edit', { name: c.name })" @click="toggle(c.id)"><Icon name="pencil" /></button>
          <button v-if="multi" type="button" class="btn icon" :aria-label="t('channel.delete', { name: c.name })" @click="remove(c.id)"><Icon name="trash" /></button>
        </div>
        <div v-if="editing === c.id" class="ce-edit fade-in">
          <TextField :id="`channel-name-${c.id}`" :model-value="c.name" :label="t('field.name')" :maxlength="40" width="md" :error="nameError(c)" @update:model-value="(v) => updateChannel(c.id, { name: v })" />
          <div class="form-grid">
            <PercentField :model-value="first(c).pctBp" :label="t('field.fee')" :step="50" :max="9000" :helper="t('field.feeHelp')" @update:model-value="(v) => v !== null && updateTier(c.id, 0, { pctBp: v })" />
            <MoneyField :model-value="first(c).fixedMinor" :label="t('field.fixedFee')" :digits="digits" :currency="currency" :step="major" @update:model-value="(v) => v !== null && updateTier(c.id, 0, { fixedMinor: v })" />
            <PercentField :model-value="c.taxBp" :label="t('field.tax')" :step="50" :max="9000" :helper="t('field.taxHelp')" @update:model-value="(v) => v !== null && updateChannel(c.id, { taxBp: v })" />
          </div>
          <p v-for="m in rowProblems(c)" :key="m" class="sm bad" role="alert">{{ m }}</p>
          <ChannelTierRows v-if="showTiers(c)" :channel-id="c.id" />
          <button v-else type="button" class="btn ghost" @click="tiersOpen = { ...tiersOpen, [c.id]: true }"><Icon name="plus" /><span>{{ t("channel.addTiers") }}</span></button>
        </div>
      </li>
    </ul>
    <button type="button" class="btn ghost" @click="add"><Icon name="plus" /><span>{{ t("channel.add") }}</span></button>
  </div>
</template>

<style scoped>
.ce-legend { margin-bottom: 4px; }
.ce-list { list-style: none; margin: 0 0 8px; padding: 0; border-top: 1px solid var(--opc-border); }
.ce-item { border-bottom: 1px solid var(--opc-border); }
.ce-row { display: flex; align-items: center; min-height: 40px; }
.ce-row > * + * { margin-left: 8px; }
.ce-name { flex: 1 1 auto; min-width: 0; font-weight: 500; }
.ce-fee { flex: none; }
.ce-edit { padding: 4px 0 12px 8px; border-left: 2px solid var(--opc-selected-border); margin: 0 0 8px 6px; padding-left: 12px; }
.ce-edit > * + * { margin-top: 12px; }
</style>
