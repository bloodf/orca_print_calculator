<script setup lang="ts">
// Native select over the user's channels in settings order; channels with no price are suffixed.
import { computed } from "vue";
import { t } from "../../i18n";
import { derived, result, store } from "../../state/store";

defineProps<{ modelValue: string }>();
defineEmits<{ "update:modelValue": [value: string] }>();

const noPrice = computed(() => {
  const bad = new Set<string>(derived.value.skippedChannels.map((c) => c.id));
  if (result.value.ok) for (const c of result.value.channels) if (!c.ok) bad.add(c.id);
  return bad;
});
// An open saved quote lists its own frozen channels, not today's.
const options = computed(() => (store.draft.frozenInput ? store.draft.frozenInput.channels : store.settings.channels).map((c) => ({ id: c.id, label: noPrice.value.has(c.id) ? `${c.name} ${t("price.noPriceSuffix")}` : c.name })));
</script>

<template>
  <select class="channel-select" :value="modelValue" :aria-label="t('price.channel')" @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
    <option v-for="o in options" :key="o.id" :value="o.id" :selected="o.id === modelValue">{{ o.label }}</option>
  </select>
</template>

<style scoped>
.channel-select { width: 100%; }
</style>
