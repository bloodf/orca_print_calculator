<script setup lang="ts">
import Button from "primevue/button";
// Narrow layout only: a 56px bar at the bottom while #price is off-screen (CalculatorView owns the IntersectionObserver).
// Contents render only while shown, so at most one amber number is ever in the DOM.
import { computed } from "vue";
import { t } from "../../i18n";
import { derived, store } from "../../state/store";
import Badge from "../base/Badge.vue";
import Icon from "../base/Icon.vue";
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
        <span class="price-amber num" :class="{ partial: missingCount > 0 }">{{ m(sel.price) }}</span>
        <span v-if="missingCount > 0" class="sm warn-t">{{ t("bar.incomplete") }}</span>
        <span v-else-if="priceFromFallback" class="sm muted">{{ t("bar.origin") }}</span>
        <span class="sm muted num">{{ pct(sel.marginBp) }}</span>
        <span v-if="store.draft.quantity > 1" class="sm num total">{{ t("bar.total", { total: m(sel.grandTotal), n: store.draft.quantity }) }}</span>
        <span v-if="badCount" class="badge-wrap"><span class="sr-only">{{ t("flag.srBad") }}</span><Badge tone="bad" :text="String(badCount)" /></span>
      </template>
      <span v-else class="sm muted msg">{{ text }}</span>
      <Button severity="secondary" outlined type="button" class="details" @click="toDetails">{{ t("bar.details") }}<Icon name="chevron-down" /></Button>
    </template>
  </div>
</template>

<style scoped>
.price-bar { transform: none; transition: transform var(--opc-dur) var(--opc-ease-out); position: fixed; left: 0; right: 0; bottom: 0; height: 56px; z-index: 30; display: flex; align-items: center; padding: 0 12px; background: var(--opc-raised); border: 0 solid var(--opc-border); border-top-width: 1px; border-radius: 0; }
/* slides away instead of vanishing; its contents are already gone (one amber at a time), visibility ends the tab stops */
.price-bar[hidden] { display: flex; transform: translateY(100%); visibility: hidden; pointer-events: none; transition: transform var(--opc-dur-fast) var(--opc-ease), visibility 0s linear var(--opc-dur-fast); }
.price-bar > * + * { margin-left: 12px; }
.price-amber { font-size: 22px; font-weight: 600; line-height: 1.05; letter-spacing: -0.02em; color: var(--opc-price); }
.total { white-space: nowrap; }
.price-amber.partial { color: var(--opc-fg); }
.warn-t { color: var(--opc-warn); font-weight: 500; white-space: nowrap; }
.msg { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.details { margin-left: auto !important; }
</style>
