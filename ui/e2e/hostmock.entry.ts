// Bundled to an IIFE and injected before the PRODUCTION artifact loads: stands in for the Orca host (window.orca) with the same
// mock the dev harness uses, so the shipped single file runs with its real CSP and its real bridge code.
import { createMockHost } from "../src/mock/host";
import { isScenario } from "../src/mock/scenarios";

(window as unknown as { __opcInstall: (name: string) => void }).__opcInstall = (name) => {
  window.orca = createMockHost(isScenario(name) ? name : "ok");
};
