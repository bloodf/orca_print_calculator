<script setup lang="ts">
// Dev-only gallery of the base primitives (?kit=1). Used to eyeball tokens and states; never in production.
import { ref } from "vue";
import Badge from "../components/base/Badge.vue";
import EmptyState from "../components/base/EmptyState.vue";
import Icon from "../components/base/Icon.vue";
import InlineAlert from "../components/base/InlineAlert.vue";
import MoneyField from "../components/base/MoneyField.vue";
import NumberField from "../components/base/NumberField.vue";
import PercentField from "../components/base/PercentField.vue";
import Section from "../components/base/Section.vue";
import Segmented from "../components/base/Segmented.vue";
import Stepper from "../components/base/Stepper.vue";
import ToastHost from "../components/base/ToastHost.vue";
import { ICONS, type IconName } from "../components/base/icons";
import { toast } from "../state/toast";
import { t } from "../i18n";

const money = ref<number | null>(123450);
const energy = ref<number | null>(null);
const pct = ref<number | null>(2970);
const watts = ref<number | null>(120);
const q = ref(1);
const open = ref(true);
const seg = ref("customer");
const names = Object.keys(ICONS) as IconName[];
toast({ text: "Quote #0042 deleted", action: { label: t("common.undo"), run: () => {} } });
toast({ text: "Couldn't save the file.", tone: "bad" });
</script>

<template>
  <main class="kit">
    <h1 class="view-title">Base primitives</h1>
    <p class="price-sample num" style="font-size: var(--opc-fs-price); font-weight: 600; letter-spacing: -0.02em; color: var(--opc-price)">R$ 48,90</p>
    <div class="icons"><span v-for="n in names" :key="n" :title="n"><Icon :name="n" /></span><span><Icon name="mark" :size="20" /></span></div>
    <div class="form-grid">
      <MoneyField v-model="money" label="Printer price" :digits="2" currency="BRL" :step="100" :default-value="450000" />
      <MoneyField v-model="energy" label="Price per kWh" :digits="4" currency="BRL" :step="100" unit="/kWh" nullable />
      <PercentField v-model="pct" label="Target margin" :default-value="3000" />
      <NumberField v-model="watts" label="Average power" :scale="1" :step="10" unit="W" :min="1" :max="5000" helper="Saved for Snapmaker U1" />
      <MoneyField :model-value="1000" label="With error" :digits="2" currency="BRL" :step="100" error="Use at most 2 decimals." />
    </div>
    <div class="row"><Stepper v-model="q" :min="1" :max="100000" label="Quantity" /><Segmented v-model="seg" label="Shipping" :options="[{ value: 'none', label: 'Not included' }, { value: 'customer', label: 'Customer pays' }, { value: 'absorbed', label: 'I pay' }]" /></div>
    <div class="row"><Badge text="Spooler" /><Badge tone="info" text="Estimated" /><Badge tone="ok" text="Connected" /><Badge tone="warn" text="Preset price" /><Badge tone="bad" text="No price" /></div>
    <button type="button" class="btn primary">Save quote</button> <button type="button" class="btn">Print quote</button> <button type="button" class="btn ghost">Edit in settings</button> <button type="button" class="btn danger">Delete</button>
    <InlineAlert tone="info">Plates from desk.gcode.3mf. Slice in OrcaSlicer to replace them.</InlineAlert>
    <InlineAlert tone="warn" :actions="[{ label: 'Retry', run: () => {} }]">Spoolman isn't responding at http://192.168.1.10:7912.</InlineAlert>
    <InlineAlert tone="bad">Slot 2 has no price, counted as 0.</InlineAlert>
    <Section id="k1" title="Machine and energy" summary="Energy R$ 0,82 · Machine R$ 1,90" v-model:open="open" overridden>
      <p class="muted">Body</p>
    </Section>
    <Section id="k2" title="Labor" summary="10 min · R$ 4,17" :open="false" />
    <EmptyState art="plate" title="Slice to see a price" body="Slice the project in OrcaSlicer." />
    <ToastHost />
  </main>
</template>

<style scoped>
.kit { max-width: 880px; margin: 0 auto; padding: 16px; }
.kit > * + * { margin-top: 12px; }
.icons { display: flex; color: var(--opc-fg); }
.icons > * + * { margin-left: 8px; }
</style>
