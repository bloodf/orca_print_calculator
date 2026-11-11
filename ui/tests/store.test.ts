import { saveSectionDefaults } from "../src/components/costs/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createMockHost } from "../src/mock/host";
import type { ScenarioName } from "../src/mock/scenarios";
import { setLocale } from "../src/i18n";
import * as S from "../src/state/store";
import { closeQuote, deleteQuote, duplicateQuote, openQuote, saveQuote } from "../src/state/quotes";
import { clearToasts, toasts } from "../src/state/toast";
// host -> page delivery in the real injected shape (window.__orcaDispatch calls every registered callback)
const dispatchToPage = (m: unknown): void => (window as unknown as { __orcaDispatch: (x: unknown) => void }).__orcaDispatch(m);

let stop: (() => void) | null = null;
const sent: { cmd: string; args: Record<string, unknown> }[] = [];

async function boot(name: ScenarioName): Promise<void> {
  const host = createMockHost(name);
  const post = host.postMessage.bind(host);
  host.postMessage = (m) => { const x = m as { type: string; cmd: string; args: Record<string, unknown> }; if (x.type === "cmd") sent.push({ cmd: x.cmd, args: x.args }); post(m); };
  window.orca = host;
  stop = S.init();
  await vi.advanceTimersByTimeAsync(700);
}
const settle = async <T>(p: Promise<T>): Promise<T> => { await vi.advanceTimersByTimeAsync(100); return p; };
beforeEach(() => { vi.useFakeTimers(); sent.length = 0; clearToasts(); setLocale("en"); document.documentElement.removeAttribute("lang"); });
afterEach(() => { stop?.(); stop = null; delete window.orca; vi.useRealTimers(); });

describe("boot", () => {
  test("get_state fills the store and the price computes", async () => {
    await boot("ok");
    expect(S.store.status).toBe("ready");
    expect(S.store.plates).toHaveLength(3);
    expect(S.store.settings.onboarded).toBe(true);
    expect(S.store.spoolman.state).toBe("ok");
    expect(S.currency.value).toBe("BRL");
    expect(S.selected.value?.ok).toBe(true);
  });
  test("hostError rejects get_state into the error status with a code", async () => {
    await boot("hostError");
    expect(S.store.status).toBe("error");
    expect(S.store.error).toBe("host_error");
  });
  test("loading times out after 10 s", async () => {
    await boot("loading");
    expect(S.store.status).toBe("loading");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(S.store.status).toBe("error");
    expect(S.store.error).toBe("timeout");
  });
  test("firstRun has no settings file: built-ins, not onboarded, currency from Spoolman or locale", async () => {
    await boot("firstRun");
    expect(S.store.settings.onboarded).toBe(false);
    expect(S.store.settings.channels.map((c) => c.id)).toEqual(["direct"]);
    expect(S.store.spoolman.state).toBe("unset");
    expect(S.notCounted.value.map((n) => n.kind)).toEqual([]); // every cost starts from a built-in value
    expect(S.store.settings.defaults.energyPerKwh).not.toBeNull();
    expect(S.store.settings.defaults.laborPerHourMinor).not.toBeNull();
    expect(S.store.settings.defaults.targetMarginBp).toBe(5000);
  });
  test("offline: Spoolman marked offline with the host code, preset prices used", async () => {
    await boot("offline");
    expect(S.store.spoolman.state).toBe("offline");
    expect(S.store.spoolman.error).toBe("unreachable");
    expect(S.slotMatches.value[0]![0]!.source).toBe("preset");
  });
  test("empty: no plates, result is a no_plates problem", async () => {
    await boot("empty");
    expect(S.store.plates).toEqual([]);
    expect(S.result.value.ok).toBe(false);
  });
});

describe("recalculation", () => {
  test("changing an input recomputes the quote synchronously", async () => {
    await boot("ok");
    const before = S.selected.value;
    S.patchDraft({ quantity: 10 });
    const after = S.selected.value;
    expect(after).not.toBe(before);
    expect(S.quoteInput.value.quantity).toBe(10);
    expect(S.result.value.ok && S.result.value.batchTable.length).toBeGreaterThan(0);
  });
  test("overrides: set, equal-to-default removes the key, clear", async () => {
    await boot("ok");
    const base = S.selected.value;
    S.setOverride("targetMarginBp", 5000);
    expect(S.store.draft.overrides).toEqual({ targetMarginBp: 5000 });
    const hi = S.selected.value;
    expect(hi?.ok && base?.ok && hi.price > base.price).toBe(true);
    S.setOverride("targetMarginBp", 3000);
    expect(S.store.draft.overrides).toEqual({});
    S.setOverride("laborMinutes", 30);
    S.clearOverride("laborMinutes");
    expect(S.store.draft.overrides).toEqual({});
  });
  test("plate include and copies change the engine input", async () => {
    await boot("ok");
    S.setPlateControl(1, { include: false });
    S.setPlateControl(0, { copies: 2 });
    expect(S.quoteInput.value.plates.map((p) => [p.include, p.copies])).toEqual([[true, 2], [false, 1], [true, 1]]);
  });
  test("changing the Spoolman currency changes digits and money conversion", async () => {
    await boot("ok");
    S.store.spoolman = { ...S.store.spoolman, data: { ...S.store.spoolman.data, currency: "JPY" } };
    expect(S.digits.value).toBe(0);
  });
  test("save-as-defaults moves overrides into settings", async () => {
    await boot("ok");
    S.setOverride("targetMarginBp", 4500);
    saveSectionDefaults(["targetMarginBp"]);
    expect(S.store.settings.defaults.targetMarginBp).toBe(4500);
    expect(S.store.draft.overrides).toEqual({});
  });
});

describe("settings auto-save", () => {
  test("debounced 600 ms trailing: one save_settings after the last change", async () => {
    await boot("ok");
    sent.length = 0;
    S.patchDefaults({ laborMinutes: 11 });
    await vi.advanceTimersByTimeAsync(400);
    S.patchDefaults({ laborMinutes: 12 });
    await vi.advanceTimersByTimeAsync(400);
    expect(sent.filter((s) => s.cmd === "save_settings")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(300);
    const saves = sent.filter((s) => s.cmd === "save_settings");
    expect(saves).toHaveLength(1);
    expect((saves[0]!.args.settings as { defaults: { laborMinutes: number } }).defaults.laborMinutes).toBe(12);
    expect(S.store.saveStatus).toBe("saved");
    await vi.advanceTimersByTimeAsync(1600);
    expect(S.store.saveStatus).toBe("idle");
  });
  test("view switch flushes immediately; language change applies without reload", async () => {
    await boot("ok");
    sent.length = 0;
    S.setLanguage("pt-BR");
    expect(S.locale.value).toBe("pt-BR");
    S.setView("settings");
    await vi.advanceTimersByTimeAsync(50);
    expect(sent.some((s) => s.cmd === "save_settings")).toBe(true);
    expect(S.store.view).toBe("settings");
  });
});

describe("events", () => {
  const push = (name: string, data: unknown) => dispatchToPage({ type: "event", name, data });
  test("a plates event replaces plates and keeps controls by index", async () => {
    await boot("ok");
    S.setPlateControl(0, { copies: 3 });
    S.setPlateControl(2, { copies: 4 });
    push("plates", { plates: S.store.plates.slice(0, 2).map((p) => ({ ...p, stale: true })) });
    expect(S.store.plates).toHaveLength(2);
    expect(S.store.plates[0]!.stale).toBe(true);
    expect(S.store.draft.plates).toEqual({ 0: { include: true, copies: 3 } });
  });
  test("ProjectOpened resets the draft", async () => {
    await boot("ok");
    S.patchDraft({ quantity: 50 });
    push("host", { kind: "ProjectOpened", host: { ...S.store.host, projectName: "Other" } });
    expect(S.store.draft.quantity).toBe(1);
    expect(S.store.host.projectName).toBe("Other");
  });
  test("a live slice while imported plates are showing becomes pending until accepted", async () => {
    await boot("imported");
    expect(S.plateOrigin.value).toBe("import");
    const live = S.store.plates.map((p) => ({ ...p, source: "slice" as const, fileName: null }));
    push("plates", { plates: live });
    expect(S.store.pendingPlates).toHaveLength(3);
    expect(S.store.plates[0]!.source).toBe("file");
    S.useNewSlice();
    expect(S.plateOrigin.value).toBe("live");
    expect(S.store.pendingPlates).toBeNull();
  });
  test("an empty plates event (project closed) while imported plates show offers no empty \"New slice\"", async () => {
    await boot("imported");
    push("plates", { plates: [] });
    expect(S.store.pendingPlates).toBeNull();
    expect(S.store.plates).toHaveLength(3);
  });
});

describe("saved quotes", () => {
  test("save, reopen identically, duplicate, delete with undo", async () => {
    await boot("ok");
    S.patchDraft({ quantity: 5, title: "Mine" });
    const q = await settle(saveQuote());
    expect(q?.no).toBe(43);
    expect(S.store.quotes.map((x) => x.no)).toEqual([41, 42, 43]);
    expect(S.store.settings.sheet.nextNo).toBe(44);
    expect(sent.some((s) => s.cmd === "save_quotes")).toBe(true);
    const price = S.selected.value;
    closeQuote();
    S.patchDraft({ quantity: 99 });
    openQuote(q!.id);
    expect(S.store.draft.quantity).toBe(5);
    expect(S.store.draft.frozenPlates).not.toBeNull();
    expect(S.selected.value).toEqual(price);
    await settle(saveQuote()); // unchanged id: update in place, number stays
    expect(S.store.quotes).toHaveLength(3);
    await settle(duplicateQuote(q!.id));
    expect(S.store.quotes).toHaveLength(4);
    toasts.list = [];
    await settle(deleteQuote(q!.id));
    expect(S.store.quotes).toHaveLength(3);
    toasts.list[toasts.list.length - 1]!.action!.run();
    await vi.advanceTimersByTimeAsync(100);
    expect(S.store.quotes.some((x) => x.id === q!.id)).toBe(true);
  });
  test("reopening shows the quote's own values (its frozen defaults), not today's", async () => {
    await boot("ok");
    S.setOverride("targetMarginBp", 4200);
    const q = await settle(saveQuote());
    closeQuote();
    expect(S.store.draft.overrides).toEqual({});
    openQuote(q!.id);
    expect(S.store.draft.overrides).toEqual({}); // nothing edited yet
    expect(S.store.draft.frozenDefaults?.targetMarginBp).toBe(4200);
    S.store.settings = { ...S.store.settings, defaults: { ...S.store.settings.defaults, targetMarginBp: 7000 } };
    expect(S.derived.value.defaults.targetMarginBp).toBe(4200);
  });
  test("no price, nothing saved", async () => {
    await boot("empty");
    expect(await saveQuote()).toBeNull();
  });
});
