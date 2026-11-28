<script setup lang="ts">
// Settings › Sales channels: Direct plus whatever the user adds; inline editor, one row open at a time (docs/ux.md §5.3).
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import RadioButton from "primevue/radiobutton";
import { computed, nextTick, ref } from "vue";
import { money, percent } from "../../format";
import { t } from "../../i18n";
import { currency, digits, locale, store } from "../../state/store";
import type { ChannelDef } from "../../state/types";
import { OuiIcon } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";
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
  <div class="ce" :class="{ multi }">
    <!-- the two controls at the start of each row are named by the column they stand in -->
    <div v-if="multi" class="ce-head sm oui-muted" data-channel-head><span>{{ t("channel.col.compare") }}</span><span>{{ t("channel.col.default") }}</span><span class="ce-head-name">{{ t("channel.col.channel") }}</span></div>
    <ul class="ce-list">
      <li v-for="c in channels" :key="c.id" class="ce-item">
        <div class="ce-row">
          <span v-if="multi" class="ce-pick" :title="t('channel.col.compare')"><Checkbox binary :model-value="store.settings.comparedChannelIds.includes(c.id)" :aria-label="t('channel.compare', { name: c.name })" @update:model-value="(v: boolean) => setCompared(c.id, v)" /></span>
          <span v-if="multi" class="ce-pick" :title="t('channel.col.default')"><RadioButton name="default-channel" :value="c.id" :model-value="store.settings.defaultChannelId" :aria-label="t('common.labelValue', { label: t('channel.default'), value: c.name })" @update:model-value="setDefaultChannel(c.id)" /></span>
          <span class="ce-main">
          <span class="ce-name oui-truncate">{{ c.name }}</span>
          <span v-if="invalid(c)" class="oui-chip badge" data-tone="danger">{{ t("channel.fixFees") }}</span>
          <span class="oui-muted num sm ce-fee">{{ summary(c) }}</span>
          <Button text severity="secondary" type="button" class="icon-btn" :aria-expanded="editing === c.id" :aria-label="t('channel.edit', { name: c.name })" @click="toggle(c.id)"><OuiIcon :icon="I.edit" /></Button>
          <Button v-if="multi" text severity="secondary" type="button" class="icon-btn" :aria-label="t('channel.delete', { name: c.name })" @click="remove(c.id)"><OuiIcon :icon="I.trash" /></Button>
          </span>
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
          <Button v-else text type="button" @click="tiersOpen = { ...tiersOpen, [c.id]: true }"><OuiIcon :icon="I.plus" /><span>{{ t("channel.addTiers") }}</span></Button>
        </div>
      </li>
    </ul>
    <Button text type="button" @click="add"><OuiIcon :icon="I.plus" /><span>{{ t("channel.add") }}</span></Button>
  </div>
</template>

<style scoped>
.ce-list { list-style: none; margin: 0 0 8px; padding: 0; border-top: 1px solid var(--oui-border); }
.ce-item { border-bottom: 1px solid var(--oui-border); }
.ce-row, .ce-main { display: flex; align-items: center; min-height: 40px; min-width: 0; }
.ce-main { flex: 1 1 auto; }
.ce-main > * + * { margin-left: 8px; }
/* With two or more channels the rows are a table of three columns: compare, default, the channel. The first two are as wide as
   their heading (in any language), and each row's checkbox and radio sit centred under it. Without subgrid the rows stay a
   plain line each and the headings are left out: the two controls keep their names as tooltip and accessible name. */
.ce-head { display: none; }
@supports (grid-template-columns: subgrid) {
  .ce.multi { display: grid; grid-template-columns: max-content max-content minmax(0, 1fr); column-gap: var(--oui-s3); justify-items: start; }
  .ce.multi > * { grid-column: 1 / -1; }
  .ce.multi :is(.ce-head, .ce-list, .ce-item, .ce-row) { display: grid; grid-template-columns: subgrid; justify-self: stretch; }
  .ce.multi :is(.ce-item, .ce-row, .ce-edit) { grid-column: 1 / -1; }
}
.ce-head { align-items: end; min-height: 24px; padding-bottom: 4px; }
.ce-head > :not(.ce-head-name), .ce-pick { justify-self: center; }
.ce-pick { display: inline-flex; }
.ce-name { flex: 1 1 auto; min-width: 0; font-weight: 500; }
.ce-fee { flex: none; }
.ce-edit { padding: 4px 0 12px 8px; border-left: 2px solid var(--oui-primary-mark); margin: 0 0 8px 6px; padding-left: 12px; }
.ce-edit > * + * { margin-top: 12px; }
</style>
