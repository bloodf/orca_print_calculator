<script setup lang="ts">
// Machine and energy (docs/ux.md §5.3). Printer-scoped fields save to the printer profile; the rest are overridable defaults.
import { computed } from "vue";
import { intlLocale, t } from "../../i18n";
import { money } from "../../format";
import { currency, derived, digits, store } from "../../state/store";
import { machineOf } from "../../state/derive";
import type { OverridableKey } from "../../state/types";
import MoneyField from "../base/MoneyField.vue";
import NumberField from "../base/NumberField.vue";
import PercentField from "../base/PercentField.vue";
import Section from "../base/Section.vue";
import CheckField from "./CheckField.vue";
import FrozenNote from "./FrozenNote.vue";
import SelectField from "./SelectField.vue";
import { energyText, energyUnits, hasOverride, hasProblem, patchPrinter, perPiece, saveSectionDefaults, smallStep, useDefault, useOpen } from "./shared";

const KEYS: OverridableKey[] = ["energyPerKwh", "maintenancePerHourMinor", "fixedPerPrintHourMinor", "failureBp", "failureMode", "failureIncludesMachine", "depreciationEnabled"];
const energy = useDefault("energyPerKwh");
const maint = useDefault("maintenancePerHourMinor");
const fixed = useDefault("fixedPerPrintHourMinor");
const failure = useDefault("failureBp");
const mode = useDefault("failureMode");
const inclMachine = useDefault("failureIncludesMachine");
const wear = useDefault("depreciationEnabled");

const { open, set: setOpen } = useOpen("machine", () => store.settings.onboarded && store.settings.defaults.energyPerKwh === null);
const model = computed(() => store.host.printerModel);
const machine = computed(() => machineOf({ host: store.host, settings: store.settings, currency: currency.value }));
// An open saved quote shows (read-only) the printer it was priced with, not today's profile.
const frozen = computed(() => store.draft.frozenInput?.costs.machine ?? null);
const watts = computed(() => (frozen.value ? frozen.value.wattsW10 / 10 : p.value.watts));
const price = computed(() => (frozen.value ? frozen.value.acquisitionCents || null : machine.value.acquisitionMinor));
const life = computed(() => (frozen.value ? frozen.value.lifetimeHours || null : machine.value.lifetimeHours));
const p = computed(() => derived.value.printer);
const step = computed(() => 10 ** digits.value);
const e = computed(() => ({ digits: digits.value + 2 }));
const savedFor = computed(() => t("field.savedFor", { model: model.value ?? "" }));

const summary = computed(() => {
  const loc = intlLocale();
  const m = (n: number) => money(n, currency.value, loc);
  const parts: string[] = [];
  const en = perPiece("energy");
  const mc = perPiece("depreciation", "maintenance", "fixed");
  const fl = perPiece("failure");
  if (en === null || mc === null || fl === null) return "—"; // nothing to price yet: a dash, like the unknown value elsewhere
  if (en) parts.push(t("summary.machine.energy", { energy: m(en) }));
  if (mc) parts.push(t("summary.machine.machine", { machine: m(mc) }));
  if (fl) parts.push(t("summary.machine.failure", { failure: m(fl) }));
  return parts.length ? parts.join(" · ") : t("section.notCounted");
});
const modes = computed(() => (["markup", "expected_waste"] as const).map((v) => ({ value: v, label: t(`field.failureMode.${v}`) })));
const wearText = (b: boolean) => t(b ? "common.on" : "common.off");
</script>

<template>
  <Section id="machine" :title="t('section.machine')" :summary="summary" :open="open" :overridden="hasOverride(KEYS)" :invalid="hasProblem('costs')" @update:open="setOpen">
    <div class="form-grid">
      <template v-if="model || frozen">
        <FrozenNote v-if="frozen" class="wide" />
        <NumberField
          :model-value="watts" :label="t('field.watts')" :scale="1" :step="10" :min="1" :max="5000" unit="W" :helper="frozen ? undefined : savedFor" :readonly="!!frozen"
          @update:model-value="(v) => v !== null && !frozen && patchPrinter(model!, { watts: v })"
        />
        <MoneyField
          id="field-acquisitionMinor" :model-value="price" :label="t('field.printerPrice')" :digits="digits" :currency="currency" :step="step" :max="1e9 * step" nullable :helper="frozen ? undefined : savedFor" :readonly="!!frozen"
          @update:model-value="(v) => !frozen && patchPrinter(model!, { acquisitionMinor: v })"
        />
        <NumberField
          :model-value="life" :label="t('field.lifetime')" :scale="1" :step="100" :max="200000" unit="h" nullable :helper="frozen ? undefined : savedFor" :readonly="!!frozen"
          @update:model-value="(v) => !frozen && patchPrinter(model!, { lifetimeHours: v })"
        />
      </template>
      <MoneyField
        id="field-energyPerKwh" :model-value="energyUnits(energy.value.value, digits)" :label="t('field.energy')" :digits="e.digits" :currency="currency" :step="step" :max="100 * step * 100" unit="/kWh" nullable
        :default-value="energyUnits(energy.base.value, digits)" :helper="energy.value.value === null ? undefined : t('field.energyHelp')"
        @update:model-value="(v) => energy.set(energyText(v, digits))" @reset="energy.reset"
      />
      <MoneyField
        :model-value="maint.value.value" :label="t('field.maintenance')" :digits="digits" :currency="currency" :step="smallStep(digits)" unit="/h"
        :default-value="maint.base.value" @update:model-value="(v) => maint.set(v ?? 0)" @reset="maint.reset"
      />
      <MoneyField
        :model-value="fixed.value.value" :label="t('field.fixedPerHour')" :digits="digits" :currency="currency" :step="smallStep(digits)" unit="/h"
        :default-value="fixed.base.value" :helper="t('field.fixedPerHourHelp')" @update:model-value="(v) => fixed.set(v ?? 0)" @reset="fixed.reset"
      />
      <PercentField
        :model-value="failure.value.value" :label="t('field.failure')" :max="9500" :default-value="failure.base.value"
        @update:model-value="(v) => failure.set(v ?? 0)" @reset="failure.reset"
      />
      <SelectField
        :model-value="mode.value.value" :label="t('field.failureMode')" :options="modes" :overridden="mode.value.value !== mode.base.value"
        :default-text="t(`field.failureMode.${mode.base.value}`)" @update:model-value="(v) => mode.set(v as 'markup')" @reset="mode.reset"
      />
    </div>
    <div class="checks">
      <CheckField
        :model-value="inclMachine.value.value" :label="t('field.failureMachine')" :overridden="inclMachine.value.value !== inclMachine.base.value"
        :default-text="wearText(inclMachine.base.value)" @update:model-value="inclMachine.set" @reset="inclMachine.reset"
      />
      <CheckField
        :model-value="wear.value.value" :label="t('field.depreciation')" :overridden="wear.value.value !== wear.base.value"
        :default-text="wearText(wear.base.value)" @update:model-value="wear.set" @reset="wear.reset"
      />
    </div>
    <p v-if="!model" class="sm muted nomodel">{{ t("header.noPrinter") }}</p>
    <div v-if="hasOverride(KEYS)" class="foot hairline"><button type="button" class="btn ghost" @click="saveSectionDefaults(KEYS)">{{ t("section.saveDefaults") }}</button></div>
  </Section>
</template>

<style scoped>
.checks { margin-top: var(--opc-s2); display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); grid-column-gap: var(--opc-s3); }
.nomodel { margin-top: var(--opc-s2); }
.wide { grid-column: 1 / -1; }
.foot { margin-top: var(--opc-s3); padding-top: var(--opc-s2); }
</style>
