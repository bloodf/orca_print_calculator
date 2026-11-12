<script setup lang="ts">
import Button from "primevue/button";
import ProgressBar from "primevue/progressbar";
import { computed, ref } from "vue";
import { call, errorCode } from "../../bridge";
import { count, date, duration, grams, quoteNo } from "../../format";
import { intlLocale, t } from "../../i18n";
import { savedOf } from "../../quoteFlow";
import { closeQuote, useCurrentSlice } from "../../state/quotes";
import { fetchSpoolman, liveCurrency, locale, patchDraft, plateOrigin, result, setPlates, setPlateControl, setView, slotMatches, store, useNewSlice } from "../../state/store";
import { toast } from "../../state/toast";
import EmptyState from "../base/EmptyState.vue";
import Icon from "../base/Icon.vue";
import InlineAlert from "../base/InlineAlert.vue";
import Stepper from "../base/Stepper.vue";
import ImportButton from "./ImportButton.vue";
import { importState } from "./importFlow";
import PlateCard from "./PlateCard.vue";

const frozen = computed(() => !!store.draft.frozenPlates);
const plates = computed(() => store.draft.frozenPlates ?? store.plates);
const rows = computed(() => (result.value.ok ? result.value.plates : []));
const ctl = (i: number) => store.draft.plates[i] ?? { include: true, copies: 1 };
const anyStale = computed(() => !frozen.value && store.plates.some((p) => p.stale));
const fileName = computed(() => store.plates.find((p) => p.source === "file")?.fileName ?? "");
const title = computed(() => store.host.projectName ?? t("header.untitled"));
const included = computed(() => plates.value.filter((p) => ctl(p.index).include));
// An unknown time or weight makes the sum unknown ("—"), never a smaller number.
const totalSeconds = computed(() => (included.value.some((p) => p.seconds === null) ? null : included.value.reduce((s, p) => s + (p.seconds ?? 0) * ctl(p.index).copies, 0)));
const allSlots = (i: number) => slotMatches.value[i] ?? [];
const totalGrams = computed(() => (included.value.some((p) => allSlots(p.index).some((m) => m.slot.grams === null)) ? null : included.value.reduce((s, p) => s + allSlots(p.index).reduce((a, m) => a + (m.slot.grams ?? 0), 0) * ctl(p.index).copies, 0)));
const meta = computed(() => t("plates.meta", { plates: t("plates.count", { n: plates.value.length }), time: totalSeconds.value === null ? "—" : duration(totalSeconds.value, locale.value), grams: totalGrams.value === null ? "—" : grams(totalGrams.value, locale.value) }));
const progress = computed(() => (importState.total ? Math.round((importState.loaded / importState.total) * 100) : 0));
const units = computed(() => t("plates.unitsPerSet", { n: store.draft.unitsPerSet, control: "\u0001" }).split("\u0001"));
const refreshing = ref(false);
const offline = computed(() => store.spoolman.state === "offline" && !!store.settings.spoolman.url);
// A quote saved in another currency keeps showing in it; mixing it with today's settings could misread every amount, so it only closes.
const otherCurrency = computed(() => (frozen.value && store.draft.currency && store.draft.currency !== liveCurrency.value ? store.draft.currency : null));
const bannerActions = computed(() => (otherCurrency.value ? [{ label: t("quote.close"), run: closeQuote }] : [{ label: t("quote.useCurrent"), run: useCurrentSlice }, { label: t("quote.close"), run: closeQuote }]));
const saved = computed(() => (frozen.value ? savedOf() : null));
const banner = computed(() => (saved.value ? t("quote.openBanner", { no: quoteNo(saved.value.no, intlLocale()), date: date(saved.value.updatedAt, locale.value) }) : ""));

async function refresh(): Promise<void> {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    const s = await call("get_state", {});
    store.host = s.host ?? store.host;
    setPlates(s.plates ?? []);
    void fetchSpoolman(true);
  } catch (e) {
    toast({ text: t("host.cmdFailed", { action: t("plates.refresh") }), tone: "bad" });
    console.error("get_state", errorCode(e));
  } finally {
    refreshing.value = false;
  }
}
</script>

<template>
  <section class="plates" :aria-labelledby="'plates-title'">
    <div v-if="frozen" class="alerts" data-quote-banner>
      <InlineAlert tone="info" :actions="bannerActions">
        <p v-if="banner">{{ banner }}</p><p v-if="otherCurrency" class="sm">{{ t("quote.currencyNote", { old: otherCurrency, now: liveCurrency }) }}</p><p v-if="store.pendingPlates" class="sm muted">{{ t("plates.newSlice") }}</p>
      </InlineAlert>
    </div>
    <div v-if="offline" class="alerts" data-spoolman-offline>
      <InlineAlert tone="warn" :actions="[{ label: t('spoolman.retry'), run: () => fetchSpoolman(false) }, { label: t('nav.settings'), run: () => setView('settings') }]"><p>{{ t("spoolman.offlineAlert", { url: store.settings.spoolman.url }) }}</p></InlineAlert>
    </div>
    <template v-if="plates.length === 0">
      <EmptyState art="plate" :title="store.host.projectName ? t('empty.plate.title') : t('empty.project.title')" :body="t('empty.plate.body')">
        <template #actions><ImportButton /></template>
      </EmptyState>
    </template>
    <template v-else>
      <div class="top">
        <div class="titles">
          <h2 id="plates-title" class="view-title truncate" tabindex="-1" data-view-title>{{ title }}</h2>
          <p class="num muted sm">{{ meta }}</p>
        </div>
        <div v-if="!frozen" class="row tools">
          <Button severity="secondary" outlined type="button" :aria-busy="refreshing ? 'true' : undefined" @click="refresh"><Icon name="refresh" /><span>{{ t("plates.refresh") }}</span></Button>
          <ImportButton />
        </div>
      </div>
      <ProgressBar
        v-if="importState.phase !== 'idle'" class="bar" :mode="importState.phase === 'reading' ? 'determinate' : 'indeterminate'" :value="importState.phase === 'reading' ? progress : undefined" :show-value="false"
        :aria-label="importState.phase === 'reading' ? t('plates.importing', { name: importState.name, size: '' }) : t('plates.importParsing', { name: importState.name })"
      />
      <div v-if="anyStale" class="alerts"><InlineAlert tone="warn"><p>{{ t("plates.staleAlert") }}</p><p class="sm muted">{{ t("plates.staleBlind") }}</p></InlineAlert></div>
      <div v-if="plateOrigin === 'import' && !frozen" class="alerts"><InlineAlert tone="info" :actions="store.pendingPlates ? [{ label: t('plates.useNewSlice'), run: useNewSlice }] : []"><p>{{ store.pendingPlates ? t("plates.newSlice") : t("plates.fromFile", { file: fileName }) }}</p></InlineAlert></div>
      <div v-else-if="store.pendingPlates && !frozen" class="alerts"><InlineAlert tone="info" :actions="[{ label: t('plates.useNewSlice'), run: useNewSlice }]"><p>{{ t("plates.newSlice") }}</p></InlineAlert></div>
      <div class="grid">
        <PlateCard
          v-for="p in plates" :key="p.index" :plate="p" :row="rows.find((r) => r.index === p.index) ?? null" :matches="slotMatches[p.index] ?? []"
          :include="ctl(p.index).include" :copies="ctl(p.index).copies" :stale="'stale' in p && p.stale" :frozen="frozen"
          @update:include="(v) => setPlateControl(p.index, { include: v })" @update:copies="(v) => setPlateControl(p.index, { copies: v })"
        />
      </div>
      <p class="units row">
        <span>{{ units[0] }}</span>
        <Stepper :model-value="store.draft.unitsPerSet" :min="1" :max="999" :label="t('field.unitsPerSet')" @update:model-value="(v) => patchDraft({ unitsPerSet: v })" />
        <span>{{ units[1] }}</span>
      </p>
    </template>
  </section>
</template>

<style scoped>
.top { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
.top > * { margin-bottom: 8px; }
.titles { min-width: 0; flex: 1 1 12rem; }
.tools { flex: none; flex-wrap: wrap; max-width: 100%; }
.plates :deep(.bar) { height: 6px; margin-bottom: 8px; }
.alerts { margin-bottom: 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr)); gap: 8px; }
.units { margin-top: 12px; flex-wrap: wrap; }
</style>
