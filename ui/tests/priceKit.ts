// Test helpers for the price components: load a mock scenario straight into the store (no host round trip).
import { type App, type Component } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";
import { defaultSettings, mergeSettings, newDraft } from "../src/state/defaults";
import { setLocale } from "../src/i18n";
import { buildScenario, type ScenarioName } from "../src/mock/scenarios";
import { spoolman } from "../src/mock/fixtures";
import { openQuote } from "../src/state/quotes";
import { store } from "../src/state/store";
import type { Draft, Settings } from "../src/state/types";

export function load(name: ScenarioName, edit: { settings?: (s: Settings) => Settings; draft?: (d: Draft) => Draft } = {}): void {
  const { state } = buildScenario(name);
  store.status = "ready";
  store.host = state.host;
  store.settings = mergeSettings(state.settings, defaultSettings(null, "Direct"));
  if (edit.settings) store.settings = edit.settings(store.settings);
  store.plates = state.plates;
  store.quotes = state.quotes ?? [];
  store.spooler = state.spooler ?? null;
  store.spoolman = name === "noSpoolman" ? { state: "unset", data: { currency: null, filaments: [], spools: [] }, error: null } : { state: "ok", data: spoolman(), error: null };
  store.settings = { ...store.settings, currency: "BRL" };
  store.draft = newDraft(store.settings);
  if (name === "savedQuote" && store.quotes[0]) openQuote(store.quotes[0].id);
  if (edit.draft) store.draft = edit.draft(store.draft);
  store.view = "calc";
}

export function mount(c: Component, props: Record<string, unknown> = {}): { root: HTMLElement; app: App } {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const app = createApp(c, props);
  app.mount(root);
  return { root, app };
}

export const en = (): void => { setLocale("en"); };
export const txt = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
