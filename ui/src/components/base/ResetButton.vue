<script setup lang="ts">
import { t } from "../../i18n";
import Icon from "./Icon.vue";
defineProps<{ label: string; defaultText: string }>();
defineEmits<{ click: [] }>();
</script>

<template>
  <button type="button" class="btn icon" :aria-label="t('a11y.resetTo', { label, value: defaultText })" :title="t('field.reset')" @click="$emit('click')">
    <Icon name="reset" />
  </button>
</template>
