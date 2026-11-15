<script setup lang="ts">
import Button from "primevue/button";
// Settings › Printers: per printer model watts, price, lifetime (docs/ux.md §5.3 Settings 5).
// One card per printer instead of a table: the base fields carry their own labels, so cards stay readable at 760px.
import { computed } from "vue";
import { matchPrinter } from "../../engine/printerMatch";
import { t } from "../../i18n";
import { currency, digits, patchSettings, store } from "../../state/store";
import { toast } from "../../state/toast";
import { presetFor } from "../../state/markup";
import type { PrinterProfile } from "../../state/types";
import { OuiIcon } from "../../../shared/src/components";
import * as I from "../../../shared/src/icons";
import MoneyField from "../base/MoneyField.vue";
import NumberField from "../base/NumberField.vue";
import { patchPrinter } from "../costs/shared";
import { UNIT } from "./units";

const current = computed(() => store.host.printerModel);
const models = computed(() => {
  const saved = Object.keys(store.settings.printers).sort((a, b) => a.localeCompare(b));
  return current.value ? [current.value, ...saved.filter((m) => m !== current.value)] : saved;
});
const profile = (m: string): PrinterProfile | undefined => store.settings.printers[m];
const match = (m: string) => matchPrinter(m, m === current.value ? (store.host.printerVendor ?? undefined) : undefined);
const shownWatts10 = (m: string): number => Math.round((profile(m)?.watts ?? match(m).watts) * 10);
const major = computed(() => 10 ** digits.value);

function remove(model: string): void {
  const prev = profile(model);
  if (!prev) return;
  patchSettings((s) => ({ printers: Object.fromEntries(Object.entries(s.printers).filter(([k]) => k !== model)) }));
  toast({
    text: t("printers.removed", { model }),
    action: { label: t("common.undo"), run: () => patchSettings((s) => ({ printers: { ...s.printers, [model]: prev } })) },
  });
}
</script>

<template>
  <div class="pp">
    <p class="sm oui-muted">{{ t("printers.help") }}</p>
    <p v-if="!models.length" class="oui-muted">{{ t("printers.empty") }}</p>
    <ul v-else class="pp-list">
      <li v-for="m in models" :key="m" class="pp-card surface">
        <div class="row pp-head">
          <span class="lg oui-truncate">{{ m }}</span>
          <span v-if="m === current" class="oui-chip badge" data-tone="accent">{{ t("printers.current") }}</span>
          <span class="pp-grow" />
          <Button text severity="secondary" v-if="profile(m)" type="button" class="icon-btn" :aria-label="t('common.removeNamed', { name: m })" @click="remove(m)"><OuiIcon :icon="I.trash" /></Button>
        </div>
        <div class="form-grid">
          <div>
            <NumberField
              :model-value="shownWatts10(m)" :label="t('field.watts')" :scale="10" :step="100" :min="10" :max="50000" :unit="UNIT.watt" :default-value="Math.round(match(m).watts * 10)"
              @update:model-value="(v) => v !== null && patchPrinter(m, { watts: v / 10 })" @reset="patchPrinter(m, { watts: null })"
            />
            <p class="sm oui-muted pp-sug">{{ t("printer.suggested", { watts: match(m).watts, how: t(`printer.how.${match(m).how}`) }) }} <span v-if="match(m).estimated" class="oui-chip badge" data-tone="warn">{{ t("printer.estimated") }}</span></p>
          </div>
          <MoneyField
            :model-value="profile(m)?.acquisitionMinor ?? presetFor(currency)?.printerMinor ?? null" :label="t('field.printerPrice')" :digits="digits" :currency="currency" :step="major" :max="10 ** 9 * major" nullable
            @update:model-value="(v) => patchPrinter(m, { acquisitionMinor: v })"
          />
          <NumberField :model-value="profile(m)?.lifetimeHours ?? presetFor(currency)?.lifetimeHours ?? null" :label="t('field.lifetime')" :scale="1" :step="100" :max="200000" :unit="UNIT.hours" nullable @update:model-value="(v) => patchPrinter(m, { lifetimeHours: v })" />
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.pp > * + * { margin-top: 8px; }
.pp-list { list-style: none; margin: 0; padding: 0; }
.pp-list > li + li { margin-top: 8px; }
.pp-card { padding: 8px 12px 12px; }
.pp-head { min-height: 32px; }
.pp-grow { flex: 1 1 auto; }
.pp-sug { margin-top: 2px; }
</style>
