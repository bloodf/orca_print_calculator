// The "?" guide: which step is open (null = closed). Section "?" buttons open it at their own step.
import { ref } from "vue";

export const HELP_STEPS = ["plates", "filament", "machine", "labor", "extras", "shipping", "sales", "price", "quote"] as const;
export type HelpStep = (typeof HELP_STEPS)[number];
export const helpStep = ref<HelpStep | null>(null);
export const openHelp = (step: HelpStep = "plates"): void => { helpStep.value = step; };
export const closeHelp = (): void => { helpStep.value = null; };
