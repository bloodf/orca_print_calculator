<script setup lang="ts">
import Button from "primevue/button";
// Why a quote can't be sent yet, field by field (docs/ux.md §6.12). A zero that an older saved quote cannot explain can be
// confirmed here on purpose; everything else is fixed by reading the slice again. Nothing is changed unless the user presses a button.
import { computed, nextTick } from "vue";
import { t } from "../../i18n";
import { confirmable, gapsOf, type Gap } from "../../state/completeness";
import { confirmGap, useCurrentSlice } from "../../state/quotes";
import { derived, store } from "../../state/store";
import { showToast } from "@orca-plugins/ui-foundation/src/components";
import { requestPick } from "../plates/pickRequest";
import { OuiIcon } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";

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
  showToast({ title: t("gap.confirmed") });
  await nextTick();
  // the pressed button is gone: go to the next one, or to Save (the quote is now edited)
  (document.querySelector<HTMLElement>("[data-gap-confirm]") ?? document.getElementById("qa-save"))?.focus();
}
</script>

<template>
  <div v-if="rows.length" id="quote-gaps" class="gaps oui-well" data-gaps tabindex="-1" role="group" :aria-label="t('gap.lead', { n: rows.length })">
    <p class="lead oui-strong" role="status">{{ t("gap.lead", { n: rows.length }) }}</p>
    <ul>
      <li v-for="r in rows" :key="r.id" :data-gap="r.id">
        <OuiIcon :icon="I.warning" :size="14" tone="warn" />
        <span class="tx">{{ r.text }}</span>
        <Button v-if="r.pick" text severity="secondary" size="small" type="button" data-gap-pick @click="requestPick(r.pick.plate, r.pick.slot)">{{ t("flag.pickSpool") }}</Button>
        <Button v-if="r.confirmLabel" text severity="secondary" size="small" type="button" data-gap-confirm :aria-label="r.confirmLabel" @click="confirm(r.g)">{{ t("gap.confirm") }}</Button>
      </li>
    </ul>
    <p class="oui-meta">{{ frozen ? t("gap.fromSaved") : t("gap.reslice") }}</p>
    <Button v-if="frozen" severity="secondary" size="small" type="button" class="use" @click="useCurrentSlice">{{ t("quote.useCurrent") }}</Button>
  </div>
</template>

<style scoped>
.gaps { display: grid; gap: 6px; padding: var(--oui-s3); }
ul { list-style: none; padding: 0; display: grid; gap: 2px; }
/* a sentence that runs to two lines keeps its button whole, on its first line: the text gives way, never the button */
li { display: flex; align-items: flex-start; gap: var(--oui-s2); min-height: 26px; }
li > :deep(.oui-icon) { flex: none; margin-top: 6px; }
li > :deep(.p-button) { flex: none; white-space: nowrap; }
.tx { flex: 1 1 auto; min-width: 0; padding-block: 3px; }
.use { justify-self: start; }
</style>
