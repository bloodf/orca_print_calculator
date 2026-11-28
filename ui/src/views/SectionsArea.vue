<script setup lang="ts">
// The Costs panel: what one piece costs to make, row by row (filament, then the four cost sections), and their sum. The rows
// add up to "Cost per piece" to the minor unit. What selling takes (channel fees and tax) comes out of the price, not the
// cost, so it sits under the sum in a block of its own.
import { computed } from "vue";
import { OuiPanel } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";
import ExtrasSection from "../components/costs/ExtrasSection.vue";
import FilamentSection from "../components/costs/FilamentSection.vue";
import LaborSection from "../components/costs/LaborSection.vue";
import MachineSection from "../components/costs/MachineSection.vue";
import SalesSection from "../components/costs/SalesSection.vue";
import ShippingSection from "../components/costs/ShippingSection.vue";
import { m } from "../components/price/priceState";
import { unknownLines } from "../components/price/unknownLines";
import { t } from "../i18n";
import { derived, result } from "../state/store";

const cost = computed(() => (result.value.ok ? m(result.value.unitCostAtQuantity) : null));
const partial = computed(() => result.value.ok && Object.keys(unknownLines(derived.value)).length > 0);
</script>

<template>
  <OuiPanel class="sections-area" :title="t('costs.title')" :icon="I.coins" tone="orange" flush :meta="t('costs.perPiece')">
    <FilamentSection /><MachineSection /><LaborSection /><ExtrasSection /><ShippingSection />
    <p class="cost-total" data-row="costTotal">
      <span class="oui-strong">{{ t("line.costTotal") }}</span><span v-if="partial" class="oui-chip" data-tone="warn">{{ t("price.partial") }}</span>
      <span class="oui-spacer" />
      <span class="num cost-sum" data-testid="cost-per-piece"><template v-if="cost">{{ cost }}</template><template v-else><span aria-hidden="true">—</span><span class="oui-sr">{{ t("a11y.unknown") }}</span></template></span>
    </p>
    <div class="selling" role="group" aria-labelledby="costs-selling" data-selling>
      <p class="sell-head"><span id="costs-selling" class="oui-label">{{ t("costs.selling") }}</span><span class="oui-meta">{{ t("costs.sellingNote") }}</span></p>
      <SalesSection />
    </div>
  </OuiPanel>
</template>

<style scoped>
/* the sum closes the column of costs: a rule above it, the weight of a total, the amount in line with the rows' amounts */
.cost-total { display: flex; align-items: center; gap: var(--oui-s2); min-height: 48px; padding: var(--oui-s2) var(--amount-end) var(--oui-s2) var(--oui-s4); border-top: 1px solid var(--oui-border);
  /* where the rows' amounts end: before the gap, the chevron, the row's own padding and its (i) button */
  --amount-end: calc(var(--oui-s3) + 14px + var(--oui-s2) + var(--oui-control-sm) + var(--oui-s2)); background: var(--oui-inset); }
.cost-sum { font-size: var(--oui-text-lg); font-weight: 650; }
.selling { border-top: 1px solid var(--oui-border); }
.sell-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--oui-s2); padding: var(--oui-s3) var(--oui-s4) 0; }
</style>
