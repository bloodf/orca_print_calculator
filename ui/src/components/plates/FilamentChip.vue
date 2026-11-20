<script setup lang="ts">
import Button from "primevue/button";
import { computed } from "vue";
import { grams, safeColor } from "../../format";
import { t } from "../../i18n";
import { locale } from "../../state/store";
import type { HostSlot, SlotMatchView } from "../../state/types";
import { OuiSwatch } from "@orca-plugins/ui-foundation/src/components";
import { chipLabel, sourceText, sourceTone } from "./slots";

const props = defineProps<{ slot: HostSlot; match: SlotMatchView }>();
defineEmits<{ toggle: [] }>();
const swatch = computed(() => safeColor(props.slot.color));
const g = computed(() => (props.slot.grams === null ? null : grams(props.slot.grams, locale.value)));
const label = computed(() => t("a11y.chip", { preset: chipLabel(props.match), grams: g.value ?? t("a11y.unknown"), source: sourceText(props.match) }) + (swatch.value ? "" : `, ${t("a11y.colorUnknown")}`));
</script>

<template>
  <Button :id="`chip-${match.plateIndex}-${slot.n}`" type="button" severity="secondary" text size="small" class="chip" :aria-label="label" :title="slot.preset" @click="$emit('toggle')">
    <OuiSwatch :color="swatch" />
    <span class="name oui-strong oui-truncate" aria-hidden="true">{{ chipLabel(match) }}</span>
    <span class="num" :class="g ? 'oui-muted' : 'gap'" aria-hidden="true">{{ g ?? t("a11y.unknown") }}</span>
    <span v-if="sourceTone(match) !== 'neutral'" class="oui-chip src" :data-tone="sourceTone(match) === 'bad' ? 'danger' : 'warn'" aria-hidden="true">{{ sourceText(match) }}</span>
  </Button>
</template>

<style scoped>
.chip { max-width: 100%; gap: 6px; padding: 2px 6px; font-weight: 400; color: var(--oui-text); }
.name { flex: 0 1 auto; max-width: 28ch; }
.src { flex: none; }
</style>
