// "Refresh": read the slice again from the host, then Spoolman. One place, so the app bar and the plates panel share the busy state.
import { ref } from "vue";
import { call, errorCode } from "../../bridge";
import { t } from "../../i18n";
import { fetchSpoolman, setPlates, store } from "../../state/store";
import { toast } from "../../state/toast";

export const refreshing = ref(false);

export async function refresh(): Promise<void> {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    const s = await call("get_state", {});
    store.host = s.host ?? store.host;
    setPlates(s.plates ?? []);
    void fetchSpoolman(true);
  } catch (e) {
    toast({ text: t("host.cmdFailed", { action: t("plates.refresh") }), tone: "bad" });
    console.error("get_state", errorCode(e));
  } finally {
    refreshing.value = false;
  }
}
