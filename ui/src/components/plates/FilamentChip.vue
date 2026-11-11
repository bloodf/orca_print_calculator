<script setup lang="ts">
import { computed } from "vue";
import { grams, safeColor } from "../../format";
import { t } from "../../i18n";
import { locale } from "../../state/store";
import type { HostSlot, SlotMatchView } from "../../state/types";
import Badge from "../base/Badge.vue";
import { chipLabel, sourceText, sourceTone, UNKNOWN } from "./slots";

const props = defineProps<{ slot: HostSlot; match: SlotMatchView }>();
defineEmits<{ toggle: [] }>();
const swatch = computed(() => safeColor(props.slot.color));
const g = computed(() => (props.slot.grams === null ? null : grams(props.slot.grams, locale.value)));
const label = computed(() => t("a11y.chip", { preset: chipLabel(props.match), grams: g.value ?? t("a11y.unknown"), source: sourceText(props.match) }) + (swatch.value ? "" : `, ${t("a11y.colorUnknown")}`));
</script>

<template>
  <button :id="`chip-${match.plateIndex}-${slot.n}`" type="button" class="chip" :aria-label="label" :title="slot.preset" @click="$emit('toggle')">
    <span class="dot" :class="{ hatched: !swatch }" :style="swatch ? { background: swatch } : undefined" aria-hidden="true" />
    <span class="name xs truncate" aria-hidden="true">{{ chipLabel(match) }}</span>
    <span class="num xs muted" aria-hidden="true">{{ g ?? UNKNOWN }}</span>
    <Badge :tone="sourceTone(match)" :text="sourceText(match)" aria-hidden="true" />
  </button>
</template>

<style scoped>
.chip { display: inline-flex; align-items: center; height: 24px; max-width: 100%; padding: 0 4px 0 8px; font: inherit; color: var(--opc-fg); background: var(--opc-bg); border: 1px solid var(--opc-border); border-radius: var(--opc-r-pill); cursor: pointer; }
.chip:hover { border-color: var(--opc-accent-text); }
.chip > * + * { margin-left: 6px; }
.dot { flex: none; width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 1px var(--opc-bar); } /* --opc-bar: 3:1 against the chip in both themes (WCAG 1.4.11) */
.dot.hatched { background: repeating-linear-gradient(45deg, var(--opc-track), var(--opc-track) 2px, var(--opc-bg) 2px, var(--opc-bg) 4px); }
.name { text-align: left; flex: 0 1 auto; min-width: 8ch; max-width: 28ch; font-size: var(--opc-fs-sm); font-weight: 400; }
.chip :deep(.badge) { flex: none; }
</style>
