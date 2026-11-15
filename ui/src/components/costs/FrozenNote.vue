<script setup lang="ts">
import Button from "primevue/button";
// Shown in the printer and sales sections while a saved quote is open: those values are the quote's own and read-only here.
import { computed } from "vue";
import { t } from "../../i18n";
import { EXACT_COST_CALC, LEGACY_CALC } from "../../engine/quote";
import { hasOlderCalc, repriceWithCurrentCalc, useCurrentSettings } from "../../state/quotes";
import { liveCurrency, store } from "../../state/store";

// Swapping in today's settings is only offered in the quote's own currency; otherwise the amounts would be misread.
// Calc 1 rounded cost per piece; calc 2 already had the exact cost and differs only in how markup meets the channel fees.
const olderText = computed(() => t((store.draft.frozenInput?.calc ?? LEGACY_CALC) >= EXACT_COST_CALC ? "quote.olderCalcMarkup" : "quote.olderCalc"));
const sameCurrency = computed(() => !store.draft.currency || store.draft.currency === liveCurrency.value);
</script>

<template>
  <div class="frozen-note row">
    <span class="sm oui-muted">{{ t("quote.frozenNote") }}</span>
    <Button text v-if="sameCurrency" type="button" @click="useCurrentSettings">{{ t("quote.useSettings") }}</Button>
    <template v-if="hasOlderCalc()">
      <span class="sm oui-muted">{{ olderText }}</span>
      <Button text type="button" @click="repriceWithCurrentCalc">{{ t("quote.repriceCalc") }}</Button>
    </template>
  </div>
</template>

<style scoped>
.frozen-note { flex-wrap: wrap; margin-bottom: var(--oui-s2); }
</style>
