// Dev harness entry: installs the fake host when the real window.orca is absent. `?state=`, `?theme=dark|light`, `?lang=en|pt|pt-BR`.
import { createMockHost } from "./host";
import { isScenario } from "./scenarios";

export function installDevHost(): void {
  const q = new URLSearchParams(window.location.search);
  const theme = q.get("theme") === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-orca-theme", theme);
  if (window.orca) return;
  const state = q.get("state");
  window.orca = createMockHost(isScenario(state) ? state : "ok");
}
