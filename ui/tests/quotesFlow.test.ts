import { beforeEach, describe, expect, test, vi } from "vitest";
import { BridgeError } from "../src/bridge";
import { t } from "../src/i18n";
import { HOST, plates, settings, spoolman } from "../src/mock/fixtures";
import { exportQuote, exportText, sheetFor } from "../src/quoteFlow";
import { deleteQuote, openQuote, saveQuote } from "../src/state/quotes";
import { defaultSettings, mergeSettings, newDraft } from "../src/state/defaults";
import { derived, patchDefaults, store } from "../src/state/store";
import { clearToasts, toasts } from "../src/state/toast";

const calls: { cmd: string; args: unknown }[] = [];
let failExport: string | null = null;
vi.mock("../src/bridge", async (orig) => ({
  ...(await orig<typeof import("../src/bridge")>()),
  call: vi.fn(async (cmd: string, args: unknown) => {
    calls.push({ cmd, args });
    if (cmd === "export_file" && failExport) throw new (await orig<typeof import("../src/bridge")>()).BridgeError(failExport);
    return cmd === "export_file" ? { path: `/out/${(args as { name: string }).name}` } : {};
  }),
}));

beforeEach(() => {
  calls.length = 0;
  failExport = null;
  clearToasts();
  store.settings = mergeSettings(settings(), defaultSettings(null, "Direct"));
  store.status = "ready";
  store.host = HOST;
  store.plates = plates();
  store.spoolman = { state: "ok", data: spoolman(), error: null };
  store.quotes = [];
  store.draft = { ...newDraft(store.settings), quantity: 10, title: "Desk organizer", customer: "Ana Souza" };
  store.view = "calc";
});

describe("saved quotes", () => {
  test("save -> list -> reopen reproduces the snapshot even after settings change", async () => {
    const rec = await saveQuote();
    expect(rec).not.toBeNull();
    expect(store.quotes).toHaveLength(1);
    expect(calls.find((c) => c.cmd === "save_quotes")).toBeTruthy();
    const before = JSON.stringify(sheetFor(store.quotes[0]!));
    const sel = derived.value.selected;
    expect(sel?.ok && sel.price).toBe(rec!.summary.price);

    patchDefaults({ targetMarginBp: 9000, laborMinutes: 600, minOrderMinor: 99999 });
    store.draft = newDraft(store.settings);
    expect(JSON.stringify(sheetFor(store.quotes[0]!))).toBe(before);

    openQuote(rec!.id);
    const re = derived.value.selected;
    expect(re?.ok && re.price).toBe(rec!.summary.price);
    expect(re?.ok && re.grandTotal).toBe(rec!.summary.grandTotal);
    expect(store.draft.frozenPlates).toEqual(rec!.plates);
  });

  test("numbering advances and save-as-new keeps the old record", async () => {
    const a = (await saveQuote())!;
    const b = (await saveQuote(true))!;
    expect(b.no).toBe(a.no + 1);
    expect(store.quotes.map((q) => q.id)).toEqual([a.id, b.id]);
  });

  test("delete shows an undo toast; undo restores the exact record at its index", async () => {
    const a = (await saveQuote())!;
    const b = (await saveQuote(true))!;
    const c = (await saveQuote(true))!;
    clearToasts();
    await deleteQuote(b.id);
    expect(store.quotes.map((q) => q.id)).toEqual([a.id, c.id]);
    const undo = toasts.list[toasts.list.length - 1]!.action!;
    expect(undo.label).toBe(t("common.undo"));
    undo.run();
    await vi.waitFor(() => expect(store.quotes.map((q) => q.id)).toEqual([a.id, b.id, c.id]));
    expect(store.quotes[1]).toEqual(b);
  });
});

describe("export", () => {
  test("csv of an unsaved draft saves first, writes quote-NNNN.csv and offers Copy path", async () => {
    await exportQuote("csv");
    expect(store.quotes).toHaveLength(1);
    const ex = calls.find((c) => c.cmd === "export_file")!.args as { name: string; text: string };
    expect(ex.name).toBe("quote-0043.csv");
    expect(ex.text.startsWith("﻿")).toBe(true);
    const last = toasts.list[toasts.list.length - 1]!;
    expect(last.text).toBe(t("export.saved", { path: "/out/quote-0043.csv" }));
    expect(last.action?.label).toBe(t("export.copyPath"));
  });

  test("html export carries the sheet and never the internals", async () => {
    const rec = (await saveQuote())!;
    const f = exportText(rec, "html")!;
    expect(f.name).toBe("quote-0043.html");
    expect(f.text).toContain("Desk organizer");
    expect(f.text).not.toContain(rec.summary.channelName);
  });

  test.each(["disk_full", "permission_denied", "host_error"])("host error %s shows the generic failure copy, no raw code", async (code) => {
    failExport = code;
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rec = (await saveQuote())!;
    await exportQuote("html", rec);
    const last = toasts.list[toasts.list.length - 1]!;
    expect(last.tone).toBe("bad");
    expect(last.text).toBe(t("export.failed"));
    expect(last.text).not.toContain(code);
    expect(err).toHaveBeenCalledWith("export_file", code);
    err.mockRestore();
    expect(new BridgeError(code).code).toBe(code);
  });
});
