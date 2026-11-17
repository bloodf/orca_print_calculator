import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SpoolmanSettings from "../src/components/settings/SpoolmanSettings.vue";
import { spoolmanErrorMessage, urlProblem } from "../src/components/settings/spoolmanError";
import { t } from "../src/i18n";
import { store } from "../src/state/store";
import { toastList } from "../shared/src/components/toast";
import { byText, flush, installHost, mountComponent, resetStore, type, unmountComponent } from "./settings-helpers";

beforeEach(() => { resetStore(); });
afterEach(() => { unmountComponent(); vi.useRealTimers(); });

async function runTest(url: string, handler: () => unknown) {
  const calls = installHost({ spoolman_fetch: handler });
  const root = mountComponent(SpoolmanSettings);
  type(root.querySelector("input")!, url);
  byText(root, "button", t("spoolman.test"))!.click();
  await flush();
  return { root, calls };
}

describe("Spoolman test connection", () => {
  test("success shows spools, filaments and currency", async () => {
    const { root, calls } = await runTest("http://10.0.0.1:7912", () => ({ currency: "BRL", filaments: [{}, {}], spools: [{}, {}, {}] }));
    expect(calls.filter((c) => c.cmd === "spoolman_fetch")[0]?.args).toEqual({ url: "http://10.0.0.1:7912" });
    expect(root.querySelector(".result")).toBeNull(); // the result is a toast now, not a notice that stays
    expect(toastList.list.map((x) => [x.tone, x.title])).toEqual([["success", "Connected. 3 spools, 2 filaments, currency BRL."]]);
  });

  test.each([
    ["bad_url", "That address isn't valid."], ["timeout", "Spoolman took too long to answer."], ["unreachable", "Can't reach Spoolman at that address."],
    ["bad_json", "That address answered, but it isn't Spoolman."], ["denied", "Access was not allowed in OrcaSlicer. Save the address again to get the prompt."],
    ["http_503", "Spoolman answered with error 503."], ["weird", "Spoolman failed: weird"],
  ])("error code %s maps to copy", async (code, text) => {
    await runTest("http://10.0.0.1:7912", () => { throw new Error(code); });
    expect(toastList.list.map((x) => [x.tone, x.title])).toEqual([["error", text]]);
    expect(spoolmanErrorMessage(code)).toBe(text);
  });

  test("scheme is validated locally and no request is sent", async () => {
    const calls = installHost();
    const root = mountComponent(SpoolmanSettings);
    type(root.querySelector("input")!, "192.168.1.5:7912");
    root.querySelector("input")!.dispatchEvent(new Event("change", { bubbles: true }));
    byText(root, "button", t("spoolman.test"))!.click();
    await flush();
    expect(root.textContent).toContain("Start the address with http:// or https://.");
    // A plain alert line under the field, as in the first-run checklist (PrimeVue Message cost 15 kB of the page for this one line).
    const err = root.querySelector("#settings-spoolman-err")!;
    expect(err.tagName).toBe("P");
    expect(err.getAttribute("role")).toBe("alert");
    expect(calls.filter((c) => c.cmd === "spoolman_fetch")).toHaveLength(0);
    expect(urlProblem("ftp://x")).toBe("scheme");
    expect(urlProblem("")).toBeNull();
  });

  test("saved URL is selectable text with a copy button, never a link", async () => {
    store.settings = { ...store.settings, spoolman: { url: "http://10.0.0.1:7912" } };
    installHost();
    const root = mountComponent(SpoolmanSettings);
    expect(root.querySelector(".cv-text")?.textContent).toBe("http://10.0.0.1:7912");
    expect(root.querySelector('a[href*="10.0.0.1"]')).toBeNull();
    expect(root.querySelector("button[aria-label='Copy Spoolman address']")).not.toBeNull();
  });

  test("the Spoolman requirement row shows its status and Check again reconnects", async () => {
    store.settings = { ...store.settings, spoolman: { url: "http://10.0.0.1:7912" } };
    store.spoolman = { ...store.spoolman, state: "offline", error: "timeout" };
    const calls = installHost({ spoolman_fetch: () => ({ currency: "EUR", filaments: [], spools: [{}, {}] }) });
    const root = mountComponent(SpoolmanSettings);
    const row = root.querySelector<HTMLElement>("[data-requirement=spoolman]")!;
    expect(row.dataset.status).toBe("missing");
    expect(row.textContent).toContain("Not reachable");
    expect(row.textContent).toContain("http://10.0.0.1:7912 · Spoolman took too long to answer.");
    expect(row.querySelector<HTMLAnchorElement>(".oui-req-link")?.href).toBe("https://github.com/Donkie/Spoolman");
    byText(row, "button", "Check again")!.click();
    await flush();
    expect(calls.filter((c) => c.cmd === "spoolman_fetch").map((c) => c.args)).toEqual([{ url: "http://10.0.0.1:7912" }]);
    expect(row.dataset.status).toBe("found");
    expect(row.textContent).toContain("Found");
    expect(row.textContent).toContain("http://10.0.0.1:7912 · Spoolman · 2 spools");
    expect(row.querySelector(".oui-req-link")).toBeNull();
  });

  test("never set up: the requirement says so and links to Spoolman", () => {
    installHost();
    const root = mountComponent(SpoolmanSettings);
    const row = root.querySelector<HTMLElement>("[data-requirement=spoolman]")!;
    expect(row.dataset.status).toBe("missing");
    expect(row.textContent).toContain("Not set up");
    expect(row.textContent).toContain("Run Spoolman on this computer");
  });

  test("detected Spooler address is offered and applied", async () => {
    const calls = installHost({ spoolman_fetch: () => ({ currency: "USD", filaments: [], spools: [] }) });
    store.spooler = { url: "http://192.168.1.10:7912", presetToFilament: {} };
    const root = mountComponent(SpoolmanSettings);
    expect(root.textContent).toContain("Spooler uses http://192.168.1.10:7912.");
    byText(root, "button", t("spoolman.useIt"))!.click();
    await flush();
    expect(store.settings.spoolman.url).toBe("http://192.168.1.10:7912");
    expect(calls.some((c) => c.cmd === "spoolman_fetch")).toBe(true);
  });
});
