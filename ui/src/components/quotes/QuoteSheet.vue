<script setup lang="ts">
// Customer sheet (docs/ux.md §9). Renders only the SheetModel whitelist; always light, it is paper.
import type { SheetModel } from "../../quoteExport";
defineProps<{ model: SheetModel }>();
</script>

<template>
  <article class="quote-sheet" :lang="model.lang">
    <header class="top">
      <p class="shop">{{ model.shop }}</p>
      <p class="no">{{ model.heading }}</p>
    </header>
    <div class="meta">
      <p v-if="model.customer"><span class="mu">{{ model.forLabel }}</span> {{ model.customer }}</p><p v-else />
      <p><span class="mu">{{ model.dateLabel }}</span> {{ model.dateValue }}</p>
    </div>
    <div v-if="model.validValue" class="meta"><p /><p><span class="mu">{{ model.validLabel }}</span> {{ model.validValue }}</p></div>
    <hr class="rule">
    <h2 class="title">{{ model.title }}</h2>
    <p v-if="model.quantityLine" class="small">{{ model.quantityLine }}</p>
    <table>
      <thead>
        <tr v-if="model.itemized"><th scope="col">{{ model.head.item }}</th><th scope="col" class="r">{{ model.head.amount }}</th></tr>
        <tr v-else><th scope="col">{{ model.head.item }}</th><th scope="col" class="r">{{ model.head.qty }}</th><th scope="col" class="r">{{ model.head.unit }}</th><th scope="col" class="r">{{ model.head.amount }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in model.rows" :key="i">
          <td>{{ r.label }}</td>
          <template v-if="!model.itemized"><td class="r">{{ r.qty }}</td><td class="r">{{ r.unit }}</td></template>
          <td class="r">{{ r.amount }}</td>
        </tr>
      </tbody>
    </table>
    <p class="sum"><span>{{ model.subtotal.label }}</span><span class="num">{{ model.subtotal.value }}</span></p>
    <p v-if="model.shipping" class="sum"><span>{{ model.shipping.label }}</span><span class="num">{{ model.shipping.value }}</span></p>
    <p v-if="model.discountNote" class="small">{{ model.discountNote }}</p>
    <p class="total"><span>{{ model.total.label }}</span><strong class="num">{{ model.total.value }}</strong></p>
    <p v-if="model.note" class="free">{{ model.note }}</p>
    <p v-if="model.footer" class="free mu">{{ model.footer }}</p>
    <p class="small">{{ model.made }}</p>
  </article>
</template>

<style scoped>
.quote-sheet { --paper: #FFFFFF; --ink: #2B2B2B; --mu: #5C6664; --rule: #00675B; --price: #8A5800; --line: #D9D9D9;
  width: 720px; max-width: 100%; margin: 0 auto; padding: 32px; background: var(--paper); color: var(--ink); font-size: 11pt; line-height: 1.45; border: 1px solid var(--line); }
.top, .meta, .sum, .total { display: flex; justify-content: space-between; align-items: baseline; }
.top > * + *, .meta > * + * { margin-left: 16px; }
.shop { font-size: var(--opc-fs-lg); font-weight: 600; }
.no, .mu, .small { color: var(--mu); }
.small { font-size: var(--opc-fs-sm); margin-top: 4px; }
.meta { margin-top: 6px; }
.rule { border: 0; border-top: 2px solid var(--rule); margin: 12px 0; }
.title { font-size: var(--opc-fs-lg); font-weight: 500; margin: 0 0 8px; }
table { width: 100%; border-collapse: collapse; }
th { padding: 4px 0; height: auto; font-weight: 500; color: var(--mu); border-bottom: 1px solid var(--mu); }
th.r, td.r { text-align: right; white-space: nowrap; padding-left: 12px; }
td { padding: 6px 0; border-bottom: 1px solid var(--line); }
.sum { margin-top: 6px; }
.total { margin-top: 12px; padding: 8px 12px; border: 1px solid var(--ink); align-items: center; }
.total strong { font-size: var(--opc-fs-xl); font-weight: 600; color: var(--price); }
.free { margin-top: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.title, .shop, td { overflow-wrap: anywhere; }
@media (max-width: 759px) { .quote-sheet { padding: 16px; } }
@media print {
  .quote-sheet { width: auto; margin: 0; padding: 0; border: 0; box-shadow: none; background: none; color: #000; font-size: 11pt; }
  .no, .mu, .small, th { color: #000; }
  .total strong { color: var(--price); }
}
</style>
