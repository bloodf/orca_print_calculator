<script setup lang="ts">
// Labor (docs/ux.md §5.3): rate, hands-on minutes per run, setup minutes per order. All overridable defaults.
import { computed } from "vue";
import { intlLocale, t } from "../../i18n";
import { count, money } from "../../format";
import { currency, digits } from "../../state/store";
import type { OverridableKey } from "../../state/types";
import MoneyField from "../base/MoneyField.vue";
import NumberField from "../base/NumberField.vue";
import Section from "../base/Section.vue";
import { hasOverride, hasProblem, perPiece, saveSectionDefaults, useDefault, useOpen } from "./shared";

const KEYS: OverridableKey[] = ["laborPerHourMinor", "laborMinutes", "setupMinutes"];
const rate = useDefault("laborPerHourMinor");
const mins = useDefault("laborMinutes");
const setup = useDefault("setupMinutes");
const { open, set: setOpen } = useOpen("labor", () => false);

const summary = computed(() => {
  const amount = perPiece("labor", "setup");
  return amount === null ? "—" : t("summary.labor", { minutes: count(mins.value.value, intlLocale()), amount: money(amount, currency.value, intlLocale()) });
});
</script>

<template>
  <Section id="labor" :title="t('section.labor')" :summary="summary" :open="open" :overridden="hasOverride(KEYS)" :invalid="hasProblem('setup', 'costs.labor')" @update:open="setOpen">
    <div class="form-grid">
      <MoneyField
        id="field-laborPerHourMinor" :model-value="rate.value.value" :label="t('field.laborRate')" :digits="digits" :currency="currency" :step="10 ** digits" unit="/h" nullable
        :default-value="rate.base.value" @update:model-value="rate.set" @reset="rate.reset"
      />
      <NumberField
        :model-value="mins.value.value" :label="t('field.laborMinutes')" :scale="1" :step="5" :max="6000" unit="min" required
        :default-value="mins.base.value" :helper="t('field.laborMinutesHelp')" @update:model-value="(v) => mins.set(v ?? 0)" @reset="mins.reset"
      />
      <NumberField
        :model-value="setup.value.value" :label="t('field.setupMinutes')" :scale="1" :step="5" :max="6000" unit="min" required
        :default-value="setup.base.value" :helper="t('field.setupHelp')" @update:model-value="(v) => setup.set(v ?? 0)" @reset="setup.reset"
      />
    </div>
    <div v-if="hasOverride(KEYS)" class="foot hairline"><button type="button" class="btn ghost" @click="saveSectionDefaults(KEYS)">{{ t("section.saveDefaults") }}</button></div>
  </Section>
</template>

<style scoped>
.foot { margin-top: var(--opc-s3); padding-top: var(--opc-s2); }
</style>
