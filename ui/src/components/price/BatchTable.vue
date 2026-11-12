<script setup lang="ts">
// "Batch pricing": one row per discount tier plus the current quantity, priced on the selected channel.
// The discount cell shows what the customer really gets after rounding; the nominal tier is a second muted line.
import Button from "primevue/button";
import { computed } from "vue";
import { t } from "../../i18n";
import { derived, patchDefaults, patchDraft, result, store } from "../../state/store";
import { toast } from "../../state/toast";
import Icon from "../base/Icon.vue";
import Section from "../base/Section.vue";
import type { ChannelOk, ChannelQuote } from "../../engine/quote";
import DiscountTierEditor from "./DiscountTierEditor.vue";
import { channelProblemSentence, m, pct, signed, useCompact, useOpen } from "./priceState";

const open = useOpen("batch", () => store.draft.quantity > 1 || store.draft.discountTiers.length > 0);
// The panel is 340-440 px everywhere except the full-width narrow layout (600-899): five columns with short headers, so Order profit and
// Margin (the loss signal) are always whole. Unit cost and order total move into the price cell's tooltip.
const compact = useCompact();
const selectedId = computed(() => derived.value.selectedChannelId);
const selectedName = computed(() => derived.value.quoteInput.channels.find((c) => c.id === selectedId.value)?.name ?? "");
const rows = computed(() => {
  const r = result.value;
  if (!r.ok) return [];
  return r.batchTable.map((row) => ({ q: row.quantity, cost: row.unitCostAtQuantity, ch: row.channels.find((c: ChannelQuote) => c.id === selectedId.value) }));
});
const target = computed(() => derived.value.quoteInput.targetMarginBp);

const loss = (c: ChannelOk): boolean => c.flags.belowBreakEven || c.flags.orderBelowBreakEven;
const underTarget = (c: ChannelOk): boolean => c.flags.belowTarget && !loss(c);
const tierDiffers = (c: ChannelOk): boolean => pct(c.discountBp) !== pct(c.effectiveDiscountBp); // identical text would read as noise
const edited = computed(() => JSON.stringify(store.draft.discountTiers) !== JSON.stringify(store.settings.defaults.discountTiers));
const saveDefaults = (): void => {
  patchDefaults({ discountTiers: store.draft.discountTiers.map((x) => ({ ...x })) });
  toast({ text: t("section.savedDefaults") });
};
</script>

<template>
  <Section id="batch" :title="t('batch.title')" variant="flush" :open="open" @update:open="(v) => (open = v)">
    <div class="opc-table-wrap">
      <table class="opc-table dense batch">
        <caption class="sr-only">{{ t("batch.caption", { channel: selectedName }) }}</caption>
        <thead>
          <tr>
            <th scope="col" class="r" :title="compact ? t('batch.quantity') : undefined"><span :aria-hidden="compact ? 'true' : undefined">{{ t(compact ? "batch.quantityShort" : "batch.quantity") }}</span><span v-if="compact" class="sr-only">{{ t("batch.quantity") }}</span></th>
            <th scope="col" class="r">{{ t("batch.discount") }}</th>
            <th v-if="!compact" scope="col" class="r">{{ t("batch.unitCost") }}</th>
            <th scope="col" class="r" :title="compact ? t('batch.unitPrice') : undefined"><span :aria-hidden="compact ? 'true' : undefined">{{ t(compact ? "batch.unitPriceShort" : "batch.unitPrice") }}</span><span v-if="compact" class="sr-only">{{ t("batch.unitPrice") }}</span></th>
            <th v-if="!compact" scope="col" class="r">{{ t("batch.orderTotal") }}</th>
            <th scope="col" class="r" :title="compact ? t('batch.orderProfit') : undefined"><span :aria-hidden="compact ? 'true' : undefined">{{ t(compact ? "batch.orderProfitShort" : "batch.orderProfit") }}</span><span v-if="compact" class="sr-only">{{ t("batch.orderProfit") }}</span></th>
            <th scope="col" class="r">{{ t("compare.margin") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.q" :class="{ cur: row.q === store.draft.quantity }" :data-q="row.q">
            <td class="r num"><Button type="button" text size="small" class="qbtn num" @click="patchDraft({ quantity: row.q })">{{ row.q }}</Button><span v-if="row.q === store.draft.quantity" class="sr-only">{{ ` ${t("batch.current")}` }}</span></td>
            <template v-if="row.ch && row.ch.ok">
              <td class="r num disc" data-cell="discount">
                <span class="eff">{{ row.ch.effectiveDiscountBp > 0 ? pct(row.ch.effectiveDiscountBp) : "—" }}</span>
                <span v-if="tierDiffers(row.ch)" class="sm muted nominal">{{ t("batch.nominal", { pct: pct(row.ch.discountBp) }) }}</span>
              </td>
              <td v-if="!compact" class="r num">{{ m(row.cost) }}</td>
              <td class="r num" :title="compact ? `${t('batch.unitCost')}: ${m(row.cost)} · ${t('batch.orderTotal')}: ${m(row.ch.grandTotal)}` : undefined">{{ m(row.ch.price) }}</td>
              <td v-if="!compact" class="r num">{{ m(row.ch.grandTotal) }}</td>
              <td class="r num" :class="{ bad: loss(row.ch) }" data-cell="orderProfit">{{ signed(row.ch.orderProfit) }}<span v-if="loss(row.ch)" class="sr-only">{{ ` ${t("batch.loss")}` }}</span></td>
              <td class="r num" :class="{ bad: loss(row.ch) }" data-cell="margin">
                <span v-if="underTarget(row.ch)" class="tgt" :title="t('flag.belowTarget', { margin: pct(row.ch.marginBp), target: pct(target) })" data-icon="belowTarget"><Icon name="info" /></span>{{ pct(row.ch.marginBp) }}<span v-if="loss(row.ch)" class="sr-only">{{ ` ${t("batch.loss")}` }}</span>
              </td>
            </template>
            <td v-else :colspan="compact ? 4 : 6" class="muted sm">{{ row.ch && !row.ch.ok ? channelProblemSentence(row.ch) : "" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="editor">
      <DiscountTierEditor
        :model-value="store.draft.discountTiers" :default-value="store.settings.defaults.discountTiers"
        @update:model-value="(v) => patchDraft({ discountTiers: v })" @reset="patchDraft({ discountTiers: store.settings.defaults.discountTiers.map((x) => ({ ...x })) })"
      />
      <Button v-if="edited" text type="button" class="save" @click="saveDefaults">{{ t("section.saveDefaults") }}</Button>
    </div>
  </Section>
</template>

<style scoped>
.batch th, .batch td { padding-inline: 3px; }
.batch td.disc { padding-block: 4px; }
.eff, .nominal { display: block; }
.batch tr.cur > td { background: var(--opc-selected); font-weight: 500; }
.batch :deep(.qbtn) { padding: 2px 6px; text-decoration: underline; text-underline-offset: 2px; }
.tgt { display: inline-flex; vertical-align: middle; margin-right: 4px; color: var(--opc-muted); cursor: help; }
.editor { margin-top: 12px; }
.save { margin-left: -10px; }
</style>
