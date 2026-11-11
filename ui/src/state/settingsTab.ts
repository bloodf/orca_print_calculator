// Which Settings tab is showing. Lives outside the view so links from the calculator can open the right tab.
import { ref } from "vue";

export const SETTINGS_TABS = ["spoolman", "costs", "pricing", "channels", "printers", "sheet", "language", "about"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
export const settingsTab = ref<SettingsTab>("spoolman");
/** "settings-printers" or "printers" -> that tab; anything else leaves the tab alone. */
export function openSettingsTab(anchor: string): void {
  const id = anchor.replace(/^settings-/, "");
  if ((SETTINGS_TABS as readonly string[]).includes(id)) settingsTab.value = id as SettingsTab;
}
