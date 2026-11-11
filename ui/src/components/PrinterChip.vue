<script setup lang="ts">
// Printer chip + average-power popover (docs/ux.md §5.3). Saves to settings.printers[model].watts; "Use suggested" clears it.
import { computed, ref } from "vue";
import { intlLocale, t } from "../i18n";
import { watts as fmtWatts } from "../format";
import { derived } from "../state/store";
import Badge from "./base/Badge.vue";
import Icon from "./base/Icon.vue";
import NumberField from "./base/NumberField.vue";
import Popover from "./base/Popover.vue";
import { gotoSettings, patchPrinter } from "./costs/shared";

const props = defineProps<{ model: string | null; watts: number; source: "saved" | "match"; estimated: boolean }>();
const open = ref(false);
const anchor = ref<HTMLElement | null>(null);
const match = computed(() => derived.value.printer.match);
const wattText = computed(() => fmtWatts(props.watts, intlLocale()));
const close = () => { open.value = false; };
const save = (v: number | null) => { if (v !== null && props.model) patchPrinter(props.model, { watts: v }); };
const useSuggested = () => { if (props.model) patchPrinter(props.model, { watts: null }); };
const more = () => { close(); gotoSettings("settings-printers"); };
</script>

<template>
  <span v-if="!model" class="chip none sm muted">{{ t("header.noPrinter") }}</span>
  <template v-else>
    <button
      ref="anchor" type="button" class="chip btn" :aria-label="`${model}, ${wattText}${estimated ? `, ${t('printer.estimated')}` : ''}`"
      aria-haspopup="dialog" :aria-expanded="open" @click="open = !open"
    >
      <Icon name="printer-3d" />
      <span class="model truncate">{{ model }}</span>
      <span class="w num sm muted"><span class="dotsep" aria-hidden="true">·</span> {{ wattText }}</span>
      <Badge v-if="source === 'match' && estimated" tone="info" :text="t('printer.estimated')" />
    </button>
    <Popover :open="open" :anchor="anchor" :label="t('printer.power')" @close="close">
      <div class="pc">
        <NumberField :model-value="watts" :label="t('printer.power')" :scale="1" :step="10" :min="1" :max="5000" unit="W" :helper="t('printer.powerHelp')" required @update:model-value="save" />
        <p class="sm muted sugg">{{ t("printer.suggested", { watts: match.watts, how: t(`printer.how.${match.how}`) }) }}</p>
        <div class="row acts">
          <button v-if="source === 'saved'" type="button" class="btn" @click="useSuggested">{{ t("printer.useSuggested") }}</button>
          <button type="button" class="btn ghost" @click="more">{{ t("printer.moreSettings") }}</button>
        </div>
      </div>
    </Popover>
  </template>
</template>

<style scoped>
.chip { min-width: 0; max-width: 100%; }
.chip.none { padding: 0 4px; }
.chip > * + * { margin-left: 6px; }
.model { max-width: 18ch; }
.dotsep { margin-right: 2px; }
.sugg { margin-top: var(--opc-s2); }
.acts { margin-top: var(--opc-s2); justify-content: space-between; flex-wrap: wrap; }
@media (max-width: 1099px) { .model { max-width: 12ch; } }
@media (max-width: 899px) { .model, .dotsep { display: none; } }
</style>
