<script setup lang="ts">
// The step-by-step guide behind every "?" button, on PrimeVue's Dialog (modal, focus trap, Esc, close button). Focus goes back
// to the control that opened it.
import Dialog from "primevue/dialog";
import { computed, nextTick } from "vue";
import { t } from "../i18n";
import { closeHelp, HELP_STEPS, helpStep, openHelp } from "../state/help";
import { useDialogFocus } from "./base/dialogFocus";

const visible = computed(() => helpStep.value !== null);
const focus = useDialogFocus();
function onVisible(v: boolean): void { if (!v) closeHelp(); else openHelp(); }
async function onShow(): Promise<void> {
  focus.capture();
  await nextTick();
  const body = document.querySelector<HTMLElement>(".help .p-dialog-content");
  if (helpStep.value === HELP_STEPS[0]) { if (body) body.scrollTop = 0; } // opened from the header: start at the title
  else body?.querySelector<HTMLElement>(`[data-step="${helpStep.value}"]`)?.scrollIntoView?.({ block: "start" });
}
</script>

<template>
  <Dialog :visible="visible" modal dismissable-mask :draggable="false" :header="t('help.title')" class="help app-chrome" @update:visible="onVisible" @show="onShow" @after-hide="focus.restore()">
    <p class="muted help-intro">{{ t("help.intro") }}</p>
    <ol class="help-steps">
      <li v-for="(s, i) in HELP_STEPS" :key="s" :data-step="s" :class="{ on: s === helpStep }" :aria-current="s === helpStep ? 'step' : undefined">
        <span class="help-n num" aria-hidden="true">{{ i + 1 }}</span>
        <div>
          <h3>{{ t(`help.${s}.title`) }}</h3>
          <p>{{ t(`help.${s}.body`) }}</p>
        </div>
      </li>
    </ol>
  </Dialog>
</template>

<style>
.p-dialog.help { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 64px); }
.help .help-intro { margin: 0; }
.help .help-steps { list-style: none; margin: 12px 0 0; padding: 0; }
.help .help-steps li { display: flex; padding: 10px 8px; border-left: 2px solid transparent; border-top: 1px solid var(--opc-border); scroll-margin-top: 8px; }
.help .help-steps li.on { border-left-color: var(--opc-accent-text); background: var(--opc-hover); }
.help .help-n { flex: none; width: 24px; color: var(--opc-accent-text); font-weight: 600; }
.help .help-steps h3 { margin: 0 0 2px; font-size: inherit; font-weight: 600; }
.help .help-steps p { margin: 0; color: var(--opc-muted); }
</style>
