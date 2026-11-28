import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SpoolmanSettings from "../src/components/settings/SpoolmanSettings.vue";
import { spoolmanErrorMessage, urlProblem } from "../src/components/settings/spoolmanError";
import { t } from "../src/i18n";
import { store } from "../src/state/store";
import { toastList } from "@orca-plugins/ui-foundation/src/components/toast";
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

  test("the saved address is in its field once, never repeated as a chip or a link; the permission note shows only while the address is being changed", async () => {
    store.settings = { ...store.settings, spoolman: { url: "http://10.0.0.1:7912" } };
    installHost();
    const root = mountComponent(SpoolmanSettings);
    const input = root.querySelector<HTMLInputElement>("#settings-spoolman-url")!;
    expect(input.value).toBe("http://10.0.0.1:7912");
    expect(root.querySelector(".cv-text")).toBeNull();
    expect(root.querySelector('a[href*="10.0.0.1"]')).toBeNull();
    expect(root.textContent!.split("http://10.0.0.1:7912")).toHaveLength(1); // not printed anywhere else on the page
    expect(root.querySelector("[data-save-hint]")).toBeNull();
    expect(input.hasAttribute("aria-describedby")).toBe(false);
    input.value = "http://10.0.0.2:7912";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    expect(root.querySelector("[data-save-hint]")?.textContent).toBe(t("spoolman.saveHint"));
    expect(input.getAttribute("aria-describedby")).toBe("settings-spoolman-hint");
  });
  test("the refresh interval explains itself in one line, not in the scheduler's design notes", () => {
    installHost();
    const root = mountComponent(SpoolmanSettings);
    const help = root.querySelector("#settings-spoolman-every-hint")!.textContent!;
    expect(help).toBe("How often stock and prices are re-read while this tab is open.");
    expect(root.textContent).not.toMatch(/5 minutes|Paused while hidden|picker or dialog/);
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
