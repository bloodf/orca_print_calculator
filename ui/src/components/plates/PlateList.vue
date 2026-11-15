<script setup lang="ts">
import ProgressBar from "primevue/progressbar";
import { computed } from "vue";
import { duration, grams } from "../../format";
import { t } from "../../i18n";
import { locale, patchDraft, result, setPlateControl, slotMatches, store } from "../../state/store";
import art from "../../assets/calculator-quote.webp";
import { OuiEmpty, OuiPanel } from "../../../shared/src/components";
import * as I from "../../../shared/src/icons";
import Stepper from "../base/Stepper.vue";
import ImportButton from "./ImportButton.vue";
import { importState } from "./importFlow";
import PlateCard from "./PlateCard.vue";

const frozen = computed(() => !!store.draft.frozenPlates);
const plates = computed(() => store.draft.frozenPlates ?? store.plates);
const rows = computed(() => (result.value.ok ? result.value.plates : []));
const ctl = (i: number) => store.draft.plates[i] ?? { include: true, copies: 1 };
const included = computed(() => plates.value.filter((p) => ctl(p.index).include));
// An unknown time or weight makes the sum unknown (and says so), never a smaller number.
const totalSeconds = computed(() => (included.value.some((p) => p.seconds === null) ? null : included.value.reduce((s, p) => s + (p.seconds ?? 0) * ctl(p.index).copies, 0)));
const allSlots = (i: number) => slotMatches.value[i] ?? [];
const totalGrams = computed(() => (included.value.some((p) => allSlots(p.index).some((m) => m.slot.grams === null)) ? null : included.value.reduce((s, p) => s + allSlots(p.index).reduce((a, m) => a + (m.slot.grams ?? 0), 0) * ctl(p.index).copies, 0)));
const meta = computed(() => t("plates.meta", { plates: t("plates.count", { n: plates.value.length }), time: totalSeconds.value === null ? t("breakdown.unknown.time") : duration(totalSeconds.value, locale.value), grams: totalGrams.value === null ? t("breakdown.unknown.grams") : grams(totalGrams.value, locale.value) }));
const progress = computed(() => (importState.total ? Math.round((importState.loaded / importState.total) * 100) : 0));
const units = computed(() => t("plates.unitsPerSet", { n: store.draft.unitsPerSet, control: "\u0001" }).split("\u0001"));
</script>

<template>
  <OuiPanel class="plates" :icon="I.plate" tone="cobalt" flush :meta="plates.length ? meta : undefined" aria-labelledby="plates-title">
    <template #title><span id="plates-title" tabindex="-1" data-view-title>{{ t("plates.title") }}</span></template>
    <ProgressBar
      v-if="importState.phase !== 'idle'" class="bar" :mode="importState.phase === 'reading' ? 'determinate' : 'indeterminate'" :value="importState.phase === 'reading' ? progress : undefined" :show-value="false"
      :aria-label="importState.phase === 'reading' ? t('plates.importing', { name: importState.name, size: '' }) : t('plates.importParsing', { name: importState.name })"
    />
    <OuiEmpty v-if="plates.length === 0" :image="art" :title="store.host.projectName ? t('empty.plate.title') : t('empty.project.title')" :text="t('empty.plate.body')">
      <template #actions><ImportButton /></template>
    </OuiEmpty>
    <div v-else class="grid">
      <PlateCard
        v-for="p in plates" :key="p.index" :plate="p" :row="rows.find((r) => r.index === p.index) ?? null" :matches="slotMatches[p.index] ?? []"
        :include="ctl(p.index).include" :copies="ctl(p.index).copies" :stale="'stale' in p && p.stale" :frozen="frozen"
        @update:include="(v) => setPlateControl(p.index, { include: v })" @update:copies="(v) => setPlateControl(p.index, { copies: v })"
      />
    </div>
    <template v-if="plates.length" #footer>
      <p class="units">
        <span>{{ units[0] }}</span>
        <Stepper :model-value="store.draft.unitsPerSet" :min="1" :max="999" :label="t('field.unitsPerSet')" @update:model-value="(v) => patchDraft({ unitsPerSet: v })" />
        <span>{{ units[1] }}</span>
      </p>
    </template>
  </OuiPanel>
</template>

<style scoped>
.plates :deep(.bar) { height: 4px; border-radius: 0; }
.grid { container: plates / inline-size; }
.grid > :deep(.card + .card) { border-top: 1px solid var(--oui-border); }
.units { display: flex; flex-wrap: wrap; align-items: center; gap: var(--oui-s2); }
</style>
