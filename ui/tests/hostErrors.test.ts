// Host error copy (B) and real-data chip labels (C). Written red-first.
import { h } from "vue";
import { createOrcaApp as createApp } from "../src/orcaUi";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn() }));
import { BridgeError, call } from "../src/bridge";
import FilamentChip from "../src/components/plates/FilamentChip.vue";
import MaterialRow from "../src/components/plates/MaterialRow.vue";
import { chipLabel, presetName } from "../src/components/plates/slots";
import { errorText } from "../src/components/plates/importFlow";
import { spoolmanErrorMessage } from "../src/components/settings/spoolmanError";
import { setLocale, t } from "../src/i18n";
import { exportQuote } from "../src/quoteFlow";
import { saveQuote } from "../src/state/quotes";
import { flushSettings, store } from "../src/state/store";
import { clearToasts, toasts } from "../src/state/toast";
import type { HostSlot, SlotMatchView } from "../src/state/types";
import { load } from "./priceKit";

const FILES = import.meta.glob("../../tests/contract/slice_all.json", { eager: true, import: "default" });
type PlateRow = { slots: HostSlot[] };
type Step = { out: { type?: string; name?: string; data?: { plates?: PlateRow[] } | PlateRow[] }[] };
const realSlots = (): HostSlot[] => {
  const steps = Object.values(FILES)[0] as Step[];
  for (const s of steps) for (const o of s.out) {
    const d = o.data;
    const plates: PlateRow[] | undefined = Array.isArray(d) ? d : d?.plates;
    if (o.name === "plates" && plates?.length) return plates.flatMap((p) => p.slots);
  }
  throw new Error("no plates event in slice_all.json");
};
const view = (slot: HostSlot): SlotMatchView => ({ plateIndex: 0, slot, key: `preset:${slot.preset}`, source: "preset", filamentId: null, spoolId: null, pricePerKg: 25, priceSource: "preset" });
const calls = () => vi.mocked(call);

beforeEach(() => { setLocale("en"); clearToasts(); calls().mockReset(); });
afterEach(() => { document.body.innerHTML = ""; });

describe("B. Spoolman codes", () => {
  for (const lang of ["en", "pt-BR"] as const) {
    test(`${lang}: redirected and too_large have their own sentence`, () => {
      setLocale(lang);
      for (const c of ["redirected", "too_large"]) {
        const text = spoolmanErrorMessage(c);
        expect(text, c).not.toBe(t("spoolman.error.unknown", { detail: c }));
        expect(text, c).not.toMatch(/^Spoolman failed|^Falha/);
      }
      if (lang === "en") expect(spoolmanErrorMessage("redirected")).toMatch(/redirected.*address/i);
    });
  }
});

describe("B. Host codes a user can act on", () => {
  test("import: too_large (slice data) names the cause, not the generic unreadable text", () => {
    expect(errorText("too_large", 1)).not.toBe(t("import.error.unreadable"));
    setLocale("pt-BR");
    expect(errorText("too_large", 1)).not.toBe(t("import.error.unreadable"));
  });
  test("saving quotes: too_large says to delete old quotes; io says the disk write failed", async () => {
    load("ok");
    calls().mockRejectedValueOnce(new BridgeError("too_large"));
    await saveQuote();
    expect(toasts.list[toasts.list.length - 1]!.text).toMatch(/delete old quotes/i);
    clearToasts();
    calls().mockRejectedValueOnce(new BridgeError("io"));
    await saveQuote();
    expect(toasts.list[toasts.list.length - 1]!.text).toMatch(/disk/i);
  });
  test("saving settings: io and too_large are specific too", async () => {
    calls().mockRejectedValueOnce(new BridgeError("io"));
    await flushSettings();
    expect(toasts.list[toasts.list.length - 1]!.text).toMatch(/disk/i);
    clearToasts();
    calls().mockRejectedValueOnce(new BridgeError("too_large"));
    await flushSettings();
    expect(toasts.list[toasts.list.length - 1]!.text).toMatch(/delete old quotes/i);
  });
  test("export: bad_name and io are specific; an unknown code stays generic", async () => {
    load("ok");
    const q = await (async () => { calls().mockResolvedValue({}); return saveQuote(); })();
    clearToasts();
    calls().mockRejectedValueOnce(new BridgeError("bad_name"));
    await exportQuote("csv", q);
    expect(toasts.list[toasts.list.length - 1]!.text).toMatch(/name/i);
    clearToasts();
    calls().mockRejectedValueOnce(new BridgeError("io"));
    await exportQuote("csv", q);
    expect(toasts.list[toasts.list.length - 1]!.text).toMatch(/disk/i);
    clearToasts();
    calls().mockRejectedValueOnce(new BridgeError("weird"));
    await exportQuote("csv", q);
    expect(toasts.list[toasts.list.length - 1]!.text).toBe(t("export.failed"));
  });
  test("pt-BR has all of them (no English fallthrough)", async () => {
    setLocale("pt-BR");
    calls().mockRejectedValueOnce(new BridgeError("io"));
    await flushSettings();
    expect(toasts.list[toasts.list.length - 1]!.text).toMatch(/disco/i);
    expect(store.saveStatus).toBe("error");
  });
});

describe("C. chip label with real host data", () => {
  test("the real preset path is never the label: material when known", () => {
    for (const s of realSlots()) {
      expect(s.preset).toContain("_local/spooler/"); // the shape that broke the chip
      expect(chipLabel(view(s))).toBe("PLA");
    }
  });
  test("no material: last path segment without the @printer suffix", () => {
    const s: HostSlot = { ...realSlots()[0]!, material: null };
    expect(chipLabel(view(s))).toBe("3D Procer PLA Branco");
    expect(presetName(s.preset)).toBe("3D Procer PLA Branco");
  });
  test("existing friendly presets keep working", () => {
    const s: HostSlot = { n: 1, preset: "Generic PLA @BBL X1C", grams: 1, color: null, costPerKg: null, notes: "", material: null };
    expect(chipLabel(view(s))).toBe("PLA");
  });
  const mount = (c: unknown, props: Record<string, unknown>): HTMLElement => { const root = document.createElement("div"); document.body.appendChild(root); createApp({ render: () => h(c as never, props) }).mount(root); return root; };
  test("chip: readable text, full preset in the title; material row shows the readable name with the full name in its title", () => {
    const s = realSlots()[1]!;
    const chip = mount(FilamentChip, { slot: s, match: view(s) });
    expect(chip.querySelector(".name")!.textContent).toBe("PLA");
    expect(chip.querySelector("button")!.getAttribute("title")).toBe(s.preset);
    expect(chip.textContent).not.toContain("_local");
    const row = mount(MaterialRow, { match: view(s) });
    expect(row.querySelector(".preset")!.textContent).toBe("3D Procer PLA Preto");
    expect(row.querySelector(".preset")!.getAttribute("title")).toBe(s.preset);
  });
});

describe("T5.3 LOW: copy fits the action", () => {
  test("too_large says to delete old quotes when saving, but not for an export", async () => {
    const { failText } = await import("../src/hostError");
    const save = failText("Save failed.", "too_large", "save");
    const exp = failText("Export failed.", "too_large", "export");
    expect(save).toMatch(/delete old quotes/i);
    expect(exp).not.toMatch(/delete old quotes/i);
    expect(exp).toMatch(/too big/i);
  });
  test("denied and timeout have specific sentences in both languages", async () => {
    const { failText } = await import("../src/hostError");
    for (const lang of ["en", "pt-BR"] as const) {
      setLocale(lang);
      for (const code of ["denied", "timeout"]) expect(failText("x", code), `${lang} ${code}`).not.toBe("x");
    }
  });
  test("non-Spoolman codes never show raw in a Spoolman message", () => {
    for (const c of ["host_error", "no_host", "unknown_command", "bad_args", "timeout"]) {
      const text = spoolmanErrorMessage(c);
      expect(text, c).not.toContain(c);
    }
  });
  test("import timeout has its own sentence", () => {
    expect(errorText("timeout", 1)).not.toBe(t("import.error.unreadable"));
  });
});

describe("host code `unreadable` (a saved file that can be neither read nor set aside)", () => {
  test("saving settings and quotes says why nothing is saved and what to check, in both languages", async () => {
    const { failText } = await import("../src/hostError");
    for (const lang of ["en", "pt-BR"] as const) {
      setLocale(lang);
      expect(failText("x", "unreadable"), lang).not.toBe("x");
    }
    setLocale("en");
    expect(failText("x", "unreadable")).toMatch(/permissions/i);
  });
});
