// F04: prices and currency belong to the Spoolman address they came from. Removing or changing the address drops them, a late
// answer from an old address is ignored, and quotes already saved keep their own currency and prices.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../src/bridge", async (orig) => ({ ...(await orig<typeof import("../src/bridge")>()), call: vi.fn() }));
import { call } from "../src/bridge";
import { openQuote } from "../src/state/quotes";
import { currency, currencySource, fetchSpoolman, patchSettings, slotMatches, store } from "../src/state/store";
import { spoolman } from "../src/mock/fixtures";
import { load } from "./priceKit";

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const deferred = <T>(): Deferred<T> => { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const A = "http://10.0.0.1:7912";
const B = "http://10.0.0.2:7912";
const eur = () => ({ ...spoolman(), currency: "EUR" });
const answers = new Map<string, Deferred<unknown>>();
const url = (u: string) => patchSettings({ spoolman: { url: u } });
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.useFakeTimers();
  load("noSpoolman");
  answers.clear();
  vi.mocked(call).mockReset();
  vi.mocked(call).mockImplementation((async (cmd: string, args: { url?: string }) => {
    if (cmd !== "spoolman_fetch") return {};
    const d = deferred<unknown>();
    answers.set(args.url!, d);
    return d.promise;
  }) as never);
});
afterEach(() => { url(""); void fetchSpoolman(true); vi.useRealTimers(); });

/** Connect to `at` and answer with `data`. */
async function connect(at: string, data: unknown = spoolman()): Promise<void> {
  url(at);
  const p = fetchSpoolman(true);
  await flush();
  answers.get(at)!.resolve(data);
  await p;
}

describe("F04: Spoolman origin", () => {
  test("removing the address empties filaments, spools and currency; prices fall back to the preset or manual route", async () => {
    await connect(A, eur());
    expect(store.spoolman.state).toBe("ok");
    expect(store.spoolman.data.filaments.length).toBeGreaterThan(0);
    expect(currencySource.value).toBe("spoolman");
    expect(currency.value).toBe("EUR");
    const withSpoolman = JSON.stringify(slotMatches.value);

    url("");
    await fetchSpoolman();
    expect(store.spoolman).toEqual({ state: "unset", data: { currency: null, filaments: [], spools: [] }, error: null });
    expect(currencySource.value).toBe("settings"); // the manual currency field works again
    expect(currency.value).toBe("BRL"); // the configured one
    expect(JSON.stringify(slotMatches.value)).not.toBe(withSpoolman);
    expect(Object.values(slotMatches.value).flat().every((v) => v.priceSource !== "filament" && v.priceSource !== "spool")).toBe(true);
  });

  test("a late answer from the removed address does not bring its data back", async () => {
    url(A);
    const late = fetchSpoolman(true);
    await flush();
    url("");
    await fetchSpoolman(true);
    answers.get(A)!.resolve(eur());
    await late;
    expect(store.spoolman.state).toBe("unset");
    expect(store.spoolman.data.filaments).toEqual([]);
    expect(currencySource.value).toBe("settings");
  });

  test("changing the address drops the old data at once", async () => {
    await connect(A, eur());
    url(B);
    const p = fetchSpoolman(true);
    await flush();
    expect(store.spoolman.state).toBe("connecting");
    expect(store.spoolman.data).toEqual({ currency: null, filaments: [], spools: [] }); // never A's prices under B's name
    expect(currencySource.value).toBe("settings");
    answers.get(B)!.resolve({ ...spoolman(), currency: "USD" });
    await p;
    expect(store.spoolman.state).toBe("ok");
    expect(currency.value).toBe("USD");
  });

  test("an older request for the previous address that answers after the switch is ignored", async () => {
    url(A);
    const old = fetchSpoolman(true);
    await flush();
    const oldAnswer = answers.get(A)!;
    url(B);
    const current = fetchSpoolman(true);
    await flush();
    answers.get(B)!.resolve({ ...spoolman(), currency: "USD" });
    await current;
    oldAnswer.resolve(eur()); // barrier released only now: the A reply lands after B's
    await old;
    expect(store.spoolman.state).toBe("ok");
    expect(currency.value).toBe("USD");
  });

  test("a failed new address leaves no data of the previous one", async () => {
    await connect(A, eur());
    url(B);
    const p = fetchSpoolman(true);
    await flush();
    answers.get(B)!.reject(new Error("unreachable"));
    await p;
    expect(store.spoolman.state).toBe("offline");
    expect(store.spoolman.data).toEqual({ currency: null, filaments: [], spools: [] });
    expect(currencySource.value).toBe("settings");
  });

  test("a temporary failure of the SAME address keeps the last known currency (not a disconnect)", async () => {
    await connect(A, eur());
    const p = fetchSpoolman(true);
    await flush();
    answers.get(A)!.reject(new Error("timeout"));
    await p;
    expect(store.spoolman.state).toBe("offline");
    expect(store.spoolman.data.filaments).toEqual([]);
    expect(store.spoolman.data.currency).toBe("EUR");
  });

  test("a saved quote keeps its own currency and prices while the connection changes", async () => {
    load("savedQuote");
    const quote = store.quotes[0]!;
    openQuote(quote.id);
    const frozenCurrency = store.draft.currency;
    const frozenPlates = JSON.stringify(store.draft.frozenPlates);
    await connect(A, eur());
    url("");
    await fetchSpoolman(true);
    expect(store.draft.currency).toBe(frozenCurrency);
    expect(currency.value).toBe(quote.currency);
    expect(JSON.stringify(store.draft.frozenPlates)).toBe(frozenPlates);
    expect(JSON.stringify(store.quotes[0])).toBe(JSON.stringify(quote)); // the record itself is untouched
  });

  test("the user's saved choices (overrides, manual prices) survive a disconnect", async () => {
    store.settings = { ...store.settings, manualPrices: { "Generic PLA": 9_900 }, slotOverrides: { "Generic PLA": { filamentId: 3 } } as never };
    await connect(A);
    url("");
    await fetchSpoolman(true);
    expect(store.settings.manualPrices).toEqual({ "Generic PLA": 9_900 });
    expect(store.settings.slotOverrides).toEqual({ "Generic PLA": { filamentId: 3 } });
  });
});
