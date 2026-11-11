// Spoolman address editing shared by Settings and the first-run checklist: validate, save, refetch.
import { computed, ref, watch } from "vue";
import { t } from "../../i18n";
import { fetchSpoolman, patchSettings, store } from "../../state/store";
import { urlProblem } from "./spoolmanError";

export function useSpoolmanUrl() {
  const url = ref(store.settings.spoolman.url);
  const touched = ref(false);
  watch(() => store.settings.spoolman.url, (v) => { url.value = v; });
  const problem = computed(() => urlProblem(url.value));
  const error = computed(() => (touched.value && problem.value ? t(`spoolman.error.${problem.value}`) : ""));

  /** Saves a valid address (or an empty one) and asks the store to fetch. Returns whether it was saved. */
  function commit(): boolean {
    touched.value = true;
    if (problem.value) return false;
    const next = url.value.trim();
    url.value = next;
    if (next !== store.settings.spoolman.url) {
      patchSettings({ spoolman: { url: next } });
      void fetchSpoolman(true);
    }
    return true;
  }
  const use = (next: string): boolean => { url.value = next; return commit(); };
  return { url, touched, problem, error, commit, use };
}

export const EXAMPLE_URL = "http://192.168.1.10:7912";
