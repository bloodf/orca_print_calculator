<script setup lang="ts">
// Inline 3-step setup checklist above the plate list; never a modal (docs/ux.md §2.4).
// A row shows its check as soon as its value is valid, but collapses only when focus leaves it, so typing is never interrupted.
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import { computed, nextTick, reactive, ref, watch } from "vue";
import { money, percent, perKwh } from "../format";
import { t } from "../i18n";
import { currency, digits, finishOnboarding, locale, patchDefaults, store } from "../state/store";
import { markupOf } from "../state/markup";
import { showToast } from "../../shared/src/components";
import { OuiIcon, OuiPanel } from "../../shared/src/components";
import * as I from "../../shared/src/icons";
import MoneyField from "./base/MoneyField.vue";
import MarkupField from "./base/MarkupField.vue";
import { energyText, energyUnits } from "./costs/shared";
import { EXAMPLE_URL, useSpoolmanUrl } from "./settings/useSpoolmanUrl";
import { UNIT } from "./settings/units";

type Row = "filament" | "energy" | "time";
const d = computed(() => store.settings.defaults);
const sp = useSpoolmanUrl();
const skipped = ref(false);
const done = computed<Record<Row, boolean>>(() => ({
  filament: !!store.settings.spoolman.url || skipped.value,
  energy: d.value.energyPerKwh !== null,
  time: d.value.laborPerHourMinor !== null,
}));
const collapsed = reactive<Record<Row, boolean>>({ filament: done.value.filament, energy: done.value.energy, time: done.value.time });
const spoolerUrl = computed(() => (store.spooler?.url && !store.settings.spoolman.url ? store.spooler.url : null));
const rows: Row[] = ["filament", "energy", "time"];

function leave(row: Row, e: FocusEvent): void {
  const li = e.currentTarget as HTMLElement;
  if (!li.contains(e.relatedTarget as Node | null) && done.value[row]) collapsed[row] = true;
}
async function reopen(row: Row): Promise<void> {
  collapsed[row] = false;
  await nextTick();
  document.querySelector<HTMLElement>(`[data-row="${row}"] input`)?.focus();
}
const connect = (): void => { if (sp.commit() && sp.url.value.trim()) collapsed.filament = true; };
const useSpooler = (): void => { if (spoolerUrl.value && sp.use(spoolerUrl.value)) collapsed.filament = true; };
const skip = (): void => { skipped.value = true; collapsed.filament = true; };
const summary = (row: Row): string => {
  if (row === "filament") return store.settings.spoolman.url ? t("setup.filamentDone", { url: store.settings.spoolman.url }) : t("setup.skipped");
  if (row === "energy") { const u = energyUnits(d.value.energyPerKwh, digits.value); return u === null ? "" : perKwh(u, currency.value, locale.value); }
  const rate = d.value.laborPerHourMinor;
  return rate === null ? "" : t("setup.timeDone", { rate: money(rate, currency.value, locale.value), margin: percent(markupOf(d.value.targetMarginBp), locale.value) });
};
// Connecting Spoolman can switch the currency (a guessed USD becomes the spools'). Typed amounts keep their digits, so say so.
watch(currency, (now, was) => {
  if (now !== was && (d.value.energyPerKwh !== null || d.value.laborPerHourMinor !== null)) showToast({ title: t("setup.currencyChanged", { currency: now }), timeout: 12000 });
});
const title = (row: Row): string => t(row === "filament" ? "setup.filament" : row === "energy" ? "setup.energy" : "setup.time");
</script>

<template>
  <OuiPanel class="fr" :icon="I.wrench" :hint-label="t('setup.title')" aria-labelledby="setup-title">
    <template #title><span id="setup-title">{{ t("setup.title") }}</span></template>
    <!-- what the plugin is allowed to read: behind the (i), said in full in Settings > About -->
    <template #hint><span class="fr-perm">{{ t("setup.permission") }}</span></template>
    <!-- the checklist is a notice too: closing it is the same as Done (onboarding is saved) -->
    <template #actions><Button text severity="secondary" size="small" type="button" class="icon-btn-sm" :aria-label="t('common.close')" :title="t('common.close')" data-setup-close @click="finishOnboarding()"><OuiIcon :icon="I.x" :size="14" /></Button></template>
    <ol class="fr-rows">
      <li v-for="row in rows" :key="row" class="fr-row" :data-row="row" @focusout="leave(row, $event)">
        <span class="fr-mark" :class="{ on: done[row] }" aria-hidden="true"><OuiIcon v-if="done[row]" :icon="I.check" :size="12" /></span>
        <div class="fr-main">
          <p v-if="collapsed[row] && done[row]" class="fr-line">
            <span class="fr-title">{{ title(row) }}</span><span class="oui-muted"> · {{ summary(row) }} · </span>
            <Button text type="button" class="fr-edit" @click="reopen(row)">{{ t("setup.edit") }}</Button>
          </p>
          <template v-else>
            <p class="fr-title">{{ title(row) }}</p>
            <template v-if="row === 'filament'">
              <template v-if="spoolerUrl">
                <p class="sm oui-muted">{{ t("setup.spoolerFound", { url: spoolerUrl }) }}</p>
                <div class="row fr-act"><Button severity="secondary" type="button" @click="useSpooler">{{ t("setup.useSpoolman") }}</Button><Button text type="button" @click="skip">{{ t("setup.skip") }}</Button></div>
              </template>
              <template v-else>
                <div class="fr-url">
                  <InputText v-model="sp.url.value" type="text" inputmode="url" autocomplete="off" spellcheck="false" :placeholder="EXAMPLE_URL" :aria-label="t('spoolman.url')" :invalid="!!sp.error.value" :aria-invalid="sp.error.value ? 'true' : undefined" @keydown.enter="connect" />
                  <Button severity="secondary" type="button" @click="connect">{{ t("setup.connect") }}</Button>
                </div>
                <p v-if="sp.error.value" class="sm bad" role="alert">{{ sp.error.value }}</p>
                <Button text type="button" class="fr-skip" @click="skip">{{ t("setup.skip") }}</Button>
              </template>
            </template>
            <MoneyField
              v-else-if="row === 'energy'" :model-value="energyUnits(d.energyPerKwh, digits)" :label="t('field.energy')" :digits="digits + 2" :currency="currency" :step="10 ** digits" :unit="UNIT.kwh" nullable
              :helper="t('field.energyHelp')" width="md" @update:model-value="(v) => patchDefaults({ energyPerKwh: energyText(v, digits) })"
            />
            <div v-else class="row fr-time">
              <MoneyField :model-value="d.laborPerHourMinor" :label="t('field.laborRate')" :digits="digits" :currency="currency" :step="10 ** digits" :unit="UNIT.hour" nullable width="md" @update:model-value="(v) => patchDefaults({ laborPerHourMinor: v })" />
              <MarkupField :model-value="d.targetMarginBp" :label="t('field.margin')" width="sm" @update:model-value="(v) => patchDefaults({ targetMarginBp: v })" />
            </div>
          </template>
        </div>
      </li>
    </ol>
    <template #footer><Button type="button" @click="finishOnboarding()"><OuiIcon :icon="I.check" :size="14" /><span>{{ t("setup.done") }}</span></Button></template>
  </OuiPanel>
</template>

<style scoped>
.fr-rows { list-style: none; margin: 0; padding: 0; }
.fr-row { display: grid; grid-template-columns: 20px minmax(0, 1fr); grid-column-gap: 12px; padding: 10px 0; }
.fr-row + .fr-row { border-top: 1px solid var(--oui-border); }
.fr-mark { width: 18px; height: 18px; margin-top: 1px; border: 1.5px solid var(--oui-border); border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; }
.fr-mark.on { background: var(--oui-primary); border-color: var(--oui-primary); color: var(--oui-on-primary); }
.fr-mark :deep(svg) { width: 12px; height: 12px; }
.fr-title { font-weight: 600; }
.fr-main > * + * { margin-top: 6px; }
.fr-line :deep(.fr-edit) { padding: 2px 6px; }
.fr-url { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-column-gap: 8px; max-width: 460px; }
.fr-act > * + * { margin-left: 8px; }
.fr-skip { margin-left: -10px; }
.fr-time { align-items: flex-start; }
</style>
