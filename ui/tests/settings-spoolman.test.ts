import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SpoolmanSettings from "../src/components/settings/SpoolmanSettings.vue";
import { spoolmanErrorMessage, urlProblem } from "../src/components/settings/spoolmanError";
import { t } from "../src/i18n";
import { store } from "../src/state/store";
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
    expect(root.querySelector(".result")?.textContent).toContain("Connected. 3 spools, 2 filaments, currency BRL.");
  });

  test.each([
    ["bad_url", "That address isn't valid."], ["timeout", "Spoolman took too long to answer."], ["unreachable", "Can't reach Spoolman at that address."],
    ["bad_json", "That address answered, but it isn't Spoolman."], ["denied", "Access was not allowed in OrcaSlicer. Save the address again to get the prompt."],
    ["http_503", "Spoolman answered with error 503."], ["weird", "Spoolman failed: weird"],
  ])("error code %s maps to copy", async (code, text) => {
    const { root } = await runTest("http://10.0.0.1:7912", () => { throw new Error(code); });
    expect(root.querySelector(".result")?.textContent).toContain(text);
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
    expect(calls.filter((c) => c.cmd === "spoolman_fetch")).toHaveLength(0);
    expect(urlProblem("ftp://x")).toBe("scheme");
    expect(urlProblem("")).toBeNull();
  });

  test("saved URL is selectable text with a copy button, never a link", async () => {
    store.settings = { ...store.settings, spoolman: { url: "http://10.0.0.1:7912" } };
    installHost();
    const root = mountComponent(SpoolmanSettings);
    expect(root.querySelector(".cv-text")?.textContent).toBe("http://10.0.0.1:7912");
    expect(root.querySelector("a")).toBeNull();
    expect(root.querySelector("button[aria-label='Copy Spoolman address']")).not.toBeNull();
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
