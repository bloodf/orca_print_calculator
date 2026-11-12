<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import Icon from "./Icon.vue";

export type AlertAction = { label: string; run: () => void };
const props = withDefaults(defineProps<{ tone?: "info" | "warn" | "bad"; title?: string; actions?: AlertAction[] }>(), { tone: "info", title: undefined, actions: () => [] });
const icon = props.tone === "bad" ? "alert-circle" : props.tone === "warn" ? "alert-triangle" : "info";
const severity = props.tone === "bad" ? "error" : props.tone === "warn" ? "warn" : "secondary";
</script>

<template>
  <Message class="alert" :class="tone" :severity="severity" :closable="false" :role="tone === 'bad' ? 'alert' : 'status'" :aria-live="tone === 'bad' ? 'assertive' : 'polite'">
    <template #icon><Icon :name="icon" /></template>
    <p v-if="title" class="alert-title">{{ title }}</p>
    <div class="alert-body"><slot /></div>
    <div v-if="actions.length" class="alert-actions">
      <Button v-for="a in actions" :key="a.label" type="button" text size="small" @click="a.run()">{{ a.label }}</Button>
    </div>
  </Message>
</template>

<style scoped>
.alert-title { font-weight: 600; margin: 0; }
.alert-actions { margin-top: 4px; margin-left: -10px; }
</style>
