<script setup lang="ts">
// "Where the price goes": per-piece cost lines, channel fees, tax and profit as label, amount, share and a bar.
// Bars are scaled to the largest row so small lines stay readable; the share column is amount / price.
import Button from "primevue/button";
import { computed, ref } from "vue";
import { feeFor, mulDivRound } from "../../engine/costs";
import { CALC_VERSION, LEGACY_CALC } from "../../engine/quote";
import { t } from "../../i18n";
import { derived, result } from "../../state/store";
import Icon from "../base/Icon.vue";
import Section from "../base/Section.vue";
import { m, pct, priced, useOpen } from "./priceState";
import { LINE_ORDER, unknownLines, type Why } from "./unknownLines";

/** `why`: the amount is not known (shown as a dash with the reason); `partial`: a known amount that leaves something out. */
type Row = { id: string; label: string; minor: number; profit?: boolean; total?: boolean; why?: Why; partial?: Why | true; detail?: { label: string; minor: number }[] };

const open = useOpen("breakdown", () => true);
const expanded = ref<Record<string, boolean>>({});

const rows = computed<Row[]>(() => {
  const r = result.value, sel = priced.value;
  if (!r.ok || !sel) return [];
  const q = derived.value.quoteInput.quantity;
  const labels = new Map<string, string>([
    ...r.materials.map((x) => [x.key, x.label] as [string, string]),
    ...derived.value.quoteInput.extras.map((x) => [x.key, x.label] as [string, string]),
  ]);
  const out: Row[] = [];
  const unknown = unknownLines(derived.value);
  const unk = unknown as Record<string, Why | undefined>;
  const seen = new Set<string>();
  for (const l of r.lines) {
    const why = unk[l.id];
    if (l.perPiece <= 0 && why) { seen.add(l.id); out.push({ id: l.id, label: t(`line.${l.id}`), minor: 0, why }); continue; } // unknown, not free
    if (l.perPiece <= 0) continue;
    seen.add(l.id);
    const orderDetail = l.id === "orderExtras" || (derived.value.quoteInput.calc ?? LEGACY_CALC) >= CALC_VERSION;
    const scale = (x: number) => mulDivRound(x, orderDetail ? 1 : r.piecesPrinted, q);
    out.push({ id: l.id, label: t(`line.${l.id}`), minor: l.perPiece, ...(why ? { partial: why } : {}), ...(l.detail?.length ? { detail: l.detail.map((d) => ({ label: labels.get(d.key) ?? d.key, minor: scale(d.minor) })) } : {}) });
  }
  for (const [id, why] of Object.entries(unk)) if (why && !seen.has(id)) out.push({ id, label: t(`line.${id}`), minor: 0, why }); // the engine left it out: it is still a line
  const order = (id: string): number => { const i = (LINE_ORDER as readonly string[]).indexOf(id); return i < 0 ? LINE_ORDER.length : i; };
  out.sort((a, b) => order(a.id) - order(b.id));
  out.push({ id: "costTotal", label: t("line.costTotal"), minor: r.unitCostAtQuantity, total: true, ...(Object.keys(unknown).length ? { partial: true as const } : {}) });
  const ch = derived.value.quoteInput.channels.find((c) => c.id === sel.id);
  const f = ch ? feeFor(ch, sel.price) : null;
  const fees = f ? f.pctCents + f.fixedCents + f.shippingCents : sel.fees;
  if (fees > 0) out.push({ id: "fees", label: t("line.fees"), minor: fees });
  if (f && f.taxCents > 0) out.push({ id: "tax", label: t("line.tax"), minor: f.taxCents });
  if (sel.profit > 0) out.push({ id: "profit", label: t("line.profit"), minor: sel.profit, profit: true });
  return out;
});
const biggest = computed(() => Math.max(1, ...rows.value.filter((x) => !x.total && !x.why).map((x) => x.minor)));
const scale = (x: number): string => `scaleX(${(x / biggest.value).toFixed(4)})`;
const share = (x: number): string => pct(Math.round((x * 10000) / (priced.value?.price || 1)));
const toggle = (id: string): void => { expanded.value = { ...expanded.value, [id]: !expanded.value[id] }; };
</script>

<template>
  <Section id="breakdown" :title="t('breakdown.title')" variant="flush" :open="open" @update:open="(v) => (open = v)">
    <ul v-if="priced" class="rows">
      <template v-for="row in rows" :key="row.id">
        <li v-if="row.total" class="total row-grid" data-row="costTotal">
          <span class="lbl sm">{{ row.label }}<span v-if="row.partial" class="why"> · {{ t("price.partial") }}</span></span><span class="amt num">{{ m(row.minor) }}</span>
        </li>
        <li v-else-if="row.why" class="row-grid unk" :data-row="row.id" data-unknown>
          <span class="lbl sm">{{ row.label }}<span class="why"> · {{ t(`breakdown.unknown.${row.why}`) }}</span></span>
          <span class="amt num"><span aria-hidden="true">—</span><span class="sr-only">{{ t("a11y.unknown") }}</span></span>
        </li>
        <template v-else>
          <li class="row-grid" :data-row="row.id">
            <span class="lbl sm">
              <Button v-if="row.detail" type="button" text severity="secondary" size="small" class="exp" :aria-expanded="!!expanded[row.id]" @click="toggle(row.id)">
                <span class="chev" :class="{ on: expanded[row.id] }"><Icon name="chevron-right" /></span><span>{{ row.label }}</span>
              </Button>
              <template v-else>{{ row.label }}</template><span v-if="row.partial" class="why"> · {{ t("price.partial") }}</span>
            </span>
            <span class="amt num">{{ m(row.minor) }}</span>
            <span class="shr num sm muted">{{ share(row.minor) }}</span>
            <span class="track" aria-hidden="true"><span class="bar" :class="{ profit: row.profit }" :style="{ transform: scale(row.minor) }" :data-scale="(row.minor / biggest).toFixed(4)" /></span>
          </li>
          <li v-for="d in expanded[row.id] ? row.detail : []" :key="`${row.id}-${d.label}`" class="row-grid det sm muted">
            <span class="lbl">{{ d.label }}</span><span class="amt num">{{ m(d.minor) }}</span>
          </li>
        </template>
      </template>
    </ul>
  </Section>
</template>

<style scoped>
.rows { list-style: none; margin: 0; padding: 0; }
.row-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(88px, max-content) 64px; column-gap: 8px; align-items: center; min-height: 24px; padding-top: 6px; }
.row-grid.det { padding-top: 2px; padding-left: 20px; }
.lbl { min-width: 0; }
.why { color: var(--opc-warn); font-weight: 500; }
.unk .amt { color: var(--opc-muted); }
.amt, .shr { text-align: right; }
.track { grid-column: 1 / -1; display: block; height: 4px; margin-top: 4px; background: var(--opc-track); border-radius: var(--opc-r-pill); overflow: hidden; }
.bar { display: block; height: 100%; width: 100%; background: var(--opc-bar); transform-origin: left center; transition: transform var(--opc-dur) var(--opc-ease); }
.bar.profit { background: var(--opc-bar-profit); }
@media (forced-colors: active) { .track { border: 1px solid CanvasText; } .bar { background: CanvasText; forced-color-adjust: none; } }
.total { margin-top: 8px; border-top: 1px solid var(--opc-border); padding-top: 8px; font-weight: 500; }
.lbl :deep(.exp) { padding: 0 6px 0 0; min-height: 0; color: inherit; font: inherit; line-height: inherit; font-weight: 400; gap: 0; vertical-align: baseline; }
.chev { display: inline-flex; margin-right: 4px; color: var(--opc-muted); transition: transform var(--opc-dur-fast) var(--opc-ease); }
.chev.on { transform: rotate(90deg); }
</style>
