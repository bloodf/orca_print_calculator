<script setup lang="ts">
// Printer chip + average-power popover (docs/ux.md §5.3). Saves to settings.printers[model].watts; "Use suggested" clears it.
import Button from "primevue/button";
import { computed, ref } from "vue";
import { intlLocale, t } from "../i18n";
import { watts as fmtWatts } from "../format";
import { derived } from "../state/store";
import { elOf } from "./base/el";
import { OuiIcon, OuiStatus } from "../../shared/src/components";
import * as I from "../../shared/src/icons";
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
  <span v-if="!model" class="chip none">{{ t("header.noPrinter") }}</span>
  <template v-else>
    <Button :ref="(c) => (anchor = elOf(c))" severity="secondary" text size="small" type="button" class="chip" :aria-label="`${model}, ${wattText}${estimated ? `, ${t('printer.estimatedPower')}` : ''}`"
      :title="model" aria-haspopup="dialog" :aria-expanded="open" @click="open = !open">
      <OuiIcon :icon="I.printer" :size="14" />
      <span class="model oui-truncate">{{ model }}</span>
      <span class="w num"><span aria-hidden="true">· </span>{{ wattText }}</span>
    </Button>
    <OuiStatus v-if="source === 'match' && estimated" class="est" state="warn">{{ t("printer.estimatedPower") }}</OuiStatus>
    <Popover :open="open" :anchor="anchor" :label="t('printer.power')" @close="close">
      <div class="pc">
        <NumberField :model-value="watts" :label="t('printer.power')" :scale="1" :step="10" :min="1" :max="5000" unit="W" :helper="t('printer.powerHelp')" required @update:model-value="save" />
        <p class="oui-meta sugg">{{ t("printer.suggested", { watts: match.watts, how: t(`printer.how.${match.how}`) }) }}</p>
        <div class="oui-row acts">
          <Button v-if="source === 'saved'" severity="secondary" type="button" @click="useSuggested">{{ t("printer.useSuggested") }}</Button>
          <Button text severity="secondary" type="button" @click="more">{{ t("printer.moreSettings") }}</Button>
        </div>
      </div>
    </Popover>
  </template>
</template>

<style scoped>
.chip { flex: 0 1 auto; min-width: 0; gap: 6px; padding-inline: 6px; }
.chip.none { padding: 0 4px; }
.model { flex: 0 1 auto; min-width: 6ch; } /* never shrinks to nothing: at least the start of the model shows */
.w { flex: none; }
.sugg { margin-top: var(--oui-s2); }
.acts { margin-top: var(--oui-s2); justify-content: space-between; }
/* the full text (model, watts, estimated) stays in the button's accessible name; what is drawn gives way to the tabs */
@container oui-appbar (max-width: 1439px) { .est { display: none; } }
</style>
