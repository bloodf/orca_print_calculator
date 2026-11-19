<script setup lang="ts">
// What a field or a module needs explained, behind an (i) beside its label (ui-foundation 5: no helper line under a control).
// The text keeps the id the control's aria-describedby points at. The bubble opens towards the side with more room: the
// shared OuiHint opens to the right unless told otherwise, and a field can sit anywhere on the page.
import { ref } from "vue";
import { OuiHint } from "../../../shared/src/components";

defineProps<{ label: string; text: string; id?: string }>();
const end = ref(false);
const side = (e: Event): void => { end.value = (e.currentTarget as HTMLElement).getBoundingClientRect().left > window.innerWidth / 2; };
</script>

<template>
  <span class="fh" @mouseenter="side" @focusin="side"><OuiHint :label="label" :end="end"><span :id="id">{{ text }}</span></OuiHint></span>
</template>

<style scoped>
.fh { display: inline-flex; flex: none; }
</style>
