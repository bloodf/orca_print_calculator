<script setup lang="ts">
// "Compare channels": only with 2+ channels, collapsed by default, forced open when the selected channel has no price.
// Prices here are normal text colour. Rows select the channel.
import Button from "primevue/button";
import { computed } from "vue";
import { t } from "../../i18n";
import { derived, patchDraft, result } from "../../state/store";
import Icon from "../base/Icon.vue";
import Section from "../base/Section.vue";
import type { ChannelQuote } from "../../engine/quote";
import { channelProblemSentence, hero, m, pct, signed, useCompact, useOpen } from "./priceState";

const stored = useOpen("compare", () => false);
const open = computed(() => stored.value || hero.value.kind === "impossible");
const channels = computed<ChannelQuote[]>(() => (result.value.ok ? result.value.channels : []));
const show = computed(() => channels.value.length >= 2);
const rows = computed<ChannelQuote[]>(() => {
  const r = result.value;
  if (!r.ok) return [];
  return [...r.comparison, ...r.channels.filter((c) => !c.ok)];
});
const selectedId = computed(() => derived.value.selectedChannelId);

const compact = useCompact(); // 340-440 px panel cannot fit seven columns

const stepText = (c: Extract<ChannelQuote, { ok: true }>): string => c.deadZones.map((z) => t("compare.feeStep", { from: m(z.fromCents), until: m(z.untilCents) })).join("; ");
const select = (id: string): void => patchDraft({ channelId: id });
</script>

<template>
  <Section v-if="show" id="compare" :title="t('compare.title')" variant="flush" :open="open" @update:open="(v) => (stored = v)">
    <div class="opc-table-wrap">
      <table class="opc-table dense cmp">
        <caption class="sr-only">{{ t("compare.caption") }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ t("compare.channel") }}</th>
            <th scope="col" class="r">{{ t("compare.price") }}</th>
            <th v-if="!compact" scope="col" class="r">{{ t("compare.fees") }}</th>
            <th v-if="!compact" scope="col" class="r">{{ t("compare.net") }}</th>
            <th scope="col" class="r">{{ t("compare.profit") }}</th>
            <th scope="col" class="r">{{ t("compare.margin") }}</th>
            <th v-if="!compact" scope="col" class="r">{{ t("compare.breakEven") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in rows" :key="c.id" class="pick" :class="{ sel: c.id === selectedId }" :data-channel="c.id" @click="select(c.id)">
            <td class="name">
              <Button type="button" text size="small" class="pickbtn" @click.stop="select(c.id)">{{ c.name }}</Button>
              <span v-if="c.id === selectedId" class="sr-only">{{ ` ${t("compare.selected")}` }}</span>
              <span v-if="c.ok && c.deadZones.length" class="zone" :title="stepText(c)"><Icon name="info" /><span class="sr-only">{{ stepText(c) }}</span></span>
            </td>
            <template v-if="c.ok">
              <td class="r num px">{{ m(c.price) }}</td>
              <td v-if="!compact" class="r num">{{ m(c.fees) }}</td>
              <td v-if="!compact" class="r num">{{ m(c.net) }}</td>
              <td class="r num" :class="{ bad: c.profit < 0 }">{{ signed(c.profit) }}</td>
              <td class="r num" :class="{ bad: c.marginBp < 0 }">{{ pct(c.marginBp) }}</td>
              <td v-if="!compact" class="r num">{{ m(c.breakEven) }}</td>
            </template>
            <td v-else :colspan="compact ? 3 : 6" class="muted sm prob">{{ channelProblemSentence(c) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </Section>
</template>

<style scoped>
.cmp th, .cmp td { padding-inline: 4px; }
.cmp th:first-child, .cmp td:first-child { padding-left: 0; }
.pick { cursor: pointer; }
.pick:hover { background: var(--opc-hover); }
.pick.sel > td { background: var(--opc-selected); }
.pick.sel > td:first-child { box-shadow: inset 2px 0 0 var(--opc-selected-border); }
.name { white-space: nowrap; }
.cmp :deep(.pickbtn) { font-weight: 500; padding: 2px 6px; }
.px { font-weight: 500; }
.zone { display: inline-flex; vertical-align: middle; margin-left: 4px; color: var(--opc-muted); cursor: help; }
.prob { white-space: normal; min-width: 160px; }
</style>
