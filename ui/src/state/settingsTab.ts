// Which Settings tab is showing. Lives outside the view so links from the calculator can open the right tab.
import { ref } from "vue";

export const SETTINGS_TABS = ["spoolman", "costs", "pricing", "channels", "printers", "sheet", "general"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
export const settingsTab = ref<SettingsTab>("spoolman");
/** A link asked for `settingsTab` and Settings has not opened it yet. A plain visit to Settings shows the page last used. */
export const settingsLinked = ref(false);
/** "settings-printers" or "printers" -> that tab; anything else leaves the tab alone. */
export function openSettingsTab(anchor: string): void {
  // "language" and "about" were pages of their own before they became General: links to them still land
  const id = anchor.replace(/^settings-/, "").replace(/^(language|about)$/, "general");
  if (!(SETTINGS_TABS as readonly string[]).includes(id)) return;
  settingsTab.value = id as SettingsTab;
  settingsLinked.value = true;
}
