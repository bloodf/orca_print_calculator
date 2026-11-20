<script setup lang="ts">
// "Where the price goes": one segmented bar of the price (each cost line, the channel fees, the tax and the profit, in the
// hue of its subject) over a legend with each line's share and amount. The number is always in text beside the mark.
import Button from "primevue/button";
import { computed, ref } from "vue";
import { mulDivRound } from "../../engine/costs";
import { EXACT_COST_CALC, LEGACY_CALC } from "../../engine/quote";
import { t } from "../../i18n";
import { derived, result } from "../../state/store";
import { OuiIcon, type OuiTone } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";
import Section from "../base/Section.vue";
import { charges, m, pct, priced, useOpen } from "./priceState";
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
    const orderDetail = l.id === "orderExtras" || (derived.value.quoteInput.calc ?? LEGACY_CALC) >= EXACT_COST_CALC;
    const scale = (x: number) => mulDivRound(x, orderDetail ? 1 : r.piecesPrinted, q);
    out.push({ id: l.id, label: t(`line.${l.id}`), minor: l.perPiece, ...(why ? { partial: why } : {}), ...(l.detail?.length ? { detail: l.detail.map((d) => ({ label: labels.get(d.key) ?? d.key, minor: scale(d.minor) })) } : {}) });
  }
  for (const [id, why] of Object.entries(unk)) if (why && !seen.has(id)) out.push({ id, label: t(`line.${id}`), minor: 0, why }); // the engine left it out: it is still a line
  const order = (id: string): number => { const i = (LINE_ORDER as readonly string[]).indexOf(id); return i < 0 ? LINE_ORDER.length : i; };
  out.sort((a, b) => order(a.id) - order(b.id));
  out.push({ id: "costTotal", label: t("line.costTotal"), minor: r.unitCostAtQuantity, total: true, ...(Object.keys(unknown).length ? { partial: true as const } : {}) });
  const c = charges.value;
  if (c && c.fees > 0) out.push({ id: "fees", label: t("line.fees"), minor: c.fees });
  if (c && c.tax > 0) out.push({ id: "tax", label: t("line.tax"), minor: c.tax });
  if (sel.profit > 0) out.push({ id: "profit", label: t("line.profit"), minor: sel.profit, profit: true });
  return out;
});
// The hue of what each line is about, the same as everywhere else on the page (DESIGN.md, hue by domain); profit is the accent.
const TONE: Record<string, OuiTone> = {
  filament: "magenta", energy: "orange", depreciation: "cobalt", maintenance: "cobalt", failure: "violet", labor: "sky", setup: "sky",
  fixed: "neutral", extras: "violet", orderExtras: "violet", shipping: "cobalt", fees: "teal", tax: "neutral", profit: "accent",
};
const tone = (id: string): OuiTone => TONE[id] ?? "neutral";
/** The parts of the bar: every line with a known amount, in the order of the legend. Unknown lines have no segment. */
const segments = computed(() => rows.value.filter((x) => !x.total && !x.why && x.minor > 0));
const share = (x: number): string => pct(Math.round((x * 10000) / (priced.value?.price || 1)));
const toggle = (id: string): void => { expanded.value = { ...expanded.value, [id]: !expanded.value[id] }; };
</script>

<template>
  <Section id="breakdown" :title="t('breakdown.title')" variant="flush" :open="open" @update:open="(v) => (open = v)">
    <div v-if="priced" class="stack" aria-hidden="true">
      <span v-for="x in segments" :key="x.id" class="seg" :class="{ profit: x.profit }" :data-seg="x.id" :data-tone="tone(x.id)" :data-minor="x.minor" :style="{ flexGrow: x.minor }" />
    </div>
    <ul v-if="priced" class="rows">
      <template v-for="row in rows" :key="row.id">
        <li v-if="row.total" class="total row-grid" data-row="costTotal">
          <span /><span class="lbl oui-strong">{{ row.label }} <span v-if="row.partial" class="oui-chip" data-tone="warn"><span class="oui-sr">· </span>{{ t("price.partial") }}</span></span><span /><span class="amt num oui-strong">{{ m(row.minor) }}</span>
        </li>
        <li v-else-if="row.why" class="row-grid unk" :data-row="row.id" data-unknown>
          <span class="key" :data-tone="tone(row.id)" aria-hidden="true" />
          <span class="lbl">{{ row.label }} <span class="oui-chip why" data-tone="warn"><span class="oui-sr">· </span>{{ t(`breakdown.unknown.${row.why}`) }}</span></span><span />
          <span class="amt num gap"><span aria-hidden="true">—</span><span class="oui-sr">{{ t("a11y.unknown") }}</span></span>
        </li>
        <template v-else>
          <li class="row-grid" :data-row="row.id">
            <span class="key" :data-tone="tone(row.id)" aria-hidden="true" />
            <span class="lbl" :class="{ 'oui-strong': row.profit }">
              <Button v-if="row.detail" type="button" text severity="secondary" size="small" class="exp" :aria-expanded="!!expanded[row.id]" @click="toggle(row.id)">
                <span>{{ row.label }}</span><span class="chev" :class="{ on: expanded[row.id] }"><OuiIcon :icon="I.chevronRight" :size="12" /></span>
              </Button>
              <template v-else>{{ row.label }}</template> <span v-if="row.partial" class="oui-chip why" data-tone="warn"><span class="oui-sr">· </span>{{ t("price.partial") }}</span>
            </span>
            <span class="shr num oui-muted">{{ share(row.minor) }}</span>
            <span class="amt num" :class="{ 'oui-strong': row.profit }">{{ m(row.minor) }}</span>
          </li>
          <li v-for="d in expanded[row.id] ? row.detail : []" :key="`${row.id}-${d.label}`" class="row-grid det oui-meta">
            <span /><span class="lbl">{{ d.label }}</span><span /><span class="amt num">{{ m(d.minor) }}</span>
          </li>
        </template>
      </template>
    </ul>
  </Section>
</template>

<style scoped>
/* a composition: one 10 px segmented bar with a legend of squares */
.stack { display: flex; gap: 2px; height: 10px; margin-bottom: var(--oui-s3); }
.seg { flex: 0 1 0; min-width: 3px; border-radius: 3px; background: var(--oui-tone); transition: flex-grow var(--oui-base) var(--oui-ease); }
.rows { list-style: none; padding: 0; display: grid; gap: 6px; }
.row-grid { display: grid; grid-template-columns: 10px minmax(0, 1fr) 52px minmax(72px, max-content); align-items: center; gap: var(--oui-s2); min-height: 20px; }
.key { width: 10px; height: 10px; border-radius: 3px; background: var(--oui-tone); }
.lbl { min-width: 0; }
.amt, .shr { text-align: end; }
.total { margin-block: 2px; padding-block: 6px; border-block: 1px solid var(--oui-border); }
.lbl :deep(.exp) { height: auto; min-height: 0; padding: 0; gap: 2px; color: inherit; font: inherit; line-height: inherit; vertical-align: baseline; }
.lbl :deep(.exp:hover) { background: none; text-decoration: underline; }
.chev { display: inline-flex; color: var(--oui-muted); transition: transform var(--oui-fast) var(--oui-ease); }
.chev.on { transform: rotate(90deg); }
@media (forced-colors: active) { .seg, .key { background: CanvasText; forced-color-adjust: none; } }
</style>
