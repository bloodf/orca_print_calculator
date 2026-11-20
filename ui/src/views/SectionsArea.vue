<script setup lang="ts">
// The Costs panel: the five cost sections as expandable rows, and what one piece costs under them.
import { computed } from "vue";
import { OuiPanel } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";
import ExtrasSection from "../components/costs/ExtrasSection.vue";
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
    <MachineSection /><LaborSection /><ExtrasSection /><ShippingSection /><SalesSection />
    <template #footer>
      <span class="oui-strong">{{ t("line.costTotal") }}</span><span v-if="partial" class="oui-chip" data-tone="warn">{{ t("price.partial") }}</span>
      <span class="oui-spacer" />
      <span class="num cost-sum" data-testid="cost-per-piece"><template v-if="cost">{{ cost }}</template><template v-else><span aria-hidden="true">—</span><span class="oui-sr">{{ t("a11y.unknown") }}</span></template></span>
    </template>
  </OuiPanel>
</template>

<style scoped>
.cost-sum { font-size: var(--oui-text-lg); font-weight: 650; }
</style>
