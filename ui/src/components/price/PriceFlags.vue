<script setup lang="ts">
import Button from "primevue/button";
// Flags under the price: only true flags render, bad first (docs/ux.md §6.12). Tone is icon + sr text, never colour alone.
import { computed } from "vue";
import { t } from "../../i18n";
import { derived, liveCurrency, store } from "../../state/store";
import { requestPick } from "../plates/pickRequest";
import { invalidFields } from "../../state/invalid";
import Icon from "../base/Icon.vue";
import { buildFlags, type Flag, type FlagAction } from "./flagList";
import { editChannelFees, focusSelector, m, pct } from "./priceState";

const stale = computed(() => !store.draft.frozenPlates && store.plates.some((p) => p.stale));
// Money defaults were typed in another currency than the one in use now: say so where the price is.
const currencyFrom = computed(() => (!store.draft.frozenPlates && store.settings.defaultsCurrency && store.settings.defaultsCurrency !== liveCurrency.value ? store.settings.defaultsCurrency : null));
const flags = computed(() => buildFlags(derived.value, { m, pct }, { stale: stale.value, invalid: Object.keys(invalidFields).length > 0, currencyFrom: currencyFrom.value }));

// Field and chip ids are a contract with the cost and plate sections: #field-<key>, #chip-<plateIndex>-<slotN>.
const FIELD: Record<NonNullable<FlagAction["item"]>, { id: string; section: string }> = {
  energy: { id: "field-energyPerKwh", section: "machine" },
  labor: { id: "field-laborPerHourMinor", section: "labor" },
  wear: { id: "field-acquisitionMinor", section: "machine" },
};
function run(f: Flag): void {
  const a = f.action;
  if (!a) return;
  if (a.kind === "fees") editChannelFees();
  else if (a.kind === "spool" && a.plate !== undefined && a.slot !== undefined) requestPick(a.plate, a.slot);
  else if (a.item) void focusSelector(`#${FIELD[a.item].id}`, FIELD[a.item].section);
}
</script>

<template>
  <ul v-if="flags.length" class="flags">
    <li v-for="f in flags" :key="f.id" class="flag sm" :class="f.tone" :data-flag="f.id" :data-tone="f.tone" tabindex="-1">
      <span class="flag-icon"><Icon :name="f.tone === 'bad' ? 'alert-circle' : 'info'" /></span>
      <span class="flag-text"><span class="sr-only">{{ `${f.tone === "bad" ? t("flag.srBad") : t("flag.srInfo")} ` }}</span>{{ f.text }}</span>
      <Button text v-if="f.action" type="button" class="flag-act" @click="run(f)">{{ f.action.label }}</Button>
    </li>
  </ul>
</template>

<style scoped>
.flags { list-style: none; margin: 0; padding: 0; }
.flag { display: flex; align-items: flex-start; padding: 4px 0; color: var(--opc-muted); }
.flag.bad { color: var(--opc-bad); }
.flag-icon { display: inline-flex; padding-top: 1px; margin-right: 8px; }
.flag-text { flex: 1 1 auto; min-width: 0; }
.flag-act { flex: none; height: 24px; margin-left: 8px; padding: 0 6px; }
</style>
