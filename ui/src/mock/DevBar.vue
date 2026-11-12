<script setup lang="ts">
// Dev harness only (mounted from App.vue under import.meta.env.DEV): theme and language toggles, savedQuote auto-open.
// `?lang=` accepts en*, pt* (en, en-US, pt, pt-BR, case-insensitive); anything else is ignored. It is applied once the
// state has loaded, because loading replaces the settings (and with them the language).
import Button from "primevue/button";
import { ref, watch } from "vue";
import { patchDraft, setLanguage, setView, store } from "../state/store";
import { closeQuote, openQuote } from "../state/quotes";
import type { View } from "../state/types";

const q = new URLSearchParams(window.location.search);
const theme = ref(document.documentElement.getAttribute("data-orca-theme") === "light" ? "light" : "dark");
const scenario = q.get("state") ?? "ok";

watch(theme, (v) => document.documentElement.setAttribute("data-orca-theme", v));
const wanted = (q.get("lang") ?? "").toLowerCase();
const lang = wanted.startsWith("pt") ? "pt-BR" : wanted.startsWith("en") ? "en" : null;
watch(() => store.status, (s) => {
  if (s !== "ready") return;
  if (lang) setLanguage(lang);
  if ((scenario === "savedQuote" || scenario === "legacyQuote") && store.quotes[0]) openQuote(store.quotes[0].id);
  // screenshots only: `?view=quotes|stock|settings` opens that tab; `?act=closeDirty` edits the open quote and closes it (the Undo toast)
  const view = q.get("view");
  if (view === "quotes" || view === "stock" || view === "settings") setView(view as View);
  if (q.get("act") === "closeDirty" && store.quotes[0]) { openQuote(store.quotes[0].id); patchDraft({ customer: "Edited, not saved" }); closeQuote(); }
}, { immediate: true });
const bar = q.get("bar") !== "0"; // `?bar=0` hides this bar in screenshots
</script>

<template>
  <div v-if="bar" class="devbar app-chrome" role="group" aria-label="Dev harness">
    <span class="xs">dev · {{ scenario }}</span>
    <Button type="button" size="small" severity="secondary" outlined @click="theme = theme === 'dark' ? 'light' : 'dark'">{{ theme }}</Button>
    <Button type="button" size="small" severity="secondary" outlined @click="setLanguage(store.settings.language === 'pt-BR' ? 'en' : 'pt-BR')">{{ store.settings.language === "pt-BR" ? "pt-BR" : "en" }}</Button>
  </div>
</template>

<style scoped>
.devbar { position: fixed; left: 8px; bottom: 8px; z-index: 90; display: flex; align-items: center; padding: 4px 8px; background: var(--opc-raised); border: 1px solid var(--opc-border); border-radius: var(--opc-r-surface); opacity: 0.85; }
.devbar > * + * { margin-left: 8px; }
@media (max-width: 899px) { .devbar { bottom: 64px; } }
</style>
