<script setup lang="ts">
// What the quote is called and who it is for: title, customer, and a note for the customer behind "Add a note".
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import { computed, nextTick, ref } from "vue";
import { OuiIcon } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";
import { t } from "../../i18n";
import { patchDraft, store } from "../../state/store";
import { elOf } from "../base/el";

const draft = computed(() => store.draft);
const open = ref(false);
const showNote = computed(() => open.value || !!draft.value.note);
const note = ref<HTMLElement | null>(null);
async function reveal(): Promise<void> { open.value = true; await nextTick(); note.value?.focus(); }
const onInput = (key: "title" | "customer" | "note", e: Event): void => patchDraft({ [key]: (e.target as HTMLInputElement).value });
</script>

<template>
  <div class="qf">
    <div class="oui-field">
      <label for="qa-title">{{ t("quote.title") }}</label>
      <InputText id="qa-title" type="text" :model-value="draft.title" :placeholder="store.host.projectName ?? ''" fluid @input="onInput('title', $event)" />
    </div>
    <div class="oui-field">
      <label for="qa-customer">{{ t("quote.customer") }}</label>
      <InputText id="qa-customer" type="text" :model-value="draft.customer" fluid @input="onInput('customer', $event)" />
    </div>
    <div v-if="showNote" class="oui-field wide">
      <label for="qa-note">{{ t("quote.note") }}</label>
      <Textarea id="qa-note" :ref="(c) => (note = elOf(c))" rows="2" auto-resize :model-value="draft.note" fluid @input="onInput('note', $event)" />
    </div>
    <Button v-else text severity="secondary" size="small" type="button" class="add wide" @click="reveal"><OuiIcon :icon="I.plus" :size="14" /><span>{{ t("quote.addNote") }}</span></Button>
  </div>
</template>

<style scoped>
.qf { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--oui-s3); }
.wide { grid-column: 1 / -1; }
.add { justify-self: start; }
</style>
