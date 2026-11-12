import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { defineComponent, h, nextTick, ref, type App } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";
import Badge from "../src/components/base/Badge.vue";
import EmptyState from "../src/components/base/EmptyState.vue";
import InlineAlert from "../src/components/base/InlineAlert.vue";
import Popover from "../src/components/base/Popover.vue";
import Section from "../src/components/base/Section.vue";
import Segmented from "../src/components/base/Segmented.vue";
import ToastHost from "../src/components/base/ToastHost.vue";
import { ICONS } from "../src/components/base/icons";
import { setLocale } from "../src/i18n";
import { clearToasts, toast, toasts } from "../src/state/toast";

let app: App | null = null;
let root: HTMLElement;
beforeEach(() => { root = document.createElement("div"); document.body.appendChild(root); setLocale("en"); clearToasts(); });
afterEach(() => { app?.unmount(); app = null; root.remove(); });
const mount = (render: () => unknown) => { app = createApp({ render: render as never }); app.mount(root); };

describe("icons", () => {
  test("every name in the spec's icon list exists", () => {
    const spec = ["mark", "chevron-down", "chevron-right", "arrow-left", "plus", "minus", "x", "check", "refresh", "reset", "sliders", "list", "calc", "alert-triangle", "alert-circle", "help", "info", "printer-3d", "print", "download", "upload", "copy", "trash", "pencil", "link", "link-off", "clock", "more", "search", "bolt", "box"];
    expect(Object.keys(ICONS).sort()).toEqual([...spec].sort());
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
    expect(root.querySelector(".sr-only")?.textContent).toBe("Edited");
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

describe("Badge, InlineAlert, EmptyState", () => {
  test("badge is text", () => {
    mount(() => h(Badge, { tone: "warn", text: "May be out of date" }));
    expect(root.textContent).toBe("May be out of date");
  });
  test("alert roles and actions", () => {
    const run = vi.fn();
    mount(() => h("div", [h(InlineAlert, { tone: "bad", actions: [{ label: "Retry", run }] }, () => "boom"), h(InlineAlert, { tone: "warn" }, () => "careful")]));
    const [bad, warn] = Array.from(root.querySelectorAll(".alert"));
    expect(bad?.getAttribute("role")).toBe("alert");
    expect(warn?.getAttribute("role")).toBe("status");
    (root.querySelector(".alert-actions button") as HTMLButtonElement).click();
    expect(run).toHaveBeenCalled();
  });
  test("empty state inlines the art without the English role/label", () => {
    mount(() => h(EmptyState, { art: "plate", title: "Slice to see a price", body: "b" }));
    const svg = root.querySelector("svg")!;
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("aria-label")).toBeNull();
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(root.textContent).toContain("Slice to see a price");
  });
});

describe("toasts", () => {
  test("Undo keeps focus for 20 seconds and returns it after dismissal", async () => {
    vi.useFakeTimers();
    try {
      mount(() => h("main", { tabindex: -1 }, [h("button", { id: "source" }, "Source"), h(ToastHost)]));
      const source = root.querySelector<HTMLButtonElement>("#source")!;
      source.focus();
      const run = vi.fn();
      toast({ text: "Deleted", action: { label: "Undo", run } });
      await nextTick();
      const undo = [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Undo")!;
      undo.focus();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(toasts.list).toHaveLength(1);
      expect(document.activeElement).toBe(undo);
      undo.click(); await nextTick(); await nextTick();
      expect(run).toHaveBeenCalledOnce();
      expect(toasts.list).toHaveLength(0);
      expect(document.activeElement).toBe(source);
    } finally { app?.unmount(); app = null; await vi.runAllTimersAsync(); vi.useRealTimers(); }
  });
  test("hover pauses expiry, leaving resumes it, and clearing also removes paused timers", async () => {
    vi.useFakeTimers();
    try {
      mount(() => h(ToastHost));
      toast({ text: "Hover", ms: 100 }); await nextTick();
      const message = root.querySelector<HTMLElement>("[data-toast-id]")!;
      message.dispatchEvent(new MouseEvent("mouseenter"));
      await vi.advanceTimersByTimeAsync(500);
      expect(toasts.list).toHaveLength(1);
      message.dispatchEvent(new MouseEvent("mouseleave"));
      await vi.advanceTimersByTimeAsync(101);
      expect(toasts.list).toHaveLength(0);
      toast({ text: "Paused", ms: 100 }); await nextTick();
      root.querySelector<HTMLElement>("[data-toast-id]")!.dispatchEvent(new MouseEvent("mouseenter"));
      clearToasts(); await vi.advanceTimersByTimeAsync(500);
      expect(toasts.list).toHaveLength(0);
    } finally { app?.unmount(); app = null; await vi.runAllTimersAsync(); vi.useRealTimers(); }
  });
  test("stack is at most 3, newest last; errors stay; others auto-close", () => {
    vi.useFakeTimers();
    const ids = [toast({ text: "1" }), toast({ text: "2" }), toast({ text: "3", tone: "bad" }), toast({ text: "4" })];
    expect(toasts.list.map((x) => x.text)).toEqual(["2", "3", "4"]);
    vi.advanceTimersByTime(5001);
    expect(toasts.list.map((x) => x.text)).toEqual(["3"]);
    expect(ids).toHaveLength(4);
    vi.useRealTimers();
  });
  test("action toasts last 8 s and the host renders roles and an undo button", async () => {
    vi.useFakeTimers();
    const run = vi.fn();
    mount(() => h(ToastHost));
    toast({ text: "Deleted", action: { label: "Undo", run } });
    toast({ text: "Failed", tone: "bad" });
    await nextTick();
    expect(root.querySelector("[role=status]")?.textContent).toContain("Deleted");
    expect(root.querySelector("[role=alert]")?.textContent).toContain("Failed");
    vi.advanceTimersByTime(7900);
    expect(toasts.list.map((x) => x.text)).toContain("Deleted");
    vi.advanceTimersByTime(200);
    expect(toasts.list.map((x) => x.text)).not.toContain("Deleted");
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
