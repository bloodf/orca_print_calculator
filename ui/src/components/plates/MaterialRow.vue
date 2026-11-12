<script setup lang="ts">
import Button from "primevue/button";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { grams } from "../../format";
import { t } from "../../i18n";
import { locale, store } from "../../state/store";
import type { SlotMatchView } from "../../state/types";
import { elOf } from "../base/el";
import Icon from "../base/Icon.vue";
import SpoolPicker from "./SpoolPicker.vue";
import { takePick, pickRequest } from "./pickRequest";
import { clearSlot, presetName, hasSlotChoice, perKg, priceSourceText, UNKNOWN } from "./slots";

const props = defineProps<{ match: SlotMatchView }>();
const emit = defineEmits<{ change: []; useAuto: [] }>();
const anchor = ref<HTMLElement | null>(null);
const open = ref(false);
const frozen = computed(() => !!store.draft.frozenPlates);
const filament = computed(() => store.spoolman.data.filaments.find((f) => f.id === props.match.filamentId));
const filamentName = computed(() => (filament.value ? [filament.value.vendor, filament.value.name].filter(Boolean).join(" ") : ""));
const g = computed(() => (props.match.slot.grams === null ? null : grams(props.match.slot.grams, locale.value)));
const showReset = computed(() => !frozen.value && hasSlotChoice(props.match.slot.preset));
const autoLabel = computed(() => t("match.useAuto"));
// A "Pick spool" flag asked for this slot: open its picker (after the card has opened its rows).
const checkRequest = (): void => { if (takePick(props.match.plateIndex, props.match.slot.n)) { open.value = true; emit("change"); } };
onMounted(checkRequest);
watch(() => pickRequest.seq, () => void nextTick(checkRequest));
function toggle(): void { open.value = !open.value; if (open.value) emit("change"); }
function useAuto(): void { clearSlot(props.match.slot.preset); emit("useAuto"); }
</script>

<template>
  <div class="mrow" tabindex="-1" role="group" :aria-label="`${match.slot.n} ${match.slot.preset}`">
    <span class="n num muted">{{ match.slot.n }}</span>
    <span class="names">
      <span class="preset truncate" :title="match.slot.preset">{{ presetName(match.slot.preset) }}</span>
      <span v-if="filamentName" class="sm muted truncate">{{ filamentName }}</span>
    </span>
    <span class="num g">
      <template v-if="g">{{ g }}</template>
      <template v-else><span aria-hidden="true">{{ UNKNOWN }}</span><span class="sr-only">{{ t("a11y.unknown") }}</span></template>
    </span>
    <span class="price">
      <template v-if="match.pricePerKg !== null">
        <span class="num">{{ perKg(match.pricePerKg) }}</span>
        <span class="xs muted">{{ priceSourceText(match) }}</span>
      </template>
      <span v-else class="sm bad">{{ t("plate.missingPrice") }}</span>
    </span>
    <span v-if="!frozen" class="actions">
      <Button :ref="(c) => (anchor = elOf(c))" severity="secondary" outlined size="small" type="button" aria-haspopup="dialog" :aria-expanded="open ? 'true' : 'false'" @click="toggle">{{ t("match.change") }}</Button>
      <Button v-if="showReset" text severity="secondary" type="button" class="icon-btn" :aria-label="autoLabel" :title="autoLabel" @click="useAuto"><Icon name="reset" /></Button>
    </span>
    <SpoolPicker v-if="!frozen" :match="match" :open="open" :anchor="anchor" @close="open = false" />
  </div>
</template>

<style scoped>
.mrow { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto auto auto; align-items: center; column-gap: 12px; padding: 8px 0; }
.mrow + .mrow { border-top: 1px solid var(--opc-border); }
.mrow:focus-visible { outline: 2px solid var(--p-primary-color); outline-offset: 2px; }
.names { display: flex; flex-direction: column; min-width: 0; }
.price { display: flex; flex-direction: column; align-items: flex-end; }
.g { text-align: right; }
.actions { display: inline-flex; align-items: center; }
.actions > * + * { margin-left: 4px; }
@media (max-width: 520px) {
  .mrow { grid-template-columns: 20px minmax(0, 1fr) auto; row-gap: 4px; }
  .price, .actions { grid-column: 2 / -1; align-items: flex-start; flex-direction: row; }
}
</style>
