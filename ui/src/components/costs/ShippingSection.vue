<script setup lang="ts">
import Button from "primevue/button";
// Shipping (docs/ux.md §5.3): mode + amount; one overridable default object {mode, minor}.
import { computed } from "vue";
import { intlLocale, t } from "../../i18n";
import { money } from "../../format";
import { currency, digits } from "../../state/store";
import type { OverridableKey, ShippingMode } from "../../state/types";
import MoneyField from "../base/MoneyField.vue";
import ResetButton from "../base/ResetButton.vue";
import Section from "../base/Section.vue";
import Segmented from "../base/Segmented.vue";
import { hasOverride, hasProblem, saveSectionDefaults, useDefault, useOpen } from "./shared";

const KEYS: OverridableKey[] = ["shipping"];
const ship = useDefault("shipping");
const { open, set: setOpen } = useOpen("shipping", () => false);
const mode = computed(() => ship.value.value.mode);
const edited = computed(() => hasOverride(KEYS));
const m = (n: number) => money(n, currency.value, intlLocale());

const options = computed(() => (["none", "customer", "absorbed"] as ShippingMode[]).map((value) => ({ value, label: t(`shipping.${value}`) })));
const summary = computed(() => (mode.value === "none" ? t("shipping.none") : t(`summary.shipping.${mode.value}`, { amount: m(ship.value.value.minor) })));
const helper = computed(() => (mode.value === "none" ? "" : t(`shipping.${mode.value}Help`)));
const defaultText = computed(() => {
  const b = ship.base.value;
  return b.mode === "none" ? t("shipping.none") : `${t(`shipping.${b.mode}`)} ${m(b.minor)}`;
});
const setMode = (v: ShippingMode) => ship.set({ ...ship.value.value, mode: v });
const setAmount = (v: number | null) => ship.set({ ...ship.value.value, minor: v ?? 0 });
</script>

<template>
  <Section id="shipping" help="shipping" :title="t('section.shipping')" :summary="summary" :open="open" :overridden="edited" :invalid="hasProblem('shipping')" @update:open="setOpen">
    <div v-if="edited" class="head row">
      <span class="ovr-dot" aria-hidden="true" />
      <span class="sr-only">{{ t("a11y.edited") }}</span>
      <span class="sm muted">{{ t("field.shipping") }}</span>
      <ResetButton :label="t('field.shipping')" :default-text="defaultText" @click="ship.reset" />
    </div>
    <Segmented :options="options" :model-value="mode" :label="t('field.shipping')" @update:model-value="setMode" />
    <div v-if="mode !== 'none'" class="amount">
      <MoneyField :model-value="ship.value.value.minor" :label="t('field.shippingAmount')" :digits="digits" :currency="currency" :step="10 ** digits" :helper="helper" @update:model-value="setAmount" />
    </div>
    <div v-if="edited" class="foot hairline"><Button text type="button" @click="saveSectionDefaults(KEYS)">{{ t("section.saveDefaults") }}</Button></div>
  </Section>
</template>

<style scoped>
.head { min-height: 24px; margin-bottom: 4px; }
.head > * + * { margin-left: 4px; }
.amount { margin-top: var(--opc-s3); max-width: 240px; }
.foot { margin-top: var(--opc-s3); padding-top: var(--opc-s2); }
</style>
