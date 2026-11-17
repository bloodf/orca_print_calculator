<script setup lang="ts">
// Settings › Requirements: both are optional; the calculator works without them (Spoolman prices fall back to Orca presets).
import { computed, ref } from "vue";
import { t } from "../../i18n";
import { checkRequirements, store } from "../../state/store";
import { OuiRequirement } from "../../../shared/src/components";
import { spoolmanErrorMessage } from "./spoolmanError";

type Row = { status: "found" | "missing" | "checking" | "unknown"; label: string; detail?: string };
const busy = ref(false);
const saved = computed(() => store.settings.spoolman.url.trim());
const optional = (why: string): string => `${t("req.optional")} · ${t(why)}`;
// A saved address is shown as the page's own connection sees it; without one, Spooler's address counts as detected.
const spoolman = computed<Row>(() => {
  const sp = store.spoolman;
  if (busy.value) return { status: "checking", label: t("req.checking") };
  if (!saved.value) {
    return store.spooler?.url ? { status: "found", label: t("req.detected"), detail: t("req.spoolman.detected", { url: store.spooler.url }) }
      : { status: "missing", label: t("req.notSet") };
  }
  if (sp.state === "ok") return { status: "found", label: t("req.found"), detail: `${saved.value} · ${t("spoolman.ok", { n: sp.data.spools.length })}` };
  if (sp.state === "offline") return { status: "missing", label: t("req.notFound"), detail: `${saved.value} · ${spoolmanErrorMessage(sp.error ?? "unknown")}` };
  return { status: "checking", label: t("req.checking"), detail: saved.value };
});
const spooler = computed<Row>(() => (busy.value ? { status: "checking", label: t("req.checking") }
  : store.spooler ? { status: "found", label: t("req.detected") } : { status: "missing", label: t("req.notInstalled") }));

async function again(): Promise<void> {
  busy.value = true;
  try { await checkRequirements(); } finally { busy.value = false; }
}
</script>

<template>
  <div class="reqs">
    <OuiRequirement
      name="Spoolman" :why="optional('req.spoolman.why')" :status="spoolman.status" :status-label="spoolman.label" :detail="spoolman.detail"
      :install-text="t('req.spoolman.how')" install-url="https://github.com/Donkie/Spoolman" install-label="github.com/Donkie/Spoolman"
      :check-label="t('req.checkAgain')" :checking="busy" data-req="spoolman" @check="again"
    />
    <OuiRequirement
      name="Spooler" :why="optional('req.spooler.why')" :status="spooler.status" :status-label="spooler.label"
      :install-text="t('req.spooler.how')" install-url="https://cloud.orcaslicer.com/p/50c35dcbd6f3" install-label="cloud.orcaslicer.com/p/50c35dcbd6f3"
      :check-label="t('req.checkAgain')" :checking="busy" data-req="spooler" @check="again"
    />
  </div>
</template>

<style scoped>
.reqs > * + * { border-top: 1px solid var(--oui-border); }
</style>
