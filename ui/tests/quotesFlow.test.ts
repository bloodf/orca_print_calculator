import { beforeEach, describe, expect, test, vi } from "vitest";
import { nextTick } from "vue";
import QuotesView from "../src/views/QuotesView.vue";
import { mount, txt } from "./priceKit";
import { BridgeError } from "../src/bridge";
import { t } from "../src/i18n";
import { HOST, plates, settings, spoolman } from "../src/mock/fixtures";
import { exportQuote, exportQuoteList, exportText, sheetFor } from "../src/quoteFlow";
import { deleteQuote, openQuote, saveQuote } from "../src/state/quotes";
import { defaultSettings, mergeSettings, newDraft } from "../src/state/defaults";
import { derived, patchDefaults, store } from "../src/state/store";
import { clearToasts, toastList as toasts } from "@orca-plugins/ui-foundation/src/components/toast";

const calls: { cmd: string; args: unknown }[] = [];
let failExport: string | null = null;
let failSave: string | null = null;
vi.mock("../src/bridge", async (orig) => ({
  ...(await orig<typeof import("../src/bridge")>()),
  call: vi.fn(async (cmd: string, args: unknown) => {
    calls.push({ cmd, args });
    if (cmd === "save_quotes" && failSave) throw new (await orig<typeof import("../src/bridge")>()).BridgeError(failSave);
    if (cmd === "export_file" && failExport) throw new (await orig<typeof import("../src/bridge")>()).BridgeError(failExport);
    return cmd === "export_file" ? { path: `/out/${(args as { name: string }).name}` } : {};
  }),
}));

beforeEach(() => {
  calls.length = 0;
  failExport = null;
  failSave = null;
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

  test("a save that timed out stays in the list (the host may still write it), so the next save keeps it", async () => {
    failSave = "timeout";
    expect(await saveQuote()).toBeNull();
    expect(store.quotes).toHaveLength(1);
    failSave = "denied"; // any other failure rolls back
    store.draft = { ...store.draft, quoteId: null };
    expect(await saveQuote(true)).toBeNull();
    expect(store.quotes).toHaveLength(1);
    failSave = null;
    await saveQuote(true);
    const last = calls.filter((c) => c.cmd === "save_quotes").pop()!.args as { quotes: unknown[] };
    expect(last.quotes).toHaveLength(2);
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
    expect(last.title).toBe(t("export.saved", { path: "/out/quote-0043.csv" }));
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
    expect(last.tone).toBe("error");
    expect(last.title).toBe(t("export.failed"));
    expect(last.title).not.toContain(code);
    expect(err).toHaveBeenCalledWith("export_file", code);
    err.mockRestore();
    expect(new BridgeError(code).code).toBe(code);
  });
});

describe("export the quote list", () => {
  test("writes the shown quotes as one CSV through export_file and offers the path", async () => {
    await saveQuote(true);
    store.draft = { ...store.draft, customer: "Bruno" };
    await saveQuote(true);
    calls.length = 0;
    await exportQuoteList(store.quotes.filter((q) => q.customer === "Bruno"), new Date(2026, 10, 14, 9));
    const sent = calls.find((c) => c.cmd === "export_file")!.args as { name: string; text: string };
    expect(sent.name).toBe("quotes-2026-11-14.csv");
    expect(sent.text.split("\r\n").filter(Boolean)).toHaveLength(2); // header + Bruno's quote only
    expect(sent.text).toContain(",Bruno,");
    expect(toasts.list[toasts.list.length - 1]?.title).toBe(t("export.saved", { path: "/out/quotes-2026-11-14.csv" }));
  });
  test("a host failure says so", async () => {
    await saveQuote(true);
    failExport = "denied";
    await exportQuoteList(store.quotes);
    expect(toasts.list[toasts.list.length - 1]?.tone).toBe("error");
  });
});

describe("Quotes view: Export list", () => {
  test("exports what the search shows", async () => {
    await saveQuote(true);
    store.draft = { ...store.draft, customer: "Bruno" };
    await saveQuote(true);
    const m = mount(QuotesView);
    await nextTick();
    const search = m.root.querySelector<HTMLInputElement>("input[type=search]")!;
    search.value = "bruno";
    search.dispatchEvent(new Event("input"));
    await nextTick();
    calls.length = 0;
    const btn = [...m.root.querySelectorAll("button")].find((b) => txt(b) === t("quotes.exportList"))!;
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    const sent = calls.find((c) => c.cmd === "export_file")!.args as { text: string };
    expect(sent.text.split("\r\n").filter(Boolean)).toHaveLength(2);
    expect(sent.text).toContain(",Bruno,");
    m.app.unmount(); m.root.remove();
  });
});
