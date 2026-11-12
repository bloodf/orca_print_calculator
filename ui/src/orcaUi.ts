// Vue + PrimeVue bootstrap shared by main.ts, the dev harness and the tests: one place installs the shared Orca preset,
// keeps the PrimeVue locale in step with the plugin language, and mirrors the host theme onto the shared palette tokens.
import { createApp as createVueApp, type App, type Component } from "vue";
import { applyOrcaTheme, installOrcaUI, primeVueOptions, type OrcaLocale } from "../shared/src";
import { currentLocale } from "./i18n";

export function createOrcaApp(root: Component, props?: Record<string, unknown> | null): App {
  const app = createVueApp(root, props);
  installOrcaUI(app, currentLocale());
  if (typeof document !== "undefined") document.body.classList.add("orca-ui");
  return app;
}

/** PrimeVue's own strings (dialog close, table labels, ...) for the plugin's current language. `undefined` keeps the built-in English. */
export const primeLocale = (locale: OrcaLocale) => primeVueOptions(locale).locale;

const hostTheme = (): "light" | "dark" => (document.documentElement.getAttribute("data-orca-theme") === "dark" ? "dark" : "light");

/** The host marks `<html data-orca-theme>`; the shared palette follows it (also for teleported dialogs). Returns a stop function. */
export function syncHostTheme(): () => void {
  applyOrcaTheme(hostTheme());
  const mo = new MutationObserver(() => applyOrcaTheme(hostTheme()));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-orca-theme"] });
  return () => mo.disconnect();
}
