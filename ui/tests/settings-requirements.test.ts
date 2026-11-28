import { afterEach, beforeEach, describe, expect, test } from "vitest";
import RequirementsSettings from "../src/components/settings/RequirementsSettings.vue";
import SpoolmanSettings from "../src/components/settings/SpoolmanSettings.vue";
import { t } from "../src/i18n";
import { store } from "../src/state/store";
import { byText, flush, installHost, lastToast, mountComponent, resetStore, unmountComponent } from "./settings-helpers";

beforeEach(() => { resetStore(); });
afterEach(() => { unmountComponent(); });

const row = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`[data-req='${id}']`)!;

const LEAKS = /presence\.json|spooler\.log|spooler_settings\.json|profiles\.json|Application Support|AppData|cloud\.orcaslicer\.com|50c35dcbd6f3|github\.com/;

describe("Settings › Connections", () => {
  test("neither is set up: both rows are neutral, say how to get them, and print no file name, folder or address", () => {
    store.spooler = null;
    store.spoolerLooked = ["/example/user/Library/Application Support/OrcaSlicer/spooler"];
    installHost();
    const root = mountComponent(RequirementsSettings);
    expect(root.querySelectorAll(".oui-req")).toHaveLength(2);
    // optional and absent is not a warning: the neutral chip, never the amber one
    for (const id of ["spoolman", "spooler"]) {
      expect(row(root, id).dataset.status, id).toBe("unknown");
      expect(row(root, id).querySelector(".oui-status")?.textContent, id).toBe(t("req.notConnected"));
    }
    expect(root.textContent).toContain(t("req.spoolman.how"));
    expect(root.textContent).toContain(t("req.spooler.how"));
    expect(row(root, "spooler").textContent).toContain("Spooler was not found. If it is installed, open its tab once, then check again.");
    expect(root.textContent).not.toMatch(LEAKS);
    expect(root.innerHTML).not.toMatch(LEAKS); // not in an attribute either: nothing on the page leads out of it
    expect(root.querySelector("a")).toBeNull();
    expect(root.textContent).not.toContain("Optional ·");
  });

  test("the links are named for where they lead and copy the address, which a click would otherwise load over the plugin", async () => {
    store.spooler = null;
    installHost();
    const copied: string[] = [];
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (x: string) => { copied.push(x); return Promise.resolve(); } } });
    const root = mountComponent(RequirementsSettings);
    const spooler = root.querySelector<HTMLElement>("[data-req-link=spooler]")!;
    expect(spooler.textContent?.trim()).toBe("Copy link to Spooler on Orca Cloud");
    expect(root.querySelector("[data-req-link=spoolman]")?.textContent?.trim()).toBe("Copy link to Spoolman on GitHub");
    spooler.click();
    await flush();
    root.querySelector<HTMLElement>("[data-req-link=spoolman]")!.click();
    await flush();
    expect(copied).toEqual(["https://cloud.orcaslicer.com/p/50c35dcbd6f3", "https://github.com/Donkie/Spoolman"]);
    expect(lastToast()?.title).toBe("Link copied. Paste it into your browser.");
  });

  test("Spooler knows a Spoolman address but none is saved: Spooler is connected, Spoolman is not yet, and the form below offers the address", () => {
    store.spooler = { url: "http://10.0.0.5:7912", presetToFilament: {} };
    installHost();
    const root = mountComponent(RequirementsSettings);
    expect(row(root, "spooler").dataset.status).toBe("found");
    expect(row(root, "spooler").querySelector(".oui-status")?.textContent).toBe(t("req.connected"));
    expect(row(root, "spoolman").dataset.status).toBe("unknown");
    expect(root.querySelector("[data-req-how=spoolman]")).toBeNull(); // nothing to install: the address is one click away
    expect(root.querySelector("[data-req-how=spooler]")).toBeNull();
  });

  test("a saved address: connected with the spool count, or the one warning when it does not answer; the address is not repeated", () => {
    store.settings = { ...store.settings, spoolman: { url: "http://10.0.0.1:7912" } };
    store.spoolman = { state: "ok", error: null, data: { currency: "EUR", filaments: [], spools: [{}, {}] as never } };
    installHost();
    let r = row(mountComponent(RequirementsSettings), "spoolman");
    expect(r.dataset.status).toBe("found");
    expect(r.querySelector(".oui-status")?.textContent).toBe("Connected");
    expect(r.textContent).toContain("2 spools");
    expect(r.textContent).not.toContain("10.0.0.1");
    unmountComponent();
    store.spoolman = { ...store.spoolman, state: "offline", error: "timeout" };
    r = row(mountComponent(RequirementsSettings), "spoolman");
    expect(r.dataset.status).toBe("missing"); // set up and not answering: this one needs doing something about
    expect(r.textContent).toContain(t("req.notFound"));
    expect(r.textContent).toContain("Spoolman took too long to answer.");
    expect(r.textContent).not.toContain("10.0.0.1");
  });

  test("one Check again for the list re-reads Spooler on the host and reconnects a saved Spoolman", async () => {
    store.spooler = null;
    store.settings = { ...store.settings, spoolman: { url: "http://10.0.0.1:7912" } };
    store.spoolman = { ...store.spoolman, state: "offline", error: "timeout" };
    const calls = installHost({
      check_requirements: () => ({ spooler: { url: "http://10.0.0.9:7912", presetToFilament: {} } }),
      spoolman_fetch: () => ({ currency: "EUR", filaments: [], spools: [{}, {}] }),
    });
    const root = mountComponent(RequirementsSettings);
    expect(root.querySelectorAll("[data-req-check]")).toHaveLength(1);
    root.querySelector<HTMLElement>("[data-req-check]")!.click();
    await flush();
    await flush(); // the Spooler re-read, then the Spoolman reconnect
    expect(calls.map((c) => c.cmd)).toEqual(["check_requirements", "spoolman_fetch"]);
    expect(row(root, "spooler").dataset.status).toBe("found");
    expect(row(root, "spoolman").dataset.status).toBe("found");
    expect(row(root, "spoolman").textContent).toContain("2 spools");
  });

  test("Spooler not found: before OrcaSlicer names its data folder the row says to wait; after, that it was not found (the folder stays off the page)", async () => {
    store.spooler = null;
    installHost({ check_requirements: () => ({ spooler: null, spoolerLooked: ["C:\\Users\\me\\AppData\\Roaming\\OrcaSlicer\\spooler"] }) });
    const root = mountComponent(RequirementsSettings);
    expect(row(root, "spooler").textContent).toContain(t("req.spooler.noFolder"));
    root.querySelector<HTMLElement>("[data-req-check]")!.click();
    await flush();
    expect(store.spoolerLooked).toHaveLength(1);
    expect(row(root, "spooler").textContent).toContain(t("req.spooler.notFound"));
    expect(root.textContent).not.toMatch(LEAKS);
  });

  test("Check again without a saved address sends no Spoolman request", async () => {
    store.spooler = null;
    const calls = installHost({ check_requirements: () => ({ spooler: null }) });
    const root = mountComponent(RequirementsSettings);
    root.querySelector<HTMLElement>("[data-req-check]")!.click();
    await flush();
    expect(calls.map((c) => c.cmd)).toEqual(["check_requirements"]);
  });

  test("the rows head the Connections page, above the address", () => {
    installHost();
    const root = mountComponent(SpoolmanSettings);
    const reqs = root.querySelector("[data-reqs]")!;
    const input = root.querySelector("#settings-spoolman-url")!;
    expect(reqs.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
