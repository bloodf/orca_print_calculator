<script setup lang="ts">
// Settings › Costs: the non-printer defaults every new quote starts from (docs/ux.md §5.3 Settings 2, §7.6).
import { computed } from "vue";
import { t } from "../../i18n";
import { currency, digits, patchDefaults, store } from "../../state/store";
import type { Defaults } from "../../state/types";
import MoneyField from "../base/MoneyField.vue";
import NumberField from "../base/NumberField.vue";
import PercentField from "../base/PercentField.vue";
import CheckField from "../costs/CheckField.vue";
import SelectField from "../costs/SelectField.vue";
import { energyText, energyUnits, smallStep } from "../costs/shared";
import { UNIT } from "./units";

const d = computed(() => store.settings.defaults);
const step = computed(() => smallStep(digits.value));
const major = computed(() => 10 ** digits.value);
const set = <K extends keyof Defaults>(key: K) => (v: Defaults[K] | null): void => { if (v !== null) patchDefaults({ [key]: v } as Partial<Defaults>); };
const modes = (): { value: string; label: string }[] => [
  { value: "expected_waste", label: t("field.failureMode.expected_waste") },
  { value: "markup", label: t("field.failureMode.markup") },
];
</script>

<template>
  <div>
  <div class="form-grid">
    <MoneyField
      :model-value="energyUnits(d.energyPerKwh, digits)" :label="t('field.energy')" :digits="digits + 2" :currency="currency" :step="major" :unit="UNIT.kwh" :max="100 * 10 ** (digits + 2)" nullable
      :helper="t('field.energyHelp')" @update:model-value="(v) => patchDefaults({ energyPerKwh: energyText(v, digits) })"
    />
    <MoneyField :model-value="d.maintenancePerHourMinor" :label="t('field.maintenance')" :digits="digits" :currency="currency" :step="step" :unit="UNIT.hour" @update:model-value="set('maintenancePerHourMinor')($event)" />
    <MoneyField
      :model-value="d.fixedPerPrintHourMinor" :label="t('field.fixedPerHour')" :digits="digits" :currency="currency" :step="step" :unit="UNIT.hour"
      :helper="t('field.fixedPerHourHelp')" @update:model-value="set('fixedPerPrintHourMinor')($event)"
    />
    <PercentField :model-value="d.failureBp" :label="t('field.failure')" :max="9500" @update:model-value="set('failureBp')($event)" />
    <SelectField :model-value="d.failureMode" :label="t('field.failureMode')" :options="modes()" @update:model-value="(v) => patchDefaults({ failureMode: v as Defaults['failureMode'] })" />
    <MoneyField :model-value="d.laborPerHourMinor" :label="t('field.laborRate')" :digits="digits" :currency="currency" :step="major" :unit="UNIT.hour" nullable @update:model-value="(v) => patchDefaults({ laborPerHourMinor: v })" />
    <NumberField :model-value="d.laborMinutes" :label="t('field.laborMinutes')" :scale="1" :step="5" :max="6000" :unit="UNIT.minute" :helper="t('field.laborMinutesHelp')" @update:model-value="set('laborMinutes')($event)" />
    <NumberField :model-value="d.setupMinutes" :label="t('field.setupMinutes')" :scale="1" :step="5" :max="6000" :unit="UNIT.minute" :helper="t('field.setupHelp')" @update:model-value="set('setupMinutes')($event)" />
  </div>
    <div class="checks">
      <CheckField :model-value="d.failureIncludesMachine" :label="t('field.failureMachine')" @update:model-value="(v) => patchDefaults({ failureIncludesMachine: v })" />
      <CheckField :model-value="d.depreciationEnabled" :label="t('field.depreciation')" @update:model-value="(v) => patchDefaults({ depreciationEnabled: v })" />
    </div>
  </div>
</template>

<style scoped>
.checks { margin-top: 12px; }
</style>
