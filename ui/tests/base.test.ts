import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { defineComponent, h, nextTick, ref, type App } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";
import { OuiBanner, OuiEmpty, OuiToastHost } from "../shared/src/components";
import * as SHARED_ICONS from "../shared/src/icons";
import Popover from "../src/components/base/Popover.vue";
import Section from "../src/components/base/Section.vue";
import Segmented from "../src/components/base/Segmented.vue";
import { setLocale } from "../src/i18n";
import { useToastFocusReturn } from "../src/state/toastFocus";
import { clearToasts, showToast, toastList as toasts } from "../shared/src/components/toast";

let app: App | null = null;
let root: HTMLElement;
beforeEach(() => { root = document.createElement("div"); document.body.appendChild(root); setLocale("en"); clearToasts(); });
afterEach(() => { app?.unmount(); app = null; root.remove(); });
const mount = (render: () => unknown) => { app = createApp({ render: render as never }); app.mount(root); };

describe("icons", () => {
  test("every icon the page names comes from the shared set (no local icon files)", () => {
    const SOURCES = import.meta.glob("../src/**/*.{ts,vue}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const used = new Set(Object.values(SOURCES).flatMap((text) => [...text.matchAll(/\bI\.([a-zA-Z0-9]+)\b/g)].map((m) => m[1]!)));
    expect(used.size).toBeGreaterThan(20);
    expect([...used].filter((n) => !(n in SHARED_ICONS))).toEqual([]);
    expect(Object.keys(SOURCES).some((f) => f.endsWith("icons.ts") || f.endsWith("Icon.vue"))).toBe(false);
  });
  test("rendered svg is decorative", () => {
    mount(() => h(Section, { id: "s", title: "T", open: false }));
    expect(root.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Section", () => {
  test("header is a button with aria-expanded/controls; click emits update:open", async () => {
    const open = ref(false);
    mount(() => h(Section, { id: "machine", title: "Machine", summary: "Energy $1", open: open.value, "onUpdate:open": (v: boolean) => (open.value = v) }, () => h("p", { id: "body" }, "x")));
    const btn = root.querySelector("button")!;
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.getAttribute("aria-controls")).toBe("machine-body");
    expect(root.querySelector("#body")).toBeNull();
    btn.click(); await nextTick();
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelector("#machine-body #body")).not.toBeNull();
    expect(root.textContent).toContain("Energy $1");
  });
  test("invalid forces open and shows the error icon; overridden adds sr text", () => {
    mount(() => h(Section, { id: "s", title: "T", open: false, invalid: true, overridden: true }, () => "body"));
    expect(root.querySelector("button")!.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelector(".oui-sr")?.textContent).toBe("Edited");
  });
});

describe("Segmented", () => {
  test("radiogroup with roving tabindex and arrow/Home/End keys", async () => {
    const v = ref("a");
    mount(() => h(Segmented, { label: "View", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }, { value: "c", label: "C" }], modelValue: v.value, "onUpdate:modelValue": (x: string) => (v.value = x) }));
    const radios = Array.from(root.querySelectorAll<HTMLElement>("[role=radio]"));
    expect(root.querySelector("[role=radiogroup]")?.getAttribute("aria-label")).toBe("View");
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    const key = async (k: string) => { radios.find((r) => r.tabIndex === 0)!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); await nextTick(); };
    await key("ArrowRight"); expect(v.value).toBe("b");
    await key("End"); expect(v.value).toBe("c");
    await key("ArrowRight"); expect(v.value).toBe("a");
    await key("ArrowLeft"); expect(v.value).toBe("c");
    await key("Home"); expect(v.value).toBe("a");
  });
});

describe("banners and empty states as the page uses them", () => {
  test("alert roles and actions", () => {
    const run = vi.fn();
    mount(() => h("div", [h(OuiBanner, { tone: "error", title: "boom" }, { actions: () => h("button", { onClick: run }, "Retry") }), h(OuiBanner, { tone: "warn", title: "careful" })]));
    const [bad, warn] = Array.from(root.querySelectorAll(".oui-banner"));
    expect(bad?.getAttribute("role")).toBe("alert");
    expect(warn?.getAttribute("role")).toBe("status");
    (root.querySelector(".oui-banner-actions button") as HTMLButtonElement).click();
    expect(run).toHaveBeenCalled();
  });
  test("empty state shows the illustration as decoration, never as English text", () => {
    mount(() => h(OuiEmpty, { image: "data:image/webp;base64,AA==", title: "Slice to see a price", text: "b" }));
    const img = root.querySelector("img")!;
    expect(img).not.toBeNull();
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-label")).toBeNull();
    expect(root.textContent).toContain("Slice to see a price");
  });
});

describe("toasts", () => {
  test("Undo keeps focus for 20 seconds and returns it after dismissal", async () => {
    vi.useFakeTimers();
    try {
      mount(() => h(defineComponent({ setup() { useToastFocusReturn(); return () => h("main", { tabindex: -1 }, [h("button", { id: "source" }, "Source"), h(OuiToastHost)]); } })));
      const source = root.querySelector<HTMLButtonElement>("#source")!;
      source.focus();
      const run = vi.fn();
      showToast({ title: "Deleted", action: { label: "Undo", run } });
      await nextTick();
      const undo = [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Undo")!;
      undo.focus();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(toasts.list).toHaveLength(1);
      expect(document.activeElement).toBe(undo);
      undo.click(); await nextTick(); await nextTick();
      expect(run).toHaveBeenCalledOnce();
      expect(toasts.list).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1000); await nextTick();
      expect(root.querySelectorAll(".oui-toast")).toHaveLength(0);
      expect(document.activeElement).toBe(source);
    } finally { app?.unmount(); app = null; await vi.runAllTimersAsync(); vi.useRealTimers(); }
  });
  test("hover pauses expiry, leaving resumes it, and clearing also removes paused timers", async () => {
    vi.useFakeTimers();
    try {
      mount(() => h(OuiToastHost));
      showToast({ title: "Hover", timeout: 100 }); await nextTick();
      const message = root.querySelector<HTMLElement>("[data-toast-id]")!;
      message.dispatchEvent(new MouseEvent("mouseenter"));
      await vi.advanceTimersByTimeAsync(500);
      expect(toasts.list).toHaveLength(1);
      message.dispatchEvent(new MouseEvent("mouseleave"));
      await vi.advanceTimersByTimeAsync(1001); // a resumed toast gets at least 1 s
      expect(toasts.list).toHaveLength(0);
      showToast({ title: "Paused", timeout: 100 }); await nextTick();
      root.querySelector<HTMLElement>("[data-toast-id]")!.dispatchEvent(new MouseEvent("mouseenter"));
      clearToasts(); await vi.advanceTimersByTimeAsync(500);
      expect(toasts.list).toHaveLength(0);
    } finally { app?.unmount(); app = null; await vi.runAllTimersAsync(); vi.useRealTimers(); }
  });
  test("stack is at most 4, newest last; errors stay; info leaves after 5 s, warnings after 8 s", () => {
    vi.useFakeTimers();
    const ids = ["1", "2", "3", "4", "5"].map((n) => showToast({ title: n, tone: n === "3" ? "error" : n === "4" ? "warn" : "info" }));
    expect(toasts.list.map((x) => x.title)).toEqual(["2", "3", "4", "5"]);
    vi.advanceTimersByTime(5001);
    expect(toasts.list.map((x) => x.title)).toEqual(["3", "4"]);
    vi.advanceTimersByTime(3000);
    expect(toasts.list.map((x) => x.title)).toEqual(["3"]);
    expect(ids).toHaveLength(5);
    vi.useRealTimers();
  });
  test("the host renders roles, an undo button and a close button on every toast", async () => {
    vi.useFakeTimers();
    const run = vi.fn();
    mount(() => h(OuiToastHost, { closeLabel: "Close" }));
    showToast({ title: "Deleted", action: { label: "Undo", run } });
    showToast({ title: "Failed", tone: "error" });
    await nextTick();
    expect(root.querySelector("[role=status]")?.textContent).toContain("Deleted");
    expect(root.querySelector("[role=alert]")?.textContent).toContain("Failed");
    expect(root.querySelectorAll('.oui-toast [aria-label="Close"]')).toHaveLength(2);
    vi.advanceTimersByTime(4900);
    expect(toasts.list.map((x) => x.title)).toContain("Deleted");
    vi.advanceTimersByTime(200);
    expect(toasts.list.map((x) => x.title)).toEqual(["Failed"]);
    vi.useRealTimers();
  });
});

const settle = async (): Promise<void> => { for (let i = 0; i < 6; i++) { await nextTick(); await new Promise((r) => setTimeout(r, 50)); } };

describe("Popover (PrimeVue overlay behind the anchor/open API)", () => {
  test("focuses first field, closes on Escape and outside click, returns focus to the anchor", async () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    anchor.focus();
    const open = ref(true);
    const Host = defineComponent({ render: () => h(Popover, { open: open.value, anchor, label: "Power", onClose: () => (open.value = false) }, () => h("input", { id: "first" })) });
    mount(() => h(Host));
    await settle();
    expect(document.activeElement?.id).toBe("first");
    expect(document.querySelector("[role=dialog]")?.getAttribute("aria-label")).toBe("Power");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    await settle();
    expect(open.value).toBe(false);
    expect(document.activeElement).toBe(anchor);
    await vi.waitFor(() => expect(document.querySelector("[role=dialog]")).toBeNull(), { timeout: 3000 });
    open.value = true; await settle();
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
    document.body.click(); // outside click
    await settle();
    expect(open.value).toBe(false);
    anchor.remove();
  });
});
