<script setup lang="ts">
// Sales fee (docs/ux.md §5.3): the selected channel's own fees (channel-scoped, no override dot), then rounding and minimum order.
import { computed } from "vue";
import { intlLocale, t } from "../../i18n";
import { money, percent } from "../../format";
import { PRETTY_MODES } from "../../engine/quotePricing";
import { currency, derived, digits, patchSettings, selected, store } from "../../state/store";
import type { ChannelDef, OverridableKey, PrettyMode } from "../../state/types";
import MoneyField from "../base/MoneyField.vue";
import PercentField from "../base/PercentField.vue";
import Section from "../base/Section.vue";
import FrozenNote from "./FrozenNote.vue";
import SelectField from "./SelectField.vue";
import { gotoSettings, hasOverride, hasProblem, saveSectionDefaults, useDefault, useOpen } from "./shared";

const KEYS: OverridableKey[] = ["pretty", "minOrderMinor"];
const pretty = useDefault("pretty");
const minOrder = useDefault("minOrderMinor");
const { open, set: setOpen } = useOpen("sales", () => !store.settings.onboarded);

// An open saved quote shows (read-only) the channel it was priced with, even if that channel was edited or deleted since.
const frozen = computed(() => !!store.draft.frozenInput);
const channel = computed<ChannelDef | undefined>(() => {
  const id = derived.value.selectedChannelId;
  const fi = store.draft.frozenInput;
  if (!fi) return store.settings.channels.find((c) => c.id === id);
  const c = fi.channels.find((x) => x.id === id);
  return c && { id: c.id, name: c.name, taxBp: c.taxBp, surchargeMinor: c.surchargeCents, tiers: c.tiers.map((t) => ({ minMinor: t.minPriceCents, pctBp: t.pctBp, fixedMinor: t.fixedCents, shippingMinor: t.shippingCents })) };
});
const single = computed(() => (channel.value?.tiers.length ?? 0) <= 1);
const tier = computed(() => channel.value?.tiers[0]);
const saved = computed(() => t("field.savedForChannel", { channel: channel.value?.name ?? "" }));
const bad = computed(() => hasProblem("pretty", "minOrderMinor") || (!!channel.value && (derived.value.skippedChannels.some((c) => c.id === channel.value!.id) || (selected.value?.ok === false && selected.value.problem === "channel_invalid"))));

function editChannel(f: (c: ChannelDef) => ChannelDef): void {
  const id = channel.value?.id;
  if (id && !frozen.value) patchSettings((s) => ({ channels: s.channels.map((c) => (c.id === id ? f(c) : c)) }));
}
const setFee = (pctBp: number | null) => editChannel((c) => ({ ...c, tiers: c.tiers.map((x, i) => (i === 0 ? { ...x, pctBp: pctBp ?? 0 } : x)) }));
const setFixed = (fixedMinor: number | null) => editChannel((c) => ({ ...c, tiers: c.tiers.map((x, i) => (i === 0 ? { ...x, fixedMinor: fixedMinor ?? 0 } : x)) }));
const setTax = (taxBp: number | null) => editChannel((c) => ({ ...c, taxBp: taxBp ?? 0 }));

const summary = computed(() => {
  const c = channel.value;
  const tr = tier.value;
  if (!c || !tr || (!tr.pctBp && !tr.fixedMinor && !c.taxBp)) return t("summary.noFees");
  const loc = intlLocale();
  return t("summary.sales", { pct: percent(tr.pctBp, loc), fixed: money(tr.fixedMinor, currency.value, loc), tax: percent(c.taxBp, loc) });
});
const modes = computed(() => PRETTY_MODES.map((v) => ({ value: v, label: t(`pretty.${v}`) })));
</script>

<template>
  <Section id="sales" help="sales" :title="t('section.sales')" :summary="summary" :open="open" :overridden="hasOverride(KEYS)" :invalid="bad" @update:open="setOpen">
    <FrozenNote v-if="frozen" />
    <div v-if="channel && tier && single" class="form-grid">
      <PercentField :model-value="tier.pctBp" :label="t('field.fee')" :max="9000 - channel.taxBp" :step="50" :helper="t('field.feeHelp')" :readonly="frozen" @update:model-value="setFee" />
      <MoneyField :model-value="tier.fixedMinor" :label="t('field.fixedFee')" :digits="digits" :currency="currency" :step="10 ** digits" :helper="saved" :readonly="frozen" @update:model-value="setFixed" />
      <PercentField :model-value="channel.taxBp" :label="t('field.tax')" :max="9000 - tier.pctBp" :step="50" :helper="t('field.taxHelp')" :readonly="frozen" @update:model-value="setTax" />
    </div>
    <div v-else-if="channel" class="steps row">
      <span class="sm">{{ t("channel.steps", { n: channel.tiers.length }) }}</span>
      <button v-if="!frozen" type="button" class="btn ghost" @click="gotoSettings('settings-channels')">{{ t("field.editChannelFees") }}</button>
    </div>
    <div class="form-grid more hairline">
      <SelectField
        :model-value="pretty.value.value" :label="t('field.pretty')" :options="modes" :overridden="pretty.value.value !== pretty.base.value"
        :default-text="t(`pretty.${pretty.base.value}`)" :helper="t('pretty.help')" @update:model-value="(v) => pretty.set(v as PrettyMode)" @reset="pretty.reset"
      />
      <MoneyField
        :model-value="minOrder.value.value" :label="t('field.minOrder')" :digits="digits" :currency="currency" :step="10 ** digits"
        :default-value="minOrder.base.value" :helper="t('field.minOrderHelp')" @update:model-value="(v) => minOrder.set(v ?? 0)" @reset="minOrder.reset"
      />
    </div>
    <div v-if="hasOverride(KEYS)" class="foot"><button type="button" class="btn ghost" @click="saveSectionDefaults(KEYS)">{{ t("section.saveDefaults") }}</button></div>
  </Section>
</template>

<style scoped>
.steps { justify-content: space-between; }
.more { margin-top: var(--opc-s3); padding-top: var(--opc-s3); }
.foot { margin-top: var(--opc-s3); }
</style>
