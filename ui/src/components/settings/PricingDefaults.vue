<script setup lang="ts">
// Settings › Pricing: margin, rounding, minimum order, default shipping, default discount tiers (docs/ux.md §5.3 Settings 3).
import { computed } from "vue";
import { PRETTY_MODES } from "../../engine/quotePricing";
import { t } from "../../i18n";
import { currency, digits, patchDefaults, store } from "../../state/store";
import type { DiscountTier, PrettyMode, ShippingMode } from "../../state/types";
import MoneyField from "../base/MoneyField.vue";
import MarkupField from "../base/MarkupField.vue";
import Segmented from "../base/Segmented.vue";
import SelectField from "../costs/SelectField.vue";
import DiscountTierEditor from "../price/DiscountTierEditor.vue";

const d = computed(() => store.settings.defaults);
const major = computed(() => 10 ** digits.value);
const prettyOptions = (): { value: string; label: string }[] => PRETTY_MODES.map((m) => ({ value: m, label: t(`pretty.${m}`) }));
const shippingOptions = (): { value: ShippingMode; label: string }[] => (["none", "customer", "absorbed"] as const).map((m) => ({ value: m, label: t(`shipping.${m}`) }));
const setShipping = (mode: ShippingMode): void => patchDefaults({ shipping: { mode, minor: mode === "none" ? 0 : d.value.shipping.minor } });
</script>

<template>
  <div class="stack">
    <div class="form-grid">
      <MarkupField :model-value="d.targetMarginBp" :label="t('field.margin')" :helper="t('field.marginHelp')" @update:model-value="(v) => patchDefaults({ targetMarginBp: v })" />
      <SelectField :model-value="d.pretty" :label="t('field.pretty')" :options="prettyOptions()" :helper="t('pretty.help')" @update:model-value="(v) => patchDefaults({ pretty: v as PrettyMode })" />
      <MoneyField
        :model-value="d.minOrderMinor" :label="t('field.minOrder')" :digits="digits" :currency="currency" :step="major" :helper="t('field.minOrderHelp')"
        @update:model-value="(v) => v !== null && patchDefaults({ minOrderMinor: v })"
      />
    </div>
    <div class="ship">
      <p class="sm muted lbl" id="settings-ship-l">{{ t("field.shipping") }}</p>
      <div class="row ship-row">
        <Segmented :options="shippingOptions()" :model-value="d.shipping.mode" :label="t('field.shipping')" @update:model-value="setShipping" />
        <MoneyField
          v-if="d.shipping.mode !== 'none'" :model-value="d.shipping.minor" :label="t('field.shippingAmount')" :digits="digits" :currency="currency" :step="major"
          @update:model-value="(v) => v !== null && patchDefaults({ shipping: { mode: d.shipping.mode, minor: v } })"
        />
      </div>
      <p v-if="d.shipping.mode !== 'none'" class="sm muted">{{ t(d.shipping.mode === "customer" ? "shipping.customerHelp" : "shipping.absorbedHelp") }}</p>
    </div>
    <div>
      <p class="sm muted lbl">{{ t("pricing.defaultTiers") }}</p>
      <DiscountTierEditor :model-value="d.discountTiers" @update:model-value="(v: DiscountTier[]) => patchDefaults({ discountTiers: v })" />
    </div>
  </div>
</template>

<style scoped>
.stack > * + * { margin-top: 16px; }
.lbl { min-height: 24px; line-height: 24px; }
.ship-row { align-items: flex-end; }
</style>
