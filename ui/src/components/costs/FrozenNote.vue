<script setup lang="ts">
import Button from "primevue/button";
// Shown in the printer and sales sections while a saved quote is open: those values are the quote's own and read-only here.
import { computed } from "vue";
import { t } from "../../i18n";
import { hasOlderCalc, repriceWithCurrentCalc, useCurrentSettings } from "../../state/quotes";
import { liveCurrency, store } from "../../state/store";

// Swapping in today's settings is only offered in the quote's own currency; otherwise the amounts would be misread.
const sameCurrency = computed(() => !store.draft.currency || store.draft.currency === liveCurrency.value);
</script>

<template>
  <div class="frozen-note row">
    <span class="sm muted">{{ t("quote.frozenNote") }}</span>
    <Button text v-if="sameCurrency" type="button" @click="useCurrentSettings">{{ t("quote.useSettings") }}</Button>
    <template v-if="hasOlderCalc()">
      <span class="sm muted">{{ t("quote.olderCalc") }}</span>
      <Button text type="button" @click="repriceWithCurrentCalc">{{ t("quote.repriceCalc") }}</Button>
    </template>
  </div>
</template>

<style scoped>
.frozen-note { flex-wrap: wrap; margin-bottom: var(--opc-s2); }
</style>
