<script setup lang="ts">
import Button from "primevue/button";
// Narrow layout only: a 56px bar at the bottom while #price is off-screen (CalculatorView owns the IntersectionObserver).
// Contents render only while shown, so at most one price figure is ever in the DOM.
import { computed } from "vue";
import { t } from "../../i18n";
import { derived, store } from "../../state/store";
import { OuiIcon } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";
import { buildFlags } from "./flagList";
import { hero, m, missingCount, pct, priceFromFallback } from "./priceState";

defineProps<{ hidden: boolean }>();

const sel = computed(() => (hero.value.kind === "price" ? hero.value.sel : null));
const badCount = computed(() => buildFlags(derived.value, { m, pct }, { stale: false }).filter((f) => f.tone === "bad").length);
const text = computed(() => (hero.value.kind === "price" ? "" : hero.value.kind === "impossible" ? t("price.impossibleTitle", { channel: hero.value.channel }) : hero.value.text));

function toDetails(): void {
  const el = document.getElementById("price");
  el?.scrollIntoView({ block: "start" });
  el?.focus();
}
</script>

<template>
  <div class="price-bar app-chrome" data-price-bar :hidden="hidden" :aria-hidden="hidden">
    <template v-if="!hidden">
      <template v-if="sel">
        <span class="price-figure num" :class="{ partial: missingCount > 0 }">{{ m(sel.price) }}</span>
        <span v-if="missingCount > 0" class="oui-chip" data-tone="warn">{{ t("bar.incomplete") }}</span>
        <span v-else-if="priceFromFallback" class="oui-meta">{{ t("bar.origin") }}</span>
        <span class="oui-meta num">{{ pct(sel.marginBp) }}</span>
        <span v-if="store.draft.quantity > 1" class="oui-meta num total">{{ t("bar.total", { total: m(sel.grandTotal), n: store.draft.quantity }) }}</span>
        <span v-if="badCount" class="badge-wrap"><span class="oui-sr">{{ t("flag.srBad") }}</span><span class="oui-chip" data-tone="danger" data-solid>{{ badCount }}</span></span>
      </template>
      <span v-else class="oui-meta msg">{{ text }}</span>
      <Button severity="secondary" size="small" type="button" class="details" @click="toDetails"><span>{{ t("bar.details") }}</span><OuiIcon :icon="I.chevronDown" :size="14" /></Button>
    </template>
  </div>
</template>

<style scoped>
.price-bar { position: fixed; left: 0; right: 0; bottom: 0; height: 56px; z-index: 30; display: flex; align-items: center; gap: var(--oui-s3); padding: 0 var(--oui-s4); background: var(--oui-surface);
  border-top: 1px solid var(--oui-border); box-shadow: 0 -6px 16px rgb(0 0 0 / .12); transform: none; transition: transform var(--oui-base) var(--oui-ease); }
/* slides away instead of vanishing; its contents are already gone (one price at a time), visibility ends the tab stops */
.price-bar[hidden] { display: flex !important; transform: translateY(100%); visibility: hidden; pointer-events: none; transition: transform var(--oui-fast) var(--oui-ease), visibility 0s linear var(--oui-fast); }
.price-figure { font-size: 22px; font-weight: 700; line-height: 1.05; letter-spacing: -0.02em; color: var(--oui-text); }
.price-figure.partial { color: var(--oui-muted); text-decoration: underline dashed; text-underline-offset: 4px; }
.total { white-space: nowrap; }
.msg { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.details { margin-inline-start: auto; gap: var(--oui-s1); }
</style>
