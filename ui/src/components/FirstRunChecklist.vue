<script setup lang="ts">
// Inline 3-step setup checklist above the plate list; never a modal (docs/ux.md §2.4).
// A row shows its check as soon as its value is valid, but collapses only when focus leaves it, so typing is never interrupted.
import { computed, nextTick, reactive, ref, watch } from "vue";
import { money, percent, perKwh } from "../format";
import { t } from "../i18n";
import { currency, digits, finishOnboarding, locale, patchDefaults, store } from "../state/store";
import { toast } from "../state/toast";
import Icon from "./base/Icon.vue";
import MoneyField from "./base/MoneyField.vue";
import PercentField from "./base/PercentField.vue";
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
  return rate === null ? "" : t("setup.timeDone", { rate: money(rate, currency.value, locale.value), margin: percent(d.value.targetMarginBp, locale.value) });
};
// Connecting Spoolman can switch the currency (a guessed USD becomes the spools'). Typed amounts keep their digits, so say so.
watch(currency, (now, was) => {
  if (now !== was && (d.value.energyPerKwh !== null || d.value.laborPerHourMinor !== null)) toast({ text: t("setup.currencyChanged", { currency: now }), ms: 12000 });
});
const title = (row: Row): string => t(row === "filament" ? "setup.filament" : row === "energy" ? "setup.energy" : "setup.time");
</script>

<template>
  <section class="fr surface" aria-labelledby="setup-title">
    <h2 id="setup-title" class="lg">{{ t("setup.title") }}</h2>
    <ol class="fr-rows">
      <li v-for="row in rows" :key="row" class="fr-row" :data-row="row" @focusout="leave(row, $event)">
        <span class="fr-mark" :class="{ on: done[row] }" aria-hidden="true"><Icon v-if="done[row]" name="check" /></span>
        <div class="fr-main">
          <p v-if="collapsed[row] && done[row]" class="fr-line">
            <span class="fr-title">{{ title(row) }}</span><span class="muted"> · {{ summary(row) }} · </span>
            <button type="button" class="btn ghost fr-edit" @click="reopen(row)">{{ t("setup.edit") }}</button>
          </p>
          <template v-else>
            <p class="fr-title">{{ title(row) }}</p>
            <template v-if="row === 'filament'">
              <template v-if="spoolerUrl">
                <p class="sm muted">{{ t("setup.spoolerFound", { url: spoolerUrl }) }}</p>
                <div class="row fr-act"><button type="button" class="btn" @click="useSpooler">{{ t("setup.useSpoolman") }}</button><button type="button" class="btn ghost" @click="skip">{{ t("setup.skip") }}</button></div>
              </template>
              <template v-else>
                <div class="fr-url">
                  <input v-model="sp.url.value" type="text" inputmode="url" autocomplete="off" spellcheck="false" :placeholder="EXAMPLE_URL" :aria-label="t('spoolman.url')" :aria-invalid="sp.error.value ? 'true' : undefined" @keydown.enter="connect" />
                  <button type="button" class="btn" @click="connect">{{ t("setup.connect") }}</button>
                </div>
                <p v-if="sp.error.value" class="sm bad" role="alert">{{ sp.error.value }}</p>
                <button type="button" class="btn ghost fr-skip" @click="skip">{{ t("setup.skip") }}</button>
              </template>
            </template>
            <MoneyField
              v-else-if="row === 'energy'" :model-value="energyUnits(d.energyPerKwh, digits)" :label="t('field.energy')" :digits="digits + 2" :currency="currency" :step="10 ** digits" :unit="UNIT.kwh" nullable
              :helper="t('field.energyHelp')" width="md" @update:model-value="(v) => patchDefaults({ energyPerKwh: energyText(v, digits) })"
            />
            <div v-else class="row fr-time">
              <MoneyField :model-value="d.laborPerHourMinor" :label="t('field.laborRate')" :digits="digits" :currency="currency" :step="10 ** digits" :unit="UNIT.hour" nullable width="md" @update:model-value="(v) => patchDefaults({ laborPerHourMinor: v })" />
              <PercentField :model-value="d.targetMarginBp" :label="t('field.margin')" width="sm" @update:model-value="(v) => v !== null && patchDefaults({ targetMarginBp: v })" />
            </div>
          </template>
        </div>
      </li>
    </ol>
    <p class="sm muted fr-perm">{{ t("setup.permission") }}</p>
    <div class="fr-foot"><button type="button" class="btn primary" @click="finishOnboarding()">{{ t("setup.done") }}</button></div>
  </section>
</template>

<style scoped>
.fr { padding: 12px 16px 16px; }
.fr-rows { list-style: none; margin: 8px 0 0; padding: 0; }
.fr-row { display: grid; grid-template-columns: 20px minmax(0, 1fr); grid-column-gap: 12px; padding: 10px 0; border-top: 1px solid var(--opc-border); }
.fr-mark { width: 18px; height: 18px; margin-top: 1px; border: 1.5px solid var(--opc-border); border-radius: var(--opc-r-pill); display: inline-flex; align-items: center; justify-content: center; }
.fr-mark.on { background: var(--opc-primary-bg); border-color: var(--opc-primary-bg); color: var(--opc-accent-fg); }
.fr-mark :deep(svg) { width: 12px; height: 12px; }
.fr-title { font-weight: 500; }
.fr-main > * + * { margin-top: 6px; }
.fr-line > .fr-edit { height: 22px; padding: 0 6px; }
.fr-url { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-column-gap: 8px; max-width: 460px; }
.fr-act > * + * { margin-left: 8px; }
.fr-skip { margin-left: -10px; }
.fr-time { align-items: flex-start; }
.fr-perm { margin-top: 8px; max-width: 64ch; }
.fr-foot { margin-top: 12px; }
</style>
