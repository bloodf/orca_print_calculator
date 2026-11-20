<script setup lang="ts">
import Button from "primevue/button";
// Flags under the price: only true flags render, bad first (docs/ux.md §6.12). Tone is icon + sr text, never colour alone.
import { computed } from "vue";
import { t } from "../../i18n";
import { derived, liveCurrency, store } from "../../state/store";
import { requestPick } from "../plates/pickRequest";
import { canPickSpool } from "../plates/slots";
import { invalidFields } from "../../state/invalid";
import { OuiIcon } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";
import { filamentShortages } from "../../state/extrasDemand";
import { buildFlags, type Flag, type FlagAction } from "./flagList";
import { editChannelFees, focusSelector, m, pct } from "./priceState";

const stale = computed(() => !store.draft.frozenPlates && store.plates.some((p) => p.stale));
// Money defaults were typed in another currency than the one in use now: say so where the price is.
const currencyFrom = computed(() => (!store.draft.frozenPlates && store.settings.defaultsCurrency && store.settings.defaultsCurrency !== liveCurrency.value ? store.settings.defaultsCurrency : null));
// Stock is read only from a Spoolman that answered: an offline one keeps no filament list.
const short = computed(() => (store.spoolman.state === "ok" ? filamentShortages(derived.value.quoteInput, derived.value.slotMatches, store.spoolman.data) : []));
const flags = computed(() => buildFlags(derived.value, { m, pct }, { stale: stale.value, invalid: Object.keys(invalidFields).length > 0, currencyFrom: currencyFrom.value, short: short.value, spoolman: store.spoolman.state === "ok" && canPickSpool() }));

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
    <li v-for="f in flags" :key="f.id" class="flag" :class="f.tone" :data-flag="f.id" :data-tone="f.tone" tabindex="-1">
      <OuiIcon class="flag-icon" :icon="f.tone === 'bad' ? I.error : I.info" :size="14" :tone="f.tone === 'bad' ? 'danger' : 'neutral'" />
      <span class="flag-text"><span class="oui-sr">{{ `${f.tone === "bad" ? t("flag.srBad") : t("flag.srInfo")} ` }}</span>{{ f.text }}</span>
      <Button v-if="f.action" text severity="secondary" size="small" type="button" class="flag-act" @click="run(f)">{{ f.action.label }}</Button>
    </li>
  </ul>
</template>

<style scoped>
.flags { list-style: none; padding: 0; display: grid; gap: 2px; }
.flag { display: flex; align-items: flex-start; gap: var(--oui-s2); font-size: var(--oui-text-sm); line-height: 1.4; color: var(--oui-muted); }
.flag.bad { color: var(--oui-danger); font-weight: 600; }
.flag-icon { flex: none; margin-top: 2px; }
.flag-text { flex: 1 1 auto; min-width: 0; padding-block: 1px; }
.flag-act { flex: none; margin-block: -3px; }
</style>
