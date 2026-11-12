<script setup lang="ts">
import Button from "primevue/button";
// Why a quote can't be sent yet, field by field (docs/ux.md §6.12). A zero that an older saved quote cannot explain can be
// confirmed here on purpose; everything else is fixed by reading the slice again. Nothing is changed unless the user presses a button.
import { computed, nextTick } from "vue";
import { t } from "../../i18n";
import { confirmable, gapsOf, type Gap } from "../../state/completeness";
import { confirmGap, useCurrentSlice } from "../../state/quotes";
import { derived, store } from "../../state/store";
import { toast } from "../../state/toast";
import { requestPick } from "../plates/pickRequest";
import Icon from "../base/Icon.vue";

const frozen = computed(() => !!store.draft.frozenPlates);
const included = (index: number): boolean => store.draft.plates[index]?.include !== false;
const plateOf = (g: Gap) => derived.value.snapshots.find((p) => p.index + 1 === g.plate);
const rows = computed(() => gapsOf(derived.value.snapshots, included).map((g) => {
  const p = plateOf(g);
  const legacy = !!p && frozen.value && confirmable(p, g);
  const slot = "slot" in g ? g.slot : 0;
  const text = g.kind === "price" ? t("gap.price", { n: g.plate, slot })
    : t(`gap.${g.kind}${legacy || (g.kind === "time" && frozen.value && p?.secondsKnown === undefined) ? "Legacy" : ""}`, { n: g.plate, slot });
  const confirmLabel = !legacy ? "" : g.kind === "grams" ? t("gap.confirmGrams", { n: g.plate, slot }) : t("gap.confirmConsumption", { n: g.plate });
  const pick = g.kind === "price" ? { plate: g.plate - 1, slot: g.slot } : null; // the plate list is 0-based, the text 1-based
  return { g, id: `${g.kind}-${g.plate}-${slot}`, text, confirmLabel, pick };
}));

async function confirm(g: Gap): Promise<void> {
  confirmGap(g);
  toast({ text: t("gap.confirmed") });
  await nextTick();
  // the pressed button is gone: go to the next one, or to Save (the quote is now edited)
  (document.querySelector<HTMLElement>("[data-gap-confirm]") ?? document.getElementById("qa-save"))?.focus();
}
</script>

<template>
  <div v-if="rows.length" class="gaps" data-gaps tabindex="-1" role="group" :aria-label="t('gap.lead', { n: rows.length })">
    <p class="sm lead" role="status">{{ t("gap.lead", { n: rows.length }) }}</p>
    <ul>
      <li v-for="r in rows" :key="r.id" class="sm" :data-gap="r.id">
        <span class="ic"><Icon name="alert-circle" /></span>
        <span class="tx">{{ r.text }}</span>
        <Button v-if="r.pick" text type="button" data-gap-pick @click="requestPick(r.pick.plate, r.pick.slot)">{{ t("flag.pickSpool") }}</Button>
        <Button v-if="r.confirmLabel" text type="button" data-gap-confirm :aria-label="r.confirmLabel" @click="confirm(r.g)">{{ t("gap.confirm") }}</Button>
      </li>
    </ul>
    <p class="sm muted">{{ frozen ? t("gap.fromSaved") : t("gap.reslice") }}</p>
    <Button v-if="frozen" text type="button" class="use" @click="useCurrentSlice">{{ t("quote.useCurrent") }}</Button>
  </div>
</template>

<style scoped>
.gaps > * + * { margin-top: 6px; }
.lead { font-weight: 500; }
ul { list-style: none; margin: 0; padding: 0; }
li { display: flex; align-items: flex-start; padding: 3px 0; color: var(--opc-bad); }
.ic { display: inline-flex; padding-top: 1px; margin-right: 8px; }
.tx { flex: 1 1 auto; min-width: 0; }
li :deep(.p-button) { flex: none; margin-left: 8px; padding: 2px 8px; }
.use { margin-left: -8px; }
</style>
