<script setup lang="ts">
import { computed } from "vue";
import { t } from "../../i18n";
import { openHelp, type HelpStep } from "../../state/help";
import Icon from "./Icon.vue";

const props = withDefaults(
  defineProps<{ id: string; title: string; summary?: string; open: boolean; variant?: "box" | "flush"; overridden?: boolean; invalid?: boolean; help?: HelpStep }>(),
  { summary: undefined, help: undefined, variant: "box", overridden: false, invalid: false },
);
const emit = defineEmits<{ "update:open": [open: boolean] }>();
const isOpen = computed(() => props.open || props.invalid);
</script>

<template>
  <section class="sec" :class="variant" :data-section="id">
    <h3 class="sec-h">
      <button type="button" class="sec-btn" :aria-expanded="isOpen" :aria-controls="`${id}-body`" @click="emit('update:open', !isOpen)">
        <span class="chev" :class="{ on: isOpen }"><Icon name="chevron-right" /></span>
        <span v-if="overridden" class="ovr-dot" aria-hidden="true" />
        <span v-if="overridden" class="sr-only">{{ t("section.edited") }}</span>
        <span class="lg sec-title">{{ title }}</span>
        <span v-if="invalid" class="bad-icon"><Icon name="alert-circle" /></span>
        <span v-if="summary" class="sr-only">: </span>
        <span v-if="summary" class="sm muted num sec-sum">{{ summary }}</span>
      </button>
      <button v-if="help" type="button" class="btn icon sec-help" :title="t('help.about', { name: title })" :aria-label="t('help.about', { name: title })" aria-haspopup="dialog" @click="openHelp(help)"><Icon name="help" /></button>
    </h3>
    <div v-if="isOpen" :id="`${id}-body`" class="sec-body fade-in" role="region" :aria-label="title"><slot /></div>
  </section>
</template>

<style scoped>
.sec.box { border: 1px solid var(--opc-border); border-radius: var(--opc-r-surface); }
.sec.flush { border-top: 1px solid var(--opc-border); }
.sec-h { margin: 0; font-weight: inherit; display: flex; align-items: center; }
.sec-help { flex: none; margin-right: 8px; }
.sec.flush .sec-help { margin-right: 0; }
.sec-btn { display: flex; align-items: center; flex: 1 1 auto; min-width: 0; min-height: 40px; padding: 0 12px; border: 0; background: transparent; text-align: left; border-radius: var(--opc-r-surface); }
.sec-btn:hover { background: var(--opc-hover); }
.sec-btn > * + * { margin-left: 8px; }
.sec.flush .sec-btn { padding: 0; }
.chev { display: inline-flex; color: var(--opc-muted); transition: transform var(--opc-dur-fast) var(--opc-ease); }
.chev.on { transform: rotate(90deg); }
.sec-title { min-width: 0; }
.bad-icon { color: var(--opc-bad); display: inline-flex; }
.sec-sum { margin-left: auto !important; padding-left: 12px; overflow: hidden; text-overflow: ellipsis; }
.sec-body { padding: 4px 12px 12px; }
.sec.flush .sec-body { padding: 4px 0 12px; }
</style>
