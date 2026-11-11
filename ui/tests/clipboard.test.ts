import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp, h, nextTick } from "vue";
import CopyValue from "../src/components/settings/CopyValue.vue";
import { setLocale } from "../src/i18n";

const failClipboard = () => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } });
  document.execCommand = vi.fn(() => false);
};
const okClipboard = (spy: (t: string) => void) => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (t: string) => { spy(t); return Promise.resolve(); } } });
const flush = async () => { for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve(); } };
let root: HTMLElement;
beforeEach(() => { setLocale("en"); root = document.createElement("div"); document.body.appendChild(root); });
afterEach(() => root.remove());
const mountCv = async () => { createApp({ render: () => h(CopyValue, { value: "http://x:1", label: "URL" }) }).mount(root); await flush(); };

describe("CopyValue", () => {
  test("shows Copied only when the copy worked", async () => {
    const spy = vi.fn();
    okClipboard(spy);
    await mountCv();
    root.querySelector("button")!.click();
    await flush();
    expect(spy).toHaveBeenCalledWith("http://x:1");
    expect(root.querySelector("[role=status]")!.textContent).toContain("Copied");
  });
  test("a failed copy never says Copied", async () => {
    failClipboard();
    await mountCv();
    root.querySelector("button")!.click();
    await flush();
    expect(root.querySelector("[role=status]")!.textContent).not.toContain("Copied");
    expect(root.querySelector("[role=status]")!.textContent?.trim()).not.toBe("");
  });
});
