<script setup lang="ts">
// The right column: PriceSummary (controls, hero, tiles, flags, actions) over the details sections (docs/ux.md §5.3).
// Keep `id="price-title"` on the hero label: the aside is aria-labelledby it. The price itself is announced by the
// shared live region in App.vue (debounced), so the visible number is not live.
import { computed } from "vue";
import { computeQuote } from "../../engine/quote";
import { t } from "../../i18n";
import { derived, result, store } from "../../state/store";
import QuoteActions from "../quotes/QuoteActions.vue";
import BatchTable from "./BatchTable.vue";
import BreakdownBars from "./BreakdownBars.vue";
import ChannelComparison from "./ChannelComparison.vue";
import OrderControls from "./OrderControls.vue";
import PriceFlags from "./PriceFlags.vue";
import { editChannelFees, focusSelector, hasPlates, hero, m, pct, signed } from "./priceState";
import { slotsWithoutPrice } from "./flagList";

// `all` is the wide column; at N the page renders the summary, then the sections, then the details (docs/ux.md §6.13).
withDefaults(defineProps<{ part?: "all" | "summary" | "details" }>(), { part: "all" });
const hasDetails = computed(() => hero.value.kind === "price" || (result.value.ok && result.value.channels.length >= 2));

const incomplete = computed(() => derived.value.notCounted.length > 0 || slotsWithoutPrice(derived.value).length > 0);
const label = computed(() => (incomplete.value ? t("price.labelIncomplete") : t("price.label")));
const sel = computed(() => (hero.value.kind === "price" ? hero.value.sel : null));
const sentence = computed(() => (hero.value.kind === "sentence" ? hero.value : null));
const q = computed(() => store.draft.quantity);
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
const orderQualifier = computed(() => {
  const s = sel.value;
  if (!s) return "";
  if (q.value > 1) return t("tile.orderProfit", { amount: signed(s.orderProfit) });
  return s.profitPerPrintHour === null ? "" : t("tile.perHour", { amount: signed(s.profitPerPrintHour) });
});
</script>

<template>
  <div v-if="part !== 'details' || hasDetails" class="panel surface" data-price-panel :class="`part-${part}`">
    <div v-if="part !== 'details'" class="summary">
      <OrderControls />
      <p id="price-title" class="sm muted label">{{ label }}</p>

      <div class="hero-wrap" data-price-hero>
      <div v-if="hero.kind === 'price' && sel" class="hero-box">
        <p class="price-amber num" data-testid="hero-price">{{ m(sel.price) }}</p>
        <p class="sm muted num sub">{{ sub }}</p>
      </div>

      <div v-else-if="hero.kind === 'impossible'" class="hero-box" data-testid="hero-impossible">
        <p class="xl-sentence">{{ t("price.impossibleTitle", { channel: hero.channel }) }}</p>
        <p class="sm muted body">{{ t("price.impossibleBody") }}</p>
        <div class="acts">
          <button type="button" class="btn ghost" @click="focusSelector('#price-margin')">{{ t("price.lowerMargin") }}</button>
          <button type="button" class="btn ghost" @click="editChannelFees()">{{ t("field.editChannelFees") }}</button>
        </div>
      </div>

      <div v-else-if="sentence" class="hero-box" data-testid="hero-sentence">
        <p :class="sentence.quiet ? 'sm muted' : 'xl-sentence'">{{ sentence.text }}</p>
        <div v-if="sentence.fees" class="acts"><button type="button" class="btn ghost" @click="editChannelFees()">{{ t("field.editChannelFees") }}</button></div>
      </div>
      </div>

      <div v-if="hero.kind === 'price' && sel" class="tiles">
        <div class="tile">
          <p class="sm muted">{{ t("tile.profit") }}</p>
          <p class="val num" :class="{ bad: sel.profit < 0 }" data-testid="profit">{{ signed(sel.profit) }}</p>
          <p class="sm muted num qual">{{ orderQualifier }}</p>
        </div>
        <div class="tile">
          <p class="sm muted">{{ t("tile.margin") }}</p>
          <p class="val num" :class="{ bad: sel.marginBp < 0 }" data-testid="margin">{{ pct(sel.marginBp) }}</p>
          <p class="sm muted num qual">{{ t("tile.breakEven", { amount: m(sel.breakEven) }) }}</p>
        </div>
      </div>

      <PriceFlags class="flags" />
      <QuoteActions v-if="hasPlates()" />
    </div>
    <div v-if="part !== 'summary'" class="details">
      <template v-if="hero.kind === 'price'"><BreakdownBars /></template>
      <ChannelComparison />
      <template v-if="hero.kind === 'price'"><BatchTable /></template>
    </div>
  </div>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; min-height: 0; }
.summary { flex: none; padding: 16px; }
.summary > * + * { margin-top: 12px; }
.label { margin-top: 16px !important; margin-bottom: 0; }
.hero-wrap, .hero-box { margin-top: 0 !important; }
.price-amber { font-size: var(--opc-fs-price); font-weight: 600; line-height: 1.05; letter-spacing: -0.02em; color: var(--opc-price); margin-top: 0; }
.sub { margin-top: 4px; min-height: 1.35em; white-space: normal; }
.tiles { display: grid; grid-template-columns: 1fr 1fr; margin-top: 16px !important; }
.tile { min-width: 0; padding-right: 12px; }
.tile + .tile { padding-left: 12px; padding-right: 0; border-left: 1px solid var(--opc-border); }
.val { font-size: var(--opc-fs-xl); font-weight: 600; line-height: 1.2; }
.val.bad { color: var(--opc-bad); }
.qual { min-height: 1.35em; white-space: normal; }
.xl-sentence { font-size: var(--opc-fs-xl); font-weight: 600; line-height: 1.2; }
.body { margin-top: 4px; }
.acts { margin-top: 8px; margin-left: -10px; }
.acts .btn + .btn { margin-left: 4px; }
.details { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 0 16px 16px; }
@media (min-width: 900px) and (min-height: 720px) { .panel { height: 100%; } }
@media (max-width: 899px), (max-height: 719px) { .details { overflow: visible; } }
@media (min-width: 900px) and (max-width: 1099px) { .price-amber { font-size: 34px; } }
</style>
