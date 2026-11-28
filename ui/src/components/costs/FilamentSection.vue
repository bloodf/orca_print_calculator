<script setup lang="ts">
// Filament, the first row of the Costs panel: the largest cost of a piece, so the rows add up to "Cost per piece".
// Its weights and prices are the plates' own, so the row opens nothing: pressing it goes to the Plates panel.
import { computed } from "vue";
import { grams } from "../../format";
import { t } from "../../i18n";
import { locale, result } from "../../state/store";
import * as I from "@orca-plugins/ui-foundation/src/icons";
import Section from "../base/Section.vue";
import { sectionAmount } from "./shared";

const amount = computed(() => sectionAmount("filament"));
const summary = computed(() => {
  const r = result.value;
  if (!r.ok) return "—";
  const kinds = t("summary.filament.kinds", { n: r.materials.length });
  // a weight only when one run is one piece and every weight is known: anything else would not be the weight of a piece
  const perPiece = r.piecesPrinted === r.runs && !amount.value.partial && amount.value.amount !== null;
  return perPiece ? `${grams(r.materials.reduce((s, m) => s + m.gramsMg, 0) / 1000, locale.value)} · ${kinds}` : kinds;
});
function goToPlates(): void {
  const el = document.getElementById("plates-title");
  el?.scrollIntoView?.({ block: "start" });
  el?.focus();
}
</script>

<template>
  <Section id="filament" help="filament" :icon="I.spool" tone="magenta" :amount="amount.amount" :partial="amount.partial" :title="t('line.filament')" :summary="summary" :jump="t('costs.filamentJump')" @jump="goToPlates" />
</template>
