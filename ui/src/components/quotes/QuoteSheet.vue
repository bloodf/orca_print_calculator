<script setup lang="ts">
// Customer sheet (docs/ux.md §9). Renders only the SheetModel whitelist; always light, it is paper.
import type { SheetModel } from "../../quoteExport";
defineProps<{ model: SheetModel }>();
</script>

<template>
  <article class="quote-sheet" :lang="model.lang" :style="{ '--rule': model.accent }">
    <header class="top">
      <div>
        <img v-if="model.logo" class="logo" :src="model.logo" alt="">
        <p class="shop">{{ model.shop }}</p>
        <p v-for="(c, i) in model.contact" :key="i" class="co">{{ c }}</p>
      </div>
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
    <p v-if="model.payment" class="free"><strong>{{ model.payment.label }}</strong><br>{{ model.payment.text }}</p>
    <p v-if="model.footer" class="free mu">{{ model.footer }}</p>
    <p class="small">{{ model.made }}</p>
  </article>
</template>

<style scoped>
.quote-sheet { --paper: #FFFFFF; --ink: #1F2328; --mu: #5C6664; --rule: #446600; --line: #DDE1E0; --band: #F4F6F5;
  width: 720px; max-width: 100%; margin: 0 auto; padding: 32px; background: var(--paper); color: var(--ink); font-size: 11pt; line-height: 1.45; border: 1px solid var(--line); }
.top, .meta, .sum, .total { display: flex; justify-content: space-between; align-items: baseline; }
.top { align-items: flex-start; }
.logo { display: block; max-height: 64px; max-width: 240px; margin-bottom: 8px; }
.co { font-size: var(--oui-text-sm); color: var(--mu); overflow-wrap: anywhere; }
.top > * + *, .meta > * + * { margin-left: 16px; }
.shop { font-size: var(--oui-text-xl); font-weight: 700; letter-spacing: -.01em; }
.no, .mu, .small { color: var(--mu); }
.no { font-size: var(--oui-text-lg); font-weight: 600; letter-spacing: .01em; color: var(--ink); white-space: nowrap; }
.small { font-size: var(--oui-text-sm); margin-top: 4px; }
.meta { margin-top: 6px; }
.rule { border: 0; border-top: 2px solid var(--rule); margin: 12px 0; }
.title { font-size: var(--oui-text-lg); font-weight: 650; margin: 0 0 8px; }
table { width: 100%; border-collapse: collapse; }
th { padding: 6px 0; height: auto; text-align: start; font-size: var(--oui-text-xs); font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--mu); border-bottom: 1px solid var(--mu); }
th.r, td.r { text-align: right; white-space: nowrap; padding-left: 12px; }
td { padding: 8px 0; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
.sum { margin-top: 6px; }
/* the total: a light band under a rule in the shop's own colour; the figure in ink, so any accent stays readable and prints */
.total { margin-top: 14px; padding: 10px 12px; background: var(--band); border-top: 2px solid var(--rule); align-items: center; font-weight: 600; }
.total strong { font-size: var(--oui-text-2xl); font-weight: 700; letter-spacing: -.01em; color: var(--ink); font-variant-numeric: tabular-nums; }
.free { margin-top: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.title, .shop, td { overflow-wrap: anywhere; }
@media (max-width: 759px) { .quote-sheet { padding: 16px; } }
@media print {
  .quote-sheet { width: auto; margin: 0; padding: 0; border: 0; box-shadow: none; background: none; color: #000; font-size: 11pt; }
  .no, .mu, .small, .co, th { color: #000; }
  .total { background: none; }
.total strong { color: #000; }
}
</style>
