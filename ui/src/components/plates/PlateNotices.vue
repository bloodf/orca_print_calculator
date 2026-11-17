<script setup lang="ts">
// What the whole calculator page needs said, once each, under the app bar: settings that were reset, unreadable files, the open
// saved quote, Spoolman not answering, plates that may be out of date, where the plates came from, and a quote that is incomplete.
import Button from "primevue/button";
import { computed } from "vue";
import { OuiBanner } from "../../../shared/src/components";
import { filesText } from "../../files";
import { date, quoteNo } from "../../format";
import { intlLocale, t } from "../../i18n";
import { exportBlock, savedOf } from "../../quoteFlow";
import { closeQuote, useCurrentSlice } from "../../state/quotes";
import { dismissSettingsReset, fetchSpoolman, liveCurrency, locale, plateOrigin, setView, store, useNewSlice } from "../../state/store";
import { lead } from "../base/lead";
import { hero, missingCount } from "../price/priceState";
import { settingLabel } from "../settingLabels";

const frozen = computed(() => !!store.draft.frozenPlates);
const anyStale = computed(() => !frozen.value && store.plates.some((p) => p.stale));
const fileName = computed(() => store.plates.find((p) => p.source === "file")?.fileName ?? "");
const offline = computed(() => store.spoolman.state === "offline" && !!store.settings.spoolman.url);
// A quote saved in another currency keeps showing in it; mixing it with today's settings could misread every amount, so it only closes.
const otherCurrency = computed(() => (frozen.value && store.draft.currency && store.draft.currency !== liveCurrency.value ? store.draft.currency : null));
const saved = computed(() => (frozen.value ? savedOf() : null));
const open = computed(() => lead(saved.value ? t("quote.openBanner", { no: quoteNo(saved.value.no, intlLocale()), date: date(saved.value.updatedAt, locale.value) }) : t("quote.title")));
const reset = computed(() => lead(t("settings.reset", { names: store.settingsReset.map(settingLabel).join(", ") })));
const unreadable = computed(() => lead(t("host.unreadable", { files: filesText(store.unreadable) })));
const off = computed(() => lead(t("spoolman.offlineAlert", { url: store.settings.spoolman.url })));
const stale = computed(() => lead(t("plates.staleAlert")));
const origin = computed(() => lead(store.pendingPlates ? t("plates.newSlice") : t("plates.fromFile", { file: fileName.value })));
// A price on screen that leaves something out: say it once here; the price panel lists the items and the blocked actions point at this.
const incomplete = computed(() => hero.value.kind === "price" && missingCount.value > 0);
const blocked = computed(() => !!exportBlock());
// Each notice can be closed; its key names what it is about, so it comes back when that changes, not on every refresh.
const close = computed(() => t("common.close"));
const sliceKey = (plates: readonly { index: number; seconds: number | null }[] | null): string => (plates ?? []).map((p) => `${p.index}:${p.seconds}`).join(",");
const keys = computed(() => ({
  unreadable: `unreadable:${store.unreadable.join(",")}`,
  quote: `quote-open:${saved.value?.id ?? "draft"}:${otherCurrency.value ?? ""}:${sliceKey(store.pendingPlates)}`,
  offline: `spoolman-down:${store.settings.spoolman.url}`,
  stale: `stale:${store.plates.filter((p) => p.stale).map((p) => p.index).join(",")}`,
  origin: `origin:${fileName.value}:${sliceKey(store.pendingPlates)}`,
  pending: `new-slice:${sliceKey(store.pendingPlates)}`,
  incomplete: `incomplete:${missingCount.value}:${blocked.value}`,
}));
</script>

<template>
  <OuiBanner v-if="store.settingsReset.length" tone="warn" :title="reset[0]" data-settings-reset dismissible :close-label="close" @dismiss="dismissSettingsReset">{{ reset[1] }}</OuiBanner>
  <OuiBanner v-if="store.unreadable.length" tone="error" :title="unreadable[0]" data-unreadable dismissible :dismiss-key="keys.unreadable" :close-label="close">{{ unreadable[1] }}</OuiBanner>
  <OuiBanner v-if="frozen" tone="info" :title="open[0]" data-quote-banner dismissible :dismiss-key="keys.quote" :close-label="close">
    {{ open[1] }} <span v-if="otherCurrency">{{ t("quote.currencyNote", { old: otherCurrency, now: liveCurrency }) }} </span><span v-if="store.pendingPlates">{{ t("plates.newSlice") }}</span>
    <template #actions>
      <Button v-if="!otherCurrency" severity="secondary" size="small" type="button" @click="useCurrentSlice">{{ t("quote.useCurrent") }}</Button>
      <Button severity="secondary" size="small" type="button" @click="closeQuote">{{ t("quote.close") }}</Button>
    </template>
  </OuiBanner>
  <OuiBanner v-if="offline" tone="warn" :title="off[0]" data-spoolman-offline dismissible :dismiss-key="keys.offline" :close-label="close">
    {{ off[1] }}
    <template #actions>
      <Button severity="secondary" size="small" type="button" @click="fetchSpoolman(false)">{{ t("spoolman.retry") }}</Button>
      <Button text severity="secondary" size="small" type="button" @click="setView('settings')">{{ t("nav.settings") }}</Button>
    </template>
  </OuiBanner>
  <OuiBanner v-if="anyStale" tone="warn" :title="stale[0]" data-stale dismissible :dismiss-key="keys.stale" :close-label="close">{{ stale[1] }} {{ t("plates.staleBlind") }}</OuiBanner>
  <OuiBanner v-if="plateOrigin === 'import' && !frozen" tone="info" :title="origin[0]" data-origin dismissible :dismiss-key="keys.origin" :close-label="close">
    {{ origin[1] }}
    <template v-if="store.pendingPlates" #actions><Button severity="secondary" size="small" type="button" @click="useNewSlice">{{ t("plates.useNewSlice") }}</Button></template>
  </OuiBanner>
  <OuiBanner v-else-if="store.pendingPlates && !frozen" tone="info" :title="t('plates.newSlice')" data-origin dismissible :dismiss-key="keys.pending" :close-label="close">
    <template #actions><Button severity="secondary" size="small" type="button" @click="useNewSlice">{{ t("plates.useNewSlice") }}</Button></template>
  </OuiBanner>
  <OuiBanner v-if="incomplete" id="quote-incomplete" tone="warn" :title="t('price.incompleteTitle', { n: missingCount })" data-incomplete-banner dismissible :dismiss-key="keys.incomplete" :close-label="close">
    {{ t("price.incompleteBody") }}{{ blocked ? ` ${t("price.incompleteBlocked")}` : "" }}
  </OuiBanner>
</template>
