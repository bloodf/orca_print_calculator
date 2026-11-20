<script setup lang="ts">
// Extras and accessories (docs/ux.md §5.3): rows live in the quote draft (per-quote only, no override dot).
import { computed } from "vue";
import { intlLocale, t } from "../../i18n";
import { money } from "../../format";
import { currency, store } from "../../state/store";
import * as I from "@orca-plugins/ui-foundation/src/icons";
import Section from "../base/Section.vue";
import ExtrasEditor from "./ExtrasEditor.vue";
import { hasProblem, perPiece, sectionAmount, useOpen } from "./shared";

const { open, set: setOpen } = useOpen("extras", () => false);
const n = computed(() => store.draft.extras.length);
const summary = computed(() => {
  if (!n.value) return t("summary.none");
  const amount = perPiece("extras", "orderExtras");
  return amount === null ? "" : t("summary.extras", { n: n.value, amount: money(amount, currency.value, intlLocale()) });
});
const amount = computed(() => sectionAmount("extras", "orderExtras"));
</script>

<template>
  <Section id="extras" help="extras" :icon="I.parcel" tone="violet" :amount="amount.amount" :title="t('section.extras')" :summary="summary" :open="open" :invalid="hasProblem('extras')" @update:open="setOpen">
    <ExtrasEditor />
  </Section>
</template>
