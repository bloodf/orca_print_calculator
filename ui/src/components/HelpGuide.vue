<script setup lang="ts">
// The step-by-step guide behind every "?" button. Native <dialog>: focus trap, Esc and focus return come from the browser.
import { nextTick, ref, watch } from "vue";
import { t } from "../i18n";
import { closeHelp, HELP_STEPS, helpStep } from "../state/help";
import Icon from "./base/Icon.vue";

const el = ref<HTMLDialogElement | null>(null);
watch(helpStep, async (step) => {
  const d = el.value;
  if (!d) return;
  if (step === null) { if (d.open) d.close?.(); d.removeAttribute("open"); return; }
  if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); } // no showModal before Safari 15.4: plain open
  await nextTick();
  if (step === HELP_STEPS[0]) d.scrollTop = 0; // opened from the header: start at the title
  else d.querySelector<HTMLElement>(`[data-step="${step}"]`)?.scrollIntoView?.({ block: "start" });
});
</script>

<template>
  <dialog ref="el" class="help app-chrome" :aria-label="t('help.title')" @close="closeHelp" @click="(e) => e.target === el && closeHelp()">
    <div class="help-in">
      <div class="help-head row">
        <h2 class="lg">{{ t("help.title") }}</h2>
        <button type="button" class="btn icon" :aria-label="t('common.close')" @click="closeHelp"><Icon name="x" /></button>
      </div>
      <p class="muted">{{ t("help.intro") }}</p>
      <ol class="help-steps">
        <li v-for="(s, i) in HELP_STEPS" :key="s" :data-step="s" :class="{ on: s === helpStep }" :aria-current="s === helpStep ? 'step' : undefined">
          <span class="help-n num" aria-hidden="true">{{ i + 1 }}</span>
          <div>
            <h3>{{ t(`help.${s}.title`) }}</h3>
            <p>{{ t(`help.${s}.body`) }}</p>
          </div>
        </li>
      </ol>
    </div>
  </dialog>
</template>

<style scoped>
.help { position: fixed; top: 32px; left: 0; right: 0; z-index: 80; margin: 0 auto; padding: 0; width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow-y: auto; color: var(--opc-fg); background: var(--opc-bg); border: 1px solid var(--opc-border); border-radius: var(--opc-r-surface); box-shadow: var(--opc-shadow); }
.help::backdrop { background: rgba(0, 0, 0, 0.45); }
.help-in { padding: 0 16px 16px; }
.help-head { position: sticky; top: 0; justify-content: space-between; padding: 12px 0 8px; background: var(--opc-bg); }
.help-head h2 { margin: 0; }
.help-steps { list-style: none; margin: 12px 0 0; padding: 0; }
.help-steps li { display: flex; padding: 10px 8px; border-left: 2px solid transparent; border-top: 1px solid var(--opc-border); scroll-margin-top: 52px; }
.help-steps li.on { border-left-color: var(--opc-accent-text); background: var(--opc-hover); }
.help-n { flex: none; width: 24px; color: var(--opc-accent-text); font-weight: 600; }
.help-steps h3 { margin: 0 0 2px; font-size: inherit; font-weight: 600; }
.help-steps p { margin: 0; color: var(--opc-muted); }
</style>
