<script setup lang="ts">
// Dev harness only (mounted from App.vue under import.meta.env.DEV): theme and language toggles, savedQuote auto-open.
// `?lang=` accepts en*, pt* (en, en-US, pt, pt-BR, case-insensitive); anything else is ignored. It is applied once the
// state has loaded, because loading replaces the settings (and with them the language).
import { ref, watch } from "vue";
import { setLanguage, store } from "../state/store";
import { openQuote } from "../state/quotes";

const q = new URLSearchParams(window.location.search);
const theme = ref(document.documentElement.getAttribute("data-orca-theme") === "light" ? "light" : "dark");
const scenario = q.get("state") ?? "ok";

watch(theme, (v) => document.documentElement.setAttribute("data-orca-theme", v));
const wanted = (q.get("lang") ?? "").toLowerCase();
const lang = wanted.startsWith("pt") ? "pt-BR" : wanted.startsWith("en") ? "en" : null;
watch(() => store.status, (s) => {
  if (s !== "ready") return;
  if (lang) setLanguage(lang);
  if (scenario === "savedQuote" && store.quotes[0]) openQuote(store.quotes[0].id);
}, { immediate: true });
</script>

<template>
  <div class="devbar app-chrome" role="group" aria-label="Dev harness">
    <span class="xs">dev · {{ scenario }}</span>
    <button type="button" class="btn" @click="theme = theme === 'dark' ? 'light' : 'dark'">{{ theme }}</button>
    <button type="button" class="btn" @click="setLanguage(store.settings.language === 'pt-BR' ? 'en' : 'pt-BR')">{{ store.settings.language === "pt-BR" ? "pt-BR" : "en" }}</button>
  </div>
</template>

<style scoped>
.devbar { position: fixed; left: 8px; bottom: 8px; z-index: 90; display: flex; align-items: center; padding: 4px 8px; background: var(--opc-raised); border: 1px solid var(--opc-border); border-radius: var(--opc-r-surface); opacity: 0.85; }
.devbar > * + * { margin-left: 8px; }
.devbar .btn { height: 22px; padding: 0 8px; }
@media (max-width: 899px) { .devbar { bottom: 64px; } }
</style>
