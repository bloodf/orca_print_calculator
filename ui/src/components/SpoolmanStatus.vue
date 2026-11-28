<script setup lang="ts">
// Spoolman status chip (docs/ux.md §5.3): dot + text; click depends on state. The text shortens to "Spoolman", then to the dot, as the bar narrows (AppHeader).
import Button from "primevue/button";
import { computed, ref } from "vue";
import { t } from "../i18n";
import { fetchSpoolman } from "../state/store";
import type { SpoolmanState } from "../state/types";
import { OuiStatus } from "@orca-plugins/ui-foundation/src/components";
import { elOf } from "./base/el";
import Popover from "./base/Popover.vue";
import { gotoSettings } from "./costs/shared";
import { spoolmanErrorMessage } from "./settings/spoolmanError";

const props = defineProps<{ state: SpoolmanState; spools?: number; error?: string }>();
const open = ref(false);
const anchor = ref<HTMLElement | null>(null);

const text = computed(() => (props.state === "ok" ? t("spoolman.ok", { n: props.spools ?? 0 }) : t(`spoolman.${props.state}`)));
const errorText = computed(() => spoolmanErrorMessage(props.error ?? "unknown"));
// One page, one connection state: Spoolman is the only thing this page connects to.
const STATE = { ok: "ok", offline: "offline", connecting: "connecting", unset: "idle" } as const;
const busy = computed(() => props.state === "connecting");

function click(): void {
  if (props.state === "unset") gotoSettings("settings-spoolman");
  else if (props.state === "offline" || props.state === "ok") open.value = !open.value; // one small popover for both: the state, then Refresh / Retry and Settings
}
const retry = () => { open.value = false; void fetchSpoolman(); };
const settings = () => { open.value = false; gotoSettings("settings-spoolman"); };
</script>

<template>
  <Button :ref="(c) => (anchor = elOf(c))" severity="secondary" text size="small" type="button" class="chip sp-chip" :aria-label="text" :title="text" :aria-busy="busy ? 'true' : undefined" :aria-haspopup="state === 'offline' || state === 'ok' ? 'dialog' : undefined" :aria-expanded="state === 'offline' || state === 'ok' ? open : undefined" @click="click">
    <OuiStatus class="dot" :class="state" :state="STATE[state]"><span class="sm-text">{{ text }}</span><span class="sm-short" aria-hidden="true">Spoolman</span></OuiStatus>
  </Button>
  <Popover :open="open" :anchor="anchor" :label="state === 'ok' ? text : t('spoolman.offline')" @close="open = false">
    <p>{{ state === "ok" ? text : errorText }}</p>
    <div class="oui-row acts">
      <Button type="button" @click="retry">{{ t(state === "ok" ? "plates.refresh" : "spoolman.retry") }}</Button>
      <Button severity="secondary" type="button" @click="settings">{{ t("nav.settings") }}</Button>
    </div>
  </Popover>
</template>

<style scoped>
.sp-chip { flex: none; padding: 0 2px; }
.acts { margin-top: var(--oui-s3); }
</style>
