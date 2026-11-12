<script setup lang="ts">
// Spoolman status chip (docs/ux.md §5.3): dot + text; click depends on state. Text collapses to the dot below 1100px.
import Button from "primevue/button";
import { computed, ref } from "vue";
import { t } from "../i18n";
import { fetchSpoolman } from "../state/store";
import type { SpoolmanState } from "../state/types";
import { elOf } from "./base/el";
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
  <Button :ref="(c) => (anchor = elOf(c))" severity="secondary" outlined size="small" type="button" class="chip" :aria-label="text" :title="text" :aria-busy="busy ? 'true' : undefined" :aria-haspopup="state === 'offline' ? 'dialog' : undefined" :aria-expanded="state === 'offline' ? open : undefined" @click="click">
    <span class="dot" :class="state" aria-hidden="true" />
    <span class="txt sm">{{ text }}</span>
  </Button>
  <Popover :open="open" :anchor="anchor" :label="t('spoolman.offline')" @close="open = false">
    <p class="sm">{{ errorText }}</p>
    <div class="row acts">
      <Button type="button" @click="retry">{{ t("spoolman.retry") }}</Button>
      <Button severity="secondary" outlined type="button" @click="settings">{{ t("nav.settings") }}</Button>
    </div>
  </Popover>
</template>

<style scoped>
.chip { min-width: 0; max-width: 100%; overflow: hidden; }
.txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 24ch; }
.dot { width: 8px; height: 8px; border-radius: var(--opc-r-pill); flex: none; background: var(--opc-muted); }
.dot.unset { background: transparent; border: 1px solid var(--opc-muted); box-sizing: border-box; }
.dot.ok { background: var(--opc-ok); }
.dot.offline { background: var(--opc-bad); }
.acts { margin-top: var(--opc-s3); }
@media (max-width: 1099px) { .txt { display: none; } .chip { width: 36px; padding: 0; justify-content: center; } }
</style>
