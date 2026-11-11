<script setup lang="ts">
// Fee steps by sale price for one channel (docs/ux.md §5.3 ChannelEditor). Row 0 mirrors the fields above and is read-only.
import { computed } from "vue";
import { MAX_TIERS } from "../../engine/channels";
import { money, percent } from "../../format";
import { t } from "../../i18n";
import { currency, digits, locale } from "../../state/store";
import Icon from "../base/Icon.vue";
import MoneyField from "../base/MoneyField.vue";
import PercentField from "../base/PercentField.vue";
import { addTier, channelById, problemMessage, problemsFor, removeTier, updateTier } from "./channelOps";

const props = defineProps<{ channelId: string }>();
const tiers = computed(() => channelById(props.channelId)?.tiers ?? []);
const full = computed(() => tiers.value.length >= MAX_TIERS);
const major = computed(() => 10 ** digits.value);
const errors = (i: number): string[] => (i === 0 ? [] : problemsFor(props.channelId).filter((p) => p.tier === i).map(problemMessage)); // tier 0 problems show under the fee fields
const fmt = (n: number): string => money(n, currency.value, locale.value);
</script>

<template>
  <div class="tr">
    <p class="sm muted">{{ t("channel.tiersHelp") }}</p>
    <div class="tr-grid tr-head sm muted" aria-hidden="true"><span>{{ t("field.tierFrom") }}</span><span>{{ t("field.fee") }}</span><span>{{ t("field.fixedFee") }}</span><span /></div>
    <div v-for="(tier, i) in tiers" :key="i" class="tr-item">
      <div class="tr-grid" :class="{ first: i === 0 }">
        <template v-if="i === 0">
          <span class="num">{{ fmt(0) }}</span><span class="num">{{ percent(tier.pctBp, locale) }}</span><span class="num">{{ fmt(tier.fixedMinor) }}</span><span />
        </template>
        <template v-else>
          <MoneyField :model-value="tier.minMinor" :label="t('field.tierFrom')" :digits="digits" :currency="currency" :step="major" @update:model-value="(v) => v !== null && updateTier(channelId, i, { minMinor: v })" />
          <PercentField :model-value="tier.pctBp" :label="t('field.fee')" :step="50" :max="9000" @update:model-value="(v) => v !== null && updateTier(channelId, i, { pctBp: v })" />
          <MoneyField :model-value="tier.fixedMinor" :label="t('field.fixedFee')" :digits="digits" :currency="currency" :step="major" @update:model-value="(v) => v !== null && updateTier(channelId, i, { fixedMinor: v })" />
          <button type="button" class="btn icon" :aria-label="t('common.removeNamed', { name: `${t('field.tierFrom')} ${fmt(tier.minMinor)}` })" @click="removeTier(channelId, i)"><Icon name="trash" /></button>
        </template>
      </div>
      <p v-for="m in errors(i)" :key="m" class="sm bad" role="alert">{{ m }}</p>
    </div>
    <button type="button" class="btn ghost" :aria-disabled="full" @click="!full && addTier(channelId, major)"><Icon name="plus" /><span>{{ t("channel.addTier") }}</span></button>
  </div>
</template>

<style scoped>
.tr > * + * { margin-top: 8px; }
.tr-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr) 24px; grid-column-gap: 8px; align-items: center; }
.tr-grid.first { min-height: 28px; }
.tr-head { margin-bottom: -4px; }
.tr-grid :deep(.nf-head) { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
.tr-grid :deep(.nf-help) { display: none; }
.bad { color: var(--opc-bad); margin-top: 2px; }
</style>
