<script setup lang="ts">
import Button from "primevue/button";
import { t } from "../../i18n";
import { OuiIcon } from "../../../shared/src/components";
import * as I from "../../../shared/src/icons";
defineProps<{ label: string; defaultText: string }>();
defineEmits<{ click: [] }>();
</script>

<template>
  <Button type="button" text severity="secondary" class="icon-btn" :aria-label="t('a11y.resetTo', { label, value: defaultText })" :title="t('field.reset')" @click="$emit('click')">
    <OuiIcon :icon="I.undo" />
  </Button>
</template>
