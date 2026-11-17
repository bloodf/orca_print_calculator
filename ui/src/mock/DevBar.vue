<script setup lang="ts">
// Dev harness only (mounted from App.vue under import.meta.env.DEV): theme and language toggles, savedQuote auto-open.
// `?lang=` accepts a language the plugin has, by its code or a regional form of it (en, en-US, pt, pt-BR, es, de, zh, zh-CN, pl, pl_PL,
// case-insensitive); anything else is ignored. It is applied once the
// state has loaded, because loading replaces the settings (and with them the language).
import Button from "primevue/button";
import { ref, watch } from "vue";
import { isLocale, LOCALES, resolveLocale } from "../i18n";
import { derived, patchDraft, setLanguage, setView, store } from "../state/store";
import { closeQuote, openQuote } from "../state/quotes";
import type { View } from "../state/types";

const q = new URLSearchParams(window.location.search);
const theme = ref(document.documentElement.getAttribute("data-orca-theme") === "light" ? "light" : "dark");
const scenario = q.get("state") ?? "ok";

watch(theme, (v) => document.documentElement.setAttribute("data-orca-theme", v));
const wanted = q.get("lang") ?? "";
const lang = /^en/i.test(wanted) ? "en" : resolveLocale("auto", wanted) === "en" ? null : resolveLocale("auto", wanted);
const shown = (): string => (isLocale(store.settings.language) ? store.settings.language : "en");
watch(() => store.status, (s) => {
  if (s !== "ready") return;
  if (lang) setLanguage(lang);
  if ((scenario === "savedQuote" || scenario === "legacyQuote") && store.quotes[0]) openQuote(store.quotes[0].id);
  // "No price works" only happens to a quote priced before calc 3 (markup on cost always has a price): show it as one
  if (scenario === "impossible") patchDraft({ frozenInput: { ...derived.value.quoteInput, calc: 2 }, frozenPlates: derived.value.snapshots });
  // screenshots only: `?view=quotes|stock|settings` opens that tab; `?act=closeDirty` edits the open quote and closes it (the Undo toast)
  const view = q.get("view");
  if (view === "quotes" || view === "stock" || view === "settings") setView(view as View);
  if (q.get("act") === "closeDirty" && store.quotes[0]) { openQuote(store.quotes[0].id); patchDraft({ customer: "Edited, not saved" }); closeQuote(); }
}, { immediate: true });
const bar = q.get("bar") !== "0"; // `?bar=0` hides this bar in screenshots
</script>

<template>
  <div v-if="bar" class="devbar app-chrome" role="group" aria-label="Dev harness">
    <span class="sm">dev · {{ scenario }}</span>
    <Button type="button" size="small" severity="secondary" @click="theme = theme === 'dark' ? 'light' : 'dark'">{{ theme }}</Button>
    <Button type="button" size="small" severity="secondary" @click="setLanguage(LOCALES[(LOCALES.indexOf(shown() as (typeof LOCALES)[number]) + 1) % LOCALES.length]!)">{{ shown() }}</Button>
  </div>
</template>

<style scoped>
.devbar { position: fixed; left: 8px; bottom: 8px; z-index: 90; display: flex; align-items: center; padding: 4px 8px; background: var(--oui-surface); border: 1px solid var(--oui-border); border-radius: var(--oui-radius-lg); opacity: 0.85; }
.devbar > * + * { margin-left: 8px; }
@media (max-width: 899px) { .devbar { bottom: 64px; } }
</style>
