// F05: a quote's number is chosen inside the serialized write that inserts it, so queued, concurrent and retried creations
// never share a number or an export file name. The first write is held at a barrier; no timers decide the interleaving.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn() }));
import { call } from "../src/bridge";
import { exportText } from "../src/quoteFlow";
import { duplicateQuote, saveQuote } from "../src/state/quotes";
import { store } from "../src/state/store";
import { clearToasts, toasts } from "../src/state/toast";
import { load } from "./priceKit";

type Gate = { release: () => void; fail: (e: unknown) => void; promise: Promise<unknown> };
const gate = (): Gate => { let release!: () => void; let fail!: (e: unknown) => void; const promise = new Promise<unknown>((a, b) => { release = () => a({}); fail = b; }); return { release, fail, promise }; };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const numbers = () => store.quotes.map((q) => q.no);
const unique = (xs: number[]) => new Set(xs).size === xs.length;

beforeEach(() => { clearToasts(); vi.mocked(call).mockReset(); vi.mocked(call).mockImplementation((async () => ({})) as never); });
afterEach(() => vi.mocked(call).mockReset());

/** A saved quote, then `save_quotes` held at a barrier so every later creation queues behind a pending write. */
async function seeded() {
  load("ok");
  store.quotes = [];
  const first = (await saveQuote())!;
  const writes: Gate[] = [];
  vi.mocked(call).mockImplementation((async (cmd: string) => { if (cmd !== "save_quotes") return {}; const g = gate(); writes.push(g); return g.promise; }) as never);
  return { first, writes };
}

describe("F05: unique quote numbers under concurrency", () => {
  test("two duplicates and a save-as-new queued behind a pending write get three different numbers", async () => {
    const { first, writes } = await seeded();
    const jobs = [duplicateQuote(first.id), duplicateQuote(first.id), saveQuote(true)];
    await flush();
    expect(writes).toHaveLength(1); // only the head of the queue has reached the host
    for (let i = 0; i < 3; i++) { writes[i]!.release(); await flush(); }
    await Promise.all(jobs);
    expect(store.quotes).toHaveLength(4);
    expect(unique(numbers())).toBe(true);
    expect(numbers()).toEqual([first.no, first.no + 1, first.no + 2, first.no + 3]);
  });

  test("distinct quotes never share an export destination", async () => {
    const { first, writes } = await seeded();
    const jobs = [duplicateQuote(first.id), duplicateQuote(first.id)];
    await flush();
    for (let i = 0; i < 2; i++) { writes[i]!.release(); await flush(); }
    await Promise.all(jobs);
    const names = store.quotes.map((q) => exportText(q, "csv")!.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("a write that fails rolls back with its number; the next creation reuses nothing that is on disk", async () => {
    const { first, writes } = await seeded();
    const a = duplicateQuote(first.id);
    const b = duplicateQuote(first.id);
    await flush();
    writes[0]!.fail(new Error("disk full"));
    await flush();
    writes[1]!.release();
    await Promise.all([a, b]);
    expect(store.quotes).toHaveLength(2); // the failed one left no row behind
    expect(unique(numbers())).toBe(true);
    expect(toasts.list.some((x) => x.tone === "bad")).toBe(true);
  });

  test("retry after a failure takes a fresh number from the list as it is then", async () => {
    const { first, writes } = await seeded();
    const failed = duplicateQuote(first.id);
    await flush();
    writes[0]!.fail(new Error("disk full"));
    await failed;
    const retry = toasts.list.find((x) => x.action?.label)?.action;
    expect(retry).toBeTruthy();
    const other = duplicateQuote(first.id); // someone else creates meanwhile
    await flush();
    writes[1]!.release();
    await other;
    retry!.run();
    await flush();
    writes[2]!.release();
    await flush();
    expect(store.quotes).toHaveLength(3);
    expect(unique(numbers())).toBe(true);
  });

  test("numbers stay above every quote in the file, including rows this version could not read", async () => {
    const { first, writes } = await seeded();
    store.quarantined = [{ no: 90, junk: true }];
    const p = duplicateQuote(first.id);
    await flush();
    writes[0]!.release();
    await p;
    expect(store.quotes[1]!.no).toBe(91);
  });

  test("saving changes to an existing quote keeps its number", async () => {
    const { first, writes } = await seeded();
    store.draft = { ...store.draft, quoteId: first.id, title: "renamed" };
    const p = saveQuote();
    await flush();
    writes[0]!.release();
    expect((await p)!.no).toBe(first.no);
  });
});
