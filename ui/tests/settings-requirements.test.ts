import { afterEach, beforeEach, describe, expect, test } from "vitest";
import RequirementsSettings from "../src/components/settings/RequirementsSettings.vue";
import SpoolmanSettings from "../src/components/settings/SpoolmanSettings.vue";
import { t } from "../src/i18n";
import { store } from "../src/state/store";
import { byText, flush, installHost, mountComponent, resetStore, unmountComponent } from "./settings-helpers";

beforeEach(() => { resetStore(); });
afterEach(() => { unmountComponent(); });

const row = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`[data-req='${id}']`)!;

describe("Settings › Requirements", () => {
  test("both missing: not set up / not installed, optional, with how to install", () => {
    store.spooler = null;
    installHost();
    const root = mountComponent(RequirementsSettings);
    expect(root.querySelectorAll(".oui-req")).toHaveLength(2);
    expect(row(root, "spoolman").dataset.status).toBe("missing");
    expect(row(root, "spoolman").textContent).toContain(t("req.notSet"));
    expect(row(root, "spoolman").textContent).toContain(t("req.spoolman.how"));
    expect(row(root, "spoolman").querySelector<HTMLAnchorElement>(".oui-req-link")?.href).toBe("https://github.com/Donkie/Spoolman");
    expect(row(root, "spooler").textContent).toContain(t("req.notInstalled"));
    expect(row(root, "spooler").querySelector<HTMLAnchorElement>(".oui-req-link")?.href).toBe("https://cloud.orcaslicer.com/p/50c35dcbd6f3");
    expect(row(root, "spooler").textContent).toContain(t("req.optional"));
  });

  test("detected from Spooler, then a saved address shows the connection", () => {
    store.spooler = { url: "http://10.0.0.5:7912", presetToFilament: {} };
    installHost();
    const root = mountComponent(RequirementsSettings);
    expect(row(root, "spoolman").dataset.status).toBe("found");
    expect(row(root, "spoolman").textContent).toContain(t("req.spoolman.detected", { url: "http://10.0.0.5:7912" }));
    expect(row(root, "spooler").textContent).toContain(t("req.detected"));
    unmountComponent();
    store.settings = { ...store.settings, spoolman: { url: "http://10.0.0.1:7912" } };
    store.spoolman = { ...store.spoolman, state: "offline", error: "timeout" };
    const r = row(mountComponent(RequirementsSettings), "spoolman");
    expect(r.dataset.status).toBe("missing");
    expect(r.textContent).toContain(t("req.notFound"));
    expect(r.textContent).toContain("http://10.0.0.1:7912 · Spoolman took too long to answer.");
  });

  test("Check again re-reads Spooler on the host and reconnects a saved Spoolman", async () => {
    store.spooler = null;
    store.settings = { ...store.settings, spoolman: { url: "http://10.0.0.1:7912" } };
    store.spoolman = { ...store.spoolman, state: "offline", error: "timeout" };
    const calls = installHost({
      check_requirements: () => ({ spooler: { url: "http://10.0.0.9:7912", presetToFilament: {} } }),
      spoolman_fetch: () => ({ currency: "EUR", filaments: [], spools: [{}, {}] }),
    });
    const root = mountComponent(RequirementsSettings);
    byText(row(root, "spooler"), "button", t("req.checkAgain"))!.click();
    await flush();
    await flush(); // the Spooler re-read, then the Spoolman reconnect
    expect(calls.map((c) => c.cmd)).toEqual(["check_requirements", "spoolman_fetch"]);
    expect(row(root, "spooler").textContent).toContain(t("req.detected"));
    expect(row(root, "spoolman").dataset.status).toBe("found");
    expect(row(root, "spoolman").textContent).toContain("http://10.0.0.1:7912 · Spoolman · 2 spools");
  });

  test("not found: says where it looked, and the folder follows Check again", async () => {
    store.spooler = null;
    installHost({ check_requirements: () => ({ spooler: null, spoolerLooked: ["C:\\Users\\me\\AppData\\Roaming\\OrcaSlicer\\spooler"] }) });
    const root = mountComponent(RequirementsSettings);
    expect(row(root, "spooler").textContent).toContain(t("req.spooler.noFolder"));
    byText(row(root, "spooler"), "button", t("req.checkAgain"))!.click();
    await flush();
    expect(row(root, "spooler").dataset.status).toBe("missing");
    expect(row(root, "spooler").textContent).toContain(t("req.spooler.looked", { folder: "C:\\Users\\me\\AppData\\Roaming\\OrcaSlicer\\spooler" }));
  });

  test("Check again without a saved address sends no Spoolman request", async () => {
    store.spooler = null;
    const calls = installHost({ check_requirements: () => ({ spooler: null }) });
    const root = mountComponent(RequirementsSettings);
    byText(row(root, "spoolman"), "button", t("req.checkAgain"))!.click();
    await flush();
    expect(calls.map((c) => c.cmd)).toEqual(["check_requirements"]);
  });

  test("Test connection is off with a reason when no Spoolman address is set or detected", async () => {
    const calls = installHost();
    const root = mountComponent(SpoolmanSettings);
    const btn = byText(root, "button", t("spoolman.test"))!;
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    expect(root.querySelector("[data-test-off]")?.textContent).toBe(t("spoolman.testOff"));
    btn.click();
    await flush();
    expect(calls.filter((c) => c.cmd === "spoolman_fetch")).toHaveLength(0);
  });

  test("no reason shown when Spooler offers an address", () => {
    store.spooler = { url: "http://10.0.0.5:7912", presetToFilament: {} };
    installHost();
    expect(mountComponent(SpoolmanSettings).querySelector("[data-test-off]")).toBeNull();
  });
});
