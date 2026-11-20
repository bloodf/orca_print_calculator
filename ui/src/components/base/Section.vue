<script setup lang="ts">
// A disclosure row. `box` is a row of the Costs panel: icon tile in the hue of its subject, name over a one-line summary,
// the amount, the chevron. `flush` is a quiet heading inside the price panel (breakdown, channels, batch).
import Button from "primevue/button";
import { computed } from "vue";
import { OuiIcon, type OuiIconData, type OuiTone } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";
import { t } from "../../i18n";
import { openHelp, type HelpStep } from "../../state/help";

const props = withDefaults(
  defineProps<{
    id: string; title: string; summary?: string; open: boolean; variant?: "box" | "flush"; overridden?: boolean; invalid?: boolean; help?: HelpStep;
    icon?: OuiIconData; tone?: OuiTone;
    /** The section's amount per piece, already formatted. `null` is not known yet (a dash); leave it out for no amount column. */
    amount?: string | null; partial?: boolean;
  }>(),
  { summary: undefined, help: undefined, variant: "box", overridden: false, invalid: false, icon: undefined, tone: undefined, amount: undefined, partial: false },
);
const emit = defineEmits<{ "update:open": [open: boolean] }>();
const isOpen = computed(() => props.open || props.invalid);
</script>

<template>
  <section class="sec" :class="[variant, { open: isOpen }]" :data-section="id">
    <h3 class="sec-h">
      <Button type="button" text severity="secondary" class="sec-btn" :aria-expanded="isOpen" :aria-controls="`${id}-body`" @click="emit('update:open', !isOpen)">
        <OuiIcon v-if="icon" :icon="icon" :size="16" tile :tone="tone" />
        <span v-else class="chev" :class="{ on: isOpen }"><OuiIcon :icon="I.chevronRight" :size="14" /></span>
        <span class="sec-id">
          <span class="sec-name">
            <span v-if="overridden" class="ovr-dot" aria-hidden="true" />
            <span v-if="overridden" class="oui-sr">{{ t("section.edited") }}</span>
            <span class="sec-title" :class="variant === 'flush' ? 'oui-label' : 'oui-strong'">{{ title }}</span>
            <span v-if="invalid" class="bad-icon"><OuiIcon :icon="I.error" :size="14" /></span>
          </span>
          <span v-if="summary" class="oui-sr">: </span>
          <span v-if="summary" class="oui-meta num oui-truncate sec-sum">{{ summary }}</span>
        </span>
        <span v-if="amount !== undefined" class="sec-amt num" :class="amount === null || partial ? 'gap' : 'oui-strong'" data-amount>
          <template v-if="amount === null"><span aria-hidden="true">—</span><span class="oui-sr">{{ t("a11y.unknown") }}</span></template>
          <template v-else>{{ amount }}</template>
          <!-- partial is said in words too, not by the amber colour alone -->
          <span v-if="amount !== null && partial" class="oui-chip sec-part" data-tone="warn" data-partial><span class="oui-sr">· </span>{{ t("price.partial") }}</span>
        </span>
        <span v-if="icon" class="chev" :class="{ on: isOpen }"><OuiIcon :icon="I.chevronRight" :size="14" /></span>
      </Button>
      <Button v-if="help" type="button" text severity="secondary" class="icon-btn-sm sec-help" :title="t('help.about', { name: title })" :aria-label="t('help.about', { name: title })" aria-haspopup="dialog" @click="openHelp(help)"><OuiIcon :icon="I.info" :size="14" /></Button>
    </h3>
    <div v-if="isOpen" :id="`${id}-body`" class="sec-body fade-in" role="region" :aria-label="title"><slot /></div>
  </section>
</template>

<style scoped>
.sec.box + .sec.box { border-top: 1px solid var(--oui-border); }
.sec.flush { border-top: 1px solid var(--oui-border); }
.sec-h { display: flex; align-items: center; }
.sec-help { flex: none; margin-inline-end: var(--oui-s2); color: var(--oui-muted); }
.sec-h :deep(.sec-btn) { flex: 1 1 auto; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: var(--oui-s3); min-width: 0; min-height: 52px; height: auto;
  padding: var(--oui-s2) var(--oui-s2) var(--oui-s2) var(--oui-s4); border: 0; border-radius: 0; text-align: start; color: var(--oui-text); font-weight: 400; }
.sec.box:not(:has(.sec-help)) .sec-h :deep(.sec-btn) { padding-inline-end: var(--oui-s4); }
.sec.flush .sec-h :deep(.sec-btn) { grid-template-columns: auto minmax(0, 1fr); gap: var(--oui-s2); min-height: 36px; padding: 0; }
.sec.flush .sec-h :deep(.sec-btn:hover) { background: none; }
.sec-id { display: grid; gap: 1px; min-width: 0; }
.sec-name { display: flex; align-items: center; gap: 6px; min-width: 0; }
.sec-title { min-width: 0; }
.sec-sum { font-weight: 400; }
.sec-amt { justify-self: end; display: grid; justify-items: end; gap: 2px; }
.sec-part { font-weight: 600; }
.chev { display: inline-flex; color: var(--oui-muted); transition: transform var(--oui-fast) var(--oui-ease); }
.chev.on { transform: rotate(90deg); }
.bad-icon { color: var(--oui-danger); display: inline-flex; }
.sec.box .sec-body { padding: var(--oui-s3) var(--oui-s4) var(--oui-s4); border-top: 1px solid var(--oui-border); background: var(--oui-inset); }
.sec.flush .sec-body { padding: var(--oui-s1) 0 var(--oui-s3); }
</style>
