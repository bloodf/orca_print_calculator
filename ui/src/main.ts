import { createOrcaApp, syncHostTheme } from "./orcaUi";
import App from "./App.vue";
import "./theme.css";

async function boot(): Promise<void> {
  // Dev harness only: fake host, ?state= / ?theme= / ?lang=, and ?kit=1 primitives gallery. Tree-shaken out of production builds.
  if (import.meta.env.DEV) {
    (await import("./mock/install")).installDevHost();
    if (new URLSearchParams(window.location.search).has("kit")) {
      createOrcaApp((await import("./mock/Kit.vue")).default).mount("#app");
      return;
    }
  }
  syncHostTheme();
  createOrcaApp(App).mount("#app");
}
void boot();
