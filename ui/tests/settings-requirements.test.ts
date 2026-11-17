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
  test("both missing: not set / not installed, with how to install", () => {
    store.spooler = null;
    installHost();
    const root = mountComponent(RequirementsSettings);
    expect(row(root, "spoolman").dataset.ok).toBe("false");
    expect(row(root, "spoolman").textContent).toContain(t("req.spoolman.unset"));
    expect(row(root, "spoolman").textContent).toContain(t("req.spoolman.how"));
    expect(row(root, "spooler").textContent).toContain(t("req.spooler.missing"));
    expect(row(root, "spooler").querySelector(".cv-text")?.textContent).toBe("https://cloud.orcaslicer.com/p/50c35dcbd6f3");
    expect(root.textContent).toContain(t("req.optional"));
  });

  test("detected from Spooler, then configured", () => {
    store.spooler = { url: "http://10.0.0.5:7912", presetToFilament: {} };
    installHost();
    const root = mountComponent(RequirementsSettings);
    expect(row(root, "spoolman").dataset.ok).toBe("true");
    expect(row(root, "spoolman").textContent).toContain(t("req.spoolman.detected", { url: "http://10.0.0.5:7912" }));
    expect(row(root, "spooler").textContent).toContain(t("req.spooler.found"));
    unmountComponent();
    store.settings = { ...store.settings, spoolman: { url: "http://s:7912" } };
    expect(row(mountComponent(RequirementsSettings), "spoolman").textContent).toContain(t("req.spoolman.configured", { url: "http://s:7912" }));
  });

  test("Check again re-reads Spooler on the host; no Spoolman probe without an address", async () => {
    store.spooler = null;
    const calls = installHost({ check_requirements: () => ({ spooler: { url: "http://10.0.0.9:7912", presetToFilament: {} } }) });
    const root = mountComponent(RequirementsSettings);
    byText(root, "button", t("req.checkAgain"))!.click();
    await flush();
    expect(calls.map((c) => c.cmd)).toEqual(["check_requirements"]);
    expect((store.spooler as { url: string } | null)?.url).toBe("http://10.0.0.9:7912");
    expect(row(root, "spooler").textContent).toContain(t("req.spooler.found"));
  });

  test("Test connection is disabled with a reason when no Spoolman address is set", async () => {
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
