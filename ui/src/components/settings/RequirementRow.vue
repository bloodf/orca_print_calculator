<script setup lang="ts">
// One row of Settings › Requirements. Kept in one small component so ui-foundation's OuiRequirement can replace it.
import { t } from "../../i18n";
import { OuiStatus } from "../../../shared/src/components";
import CopyValue from "./CopyValue.vue";

defineProps<{ name: string; ok: boolean; status: string; why: string; how: string; link: string }>();
</script>

<template>
  <div class="req" :data-ok="ok">
    <p class="req-head"><span class="oui-strong">{{ name }}</span> <span class="sm oui-muted">{{ t("req.optional") }}</span> <OuiStatus :state="ok ? 'ok' : 'idle'">{{ status }}</OuiStatus></p>
    <p class="sm oui-muted">{{ why }}</p>
    <template v-if="!ok">
      <p class="sm">{{ how }}</p>
      <CopyValue :value="link" :label="name" />
    </template>
  </div>
</template>

<style scoped>
.req > * + * { margin-top: 4px; }
.req-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--oui-s2); }
</style>
