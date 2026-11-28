<script setup lang="ts">
import Button from "primevue/button";
// An address as selectable text plus a "Copy link" button. URLs never render as links (docs/ux.md §7.10).
import { onBeforeUnmount, ref } from "vue";
import { copyText } from "../../clipboard";
import { t } from "../../i18n";
import { OuiIcon } from "@orca-plugins/ui-foundation/src/components";
import * as I from "@orca-plugins/ui-foundation/src/icons";

const props = defineProps<{ value: string }>();
const copied = ref(false); // a copy was attempted
const ok = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(timer));

async function copy(): Promise<void> {
  ok.value = await copyText(props.value);
  copied.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <div class="cv row">
    <span class="cv-text num sm">{{ value }}</span>
    <Button text severity="secondary" type="button" class="icon-btn" :aria-label="t('common.copyLink')" :title="t('common.copyLink')" @click="copy">
      <OuiIcon :icon="copied && ok ? I.check : I.copy" />
    </Button>
    <span class="sm oui-muted" role="status">{{ copied ? t(ok ? "common.copied" : "common.copyFailed") : "" }}</span>
  </div>
</template>

<style scoped>
.cv { min-height: 28px; }
.cv-text { user-select: text; -webkit-user-select: text; white-space: normal; overflow-wrap: anywhere; padding: 2px 6px; border-radius: var(--oui-radius); background: var(--oui-surface); border: 1px solid var(--oui-border); }
</style>
