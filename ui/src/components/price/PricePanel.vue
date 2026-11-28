<script setup lang="ts">
// The Price panel, the page's hero: the suggested price at its large size in a neutral block (tinted as a warning while the
// figure is partial, as an error for a loss), profit, margin and break-even; then what the price depends on, where it goes, and the quote's actions.
// The price itself is announced by the shared live region in App.vue (debounced), so the visible number is not live.
import Button from "primevue/button";
import { computed } from "vue";
import { OuiIcon, OuiPanel, OuiReadout } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";
import { computeQuote } from "../../engine/quote";
import { t } from "../../i18n";
import { exportBlock } from "../../quoteFlow";
import { currency, currencySource, derived, result, store } from "../../state/store";
import { gotoSettings } from "../costs/shared";
import GapList from "../quotes/GapList.vue";
import QuoteActions from "../quotes/QuoteActions.vue";
import QuoteFields from "../quotes/QuoteFields.vue";
import BatchTable from "./BatchTable.vue";
import BreakdownBars from "./BreakdownBars.vue";
import ChannelComparison from "./ChannelComparison.vue";
import OrderControls from "./OrderControls.vue";
import PriceFlags from "./PriceFlags.vue";
import { editChannelFees, focusMissing, focusSelector, hasPlates, hero, m, missingCount, pct, priceFromFallback, signed } from "./priceState";

const incomplete = computed(() => missingCount.value > 0);
const label = computed(() => (incomplete.value ? t("price.labelIncomplete") : t("price.label")));
const sel = computed(() => (hero.value.kind === "price" ? hero.value.sel : null));
// A whole, profitable price sits in the neutral block; a partial figure takes the warning tint and a loss the danger tint, so neither reads as done.
const heroTone = computed(() => (incomplete.value ? "warn" : sel.value && sel.value.profit < 0 ? "danger" : undefined));
const sentence = computed(() => (hero.value.kind === "sentence" ? hero.value : null));
const q = computed(() => store.draft.quantity);
const source = computed(() => t(currencySource.value === "spoolman" ? "header.currencyFromSpoolman" : "header.currencyFromSettings"));
const gapBlock = computed(() => { const b = exportBlock(); return b === "quote.blockedUnknown" || b === "quote.blockedIncomplete"; });
// The list of what is missing, right under the hero. While it shows, the amber hero and the list say "incomplete" between them:
// the one-line note that points at the list is only for a partial price with no such list (an unset rate, say).
const gapList = computed(() => hasPlates() && gapBlock.value);
// The price before rounding, from the same engine with rounding off (the engine does not report it).
const exactPrice = computed<number | null>(() => {
  const input = derived.value.quoteInput;
  if (input.pretty === "none") return null;
  try {
    const r = computeQuote({ ...input, pretty: "none" });
    const c = r.ok ? r.channels.find((x) => x.id === derived.value.selectedChannelId) : undefined;
    return c?.ok ? c.price : null;
  } catch { return null; }
});
const sub = computed(() => {
  const s = sel.value;
  if (!s) return "";
  if (q.value === 1 && s.shippingCharged === 0) return exactPrice.value !== null && exactPrice.value < s.price ? t("price.roundedUp", { price: m(exactPrice.value) }) : "";
  return t("price.orderTotal", { total: m(s.grandTotal), n: q.value }) + (s.shippingCharged > 0 ? ` ${t("price.inclShipping", { amount: m(s.shippingCharged) })}` : "");
});
// Past one piece (or with shipping on top) the order total is a result of its own, not a footnote under the unit price.
const orderLine = computed(() => !!sel.value && (q.value > 1 || sel.value.shippingCharged > 0));
const orderQualifier = computed(() => {
  const s = sel.value;
  if (!s) return "";
  if (q.value > 1) return t("tile.orderProfit", { amount: signed(s.orderProfit) });
  return s.profitPerPrintHour === null ? "" : t("tile.perHour", { amount: signed(s.profitPerPrintHour) });
});
const hasDetails = computed(() => hero.value.kind === "price" || (result.value.ok && result.value.channels.length >= 2));
</script>

<template>
  <OuiPanel class="panel" :icon="I.tag" tone="lime" data-price-panel>
    <template #title><span id="price-title">{{ t("price.title") }}</span></template>
    <template #actions>
      <Button severity="secondary" text size="small" type="button" class="cur num" :title="source" :aria-label="t('a11y.currency', { currency, source })" @click="gotoSettings('settings-general')">{{ currency }}</Button>
    </template>

    <div class="summary">
      <div class="hero-wrap" data-price-hero>
        <div v-if="hero.kind === 'price' && sel" class="oui-hero hero-box" :data-tone="heroTone">
          <OuiReadout class="hero" size="hero" :label="label" :incomplete="incomplete">
            <span class="price-figure" :class="{ partial: incomplete }" data-testid="hero-price">{{ m(sel.price) }}</span>
            <template v-if="sub || priceFromFallback" #sub>
              <span v-if="sub" class="num sub" :class="{ 'order-line': orderLine }" data-testid="order-line">{{ sub }}</span>
              <span v-if="priceFromFallback" class="origin" data-testid="price-origin">{{ t("price.originFallback") }}</span>
            </template>
          </OuiReadout>
          <div class="tiles">
            <OuiReadout class="tile" :class="{ bad: sel.profit < 0 }" :label="t('tile.profit')" :incomplete="incomplete" :sub="orderQualifier || undefined"><span :class="{ bad: sel.profit < 0 }" data-testid="profit">{{ signed(sel.profit) }}</span><span v-if="incomplete" class="oui-sr"> · {{ t("price.partial") }}</span></OuiReadout>
            <OuiReadout class="tile" :class="{ bad: sel.marginBp < 0 }" :label="t('tile.margin')" :incomplete="incomplete"><span :class="{ bad: sel.marginBp < 0 }" data-testid="margin">{{ pct(sel.marginBp) }}</span><span v-if="incomplete" class="oui-sr"> · {{ t("price.partial") }}</span></OuiReadout>
            <OuiReadout class="tile" :label="t('tile.breakEvenLabel')" :incomplete="incomplete"><span data-testid="break-even">{{ m(sel.breakEven) }}</span></OuiReadout>
          </div>
        </div>

        <div v-else-if="hero.kind === 'impossible'" class="oui-hero hero-box" data-tone="danger" data-testid="hero-impossible">
          <p class="xl-sentence">{{ t("price.impossibleTitle", { channel: hero.channel }) }}</p>
          <p class="oui-meta">{{ t("price.impossibleBody") }}</p>
        </div>

        <div v-else-if="sentence" class="oui-hero hero-box" data-tone="neutral" data-testid="hero-sentence">
          <p :class="sentence.quiet ? 'oui-muted' : 'xl-sentence'">{{ sentence.text }}</p>
        </div>
      </div>
      <!-- a hero holds no buttons: what it offers sits under it -->
      <p v-if="sel && incomplete && !gapList" class="inc-line" data-testid="incomplete-line">
        <OuiIcon :icon="I.warning" :size="14" tone="warn" /><span class="inc-tx">{{ t("price.incomplete", { n: missingCount }) }}</span>
        <Button text severity="secondary" size="small" type="button" class="inc-act" data-testid="see-missing" @click="focusMissing">{{ t("price.seeMissing") }}</Button>
      </p>
      <div v-if="hero.kind === 'impossible'" class="oui-row acts" data-testid="hero-actions">
        <Button severity="secondary" size="small" type="button" @click="focusSelector('#price-margin')">{{ t("price.lowerMargin") }}</Button>
        <Button text severity="secondary" size="small" type="button" @click="editChannelFees()">{{ t("field.editChannelFees") }}</Button>
      </div>
      <div v-else-if="sentence?.fees" class="oui-row acts" data-testid="hero-actions"><Button severity="secondary" size="small" type="button" @click="editChannelFees()">{{ t("field.editChannelFees") }}</Button></div>

      <GapList v-if="gapList" />
      <PriceFlags class="flags" />
      <!-- nothing to price yet: no channel, pieces or markup to set either -->
      <OrderControls v-if="hasPlates()" />
    </div>
    <div v-if="hasDetails" class="details">
      <template v-if="hero.kind === 'price'"><BreakdownBars /></template>
      <ChannelComparison />
      <template v-if="hero.kind === 'price'"><BatchTable /></template>
    </div>
    <!-- what names the quote sits last, next to Save: when the panel is taller than the window, the price and what it depends on stay in view -->
    <QuoteFields v-if="hasPlates()" class="naming" />
    <template v-if="hasPlates()" #footer><QuoteActions /></template>
  </OuiPanel>
</template>

<style scoped>
.summary { display: grid; gap: var(--oui-s3); min-width: 0; }
.hero :deep(.oui-readout-value) { font-size: 48px; }
.sub, .origin { display: block; }
.order-line { font-size: var(--oui-text-md); font-weight: 600; overflow-wrap: anywhere; white-space: normal; }
.tiles { display: flex; flex-wrap: wrap; gap: var(--oui-s3) var(--oui-s6); padding-top: var(--oui-s3); border-top: 1px solid var(--oui-border); }
.tile.bad :deep(.oui-readout-value) { color: var(--oui-danger); }
.xl-sentence { font-size: var(--oui-text-xl); font-weight: 650; line-height: 1.2; }
.inc-line { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; font-weight: 600; color: var(--oui-warning); }
.inc-act { margin-inline-start: auto; }
.details { display: grid; margin-top: var(--oui-s4); min-width: 0; }
.naming { margin-top: var(--oui-s3); padding-top: var(--oui-s3); border-top: 1px solid var(--oui-border); }
.cur { font-weight: 650; border: 1px solid var(--oui-border); }
</style>
