<script setup lang="ts">
// Spoolman status chip (docs/ux.md §5.3): dot + text; click depends on state. Text collapses to the dot below 1100px.
import { computed, ref } from "vue";
import { t } from "../i18n";
import { fetchSpoolman } from "../state/store";
import type { SpoolmanState } from "../state/types";
import Popover from "./base/Popover.vue";
import { gotoSettings } from "./costs/shared";
import { spoolmanErrorMessage } from "./settings/spoolmanError";

const props = defineProps<{ state: SpoolmanState; spools?: number; error?: string }>();
const open = ref(false);
const anchor = ref<HTMLElement | null>(null);

const text = computed(() => (props.state === "ok" ? t("spoolman.ok", { n: props.spools ?? 0 }) : t(`spoolman.${props.state}`)));
const errorText = computed(() => spoolmanErrorMessage(props.error ?? "unknown"));
const busy = computed(() => props.state === "connecting");

function click(): void {
  if (props.state === "unset") gotoSettings("settings-spoolman");
  else if (props.state === "offline") open.value = !open.value;
  else if (props.state === "ok") void fetchSpoolman();
}
const retry = () => { open.value = false; void fetchSpoolman(); };
const settings = () => { open.value = false; gotoSettings("settings-spoolman"); };
</script>

<template>
  <button ref="anchor" type="button" class="chip btn" :aria-label="text" :aria-busy="busy ? 'true' : undefined" :aria-haspopup="state === 'offline' ? 'dialog' : undefined" :aria-expanded="state === 'offline' ? open : undefined" @click="click">
    <span class="dot" :class="state" aria-hidden="true" />
    <span class="txt sm">{{ text }}</span>
  </button>
  <Popover :open="open" :anchor="anchor" :label="t('spoolman.offline')" @close="open = false">
    <p class="sm">{{ errorText }}</p>
    <div class="row acts">
      <button type="button" class="btn primary" @click="retry">{{ t("spoolman.retry") }}</button>
      <button type="button" class="btn" @click="settings">{{ t("nav.settings") }}</button>
    </div>
  </Popover>
</template>

<style scoped>
.chip > * + * { margin-left: 6px; }
.dot { width: 8px; height: 8px; border-radius: var(--opc-r-pill); flex: none; background: var(--opc-muted); }
.dot.unset { background: transparent; border: 1px solid var(--opc-muted); box-sizing: border-box; }
.dot.ok { background: var(--opc-ok); }
.dot.offline { background: var(--opc-bad); }
.acts { margin-top: var(--opc-s3); }
@media (max-width: 1099px) { .txt { display: none; } .chip { width: 28px; padding: 0; justify-content: center; } }
</style>
