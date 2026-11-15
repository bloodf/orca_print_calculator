import { createOrcaApp, syncHostTheme } from "./orcaUi";
import App from "./App.vue";
import "./app.css";

async function boot(): Promise<void> {
  // Dev harness only: fake host, ?state= / ?theme= / ?lang=. Tree-shaken out of production builds.
  if (import.meta.env.DEV) (await import("./mock/install")).installDevHost();
  syncHostTheme();
  createOrcaApp(App).mount("#app");
}
void boot();
