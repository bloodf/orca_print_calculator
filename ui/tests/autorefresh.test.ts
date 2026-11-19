// The Spoolman re-read timer: interval, paused while hidden, one read at a time, backoff, never while the user edits;
// and its setting (settings.spoolman.refreshS: 0 or 10–300 s, 30 by default).
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { autoRefresh, cleanEvery, nextDelayS, userBusy } from "../src/autorefresh";
import { defaultSettings, mergeSettings, resetNames } from "../src/state/defaults";

function fakeDoc() {
  const fns = new Set<() => void>();
  return {
    hidden: false,
    addEventListener: (_: string, f: () => void) => { fns.add(f); },
    removeEventListener: (_: string, f: () => void) => { fns.delete(f); },
    show(hidden: boolean) { this.hidden = hidden; fns.forEach((f) => f()); },
  };
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

let stop: (() => void) | null = null;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { stop?.(); stop = null; vi.useRealTimers(); document.body.innerHTML = ""; });

function setup(o: { every?: number; ok?: () => boolean; held?: () => boolean; slow?: boolean } = {}) {
  const doc = fakeDoc();
  let reads = 0, release: (() => void) | null = null;
  const a = autoRefresh({
    doc, every: () => o.every ?? 30, held: o.held,
    load: () => { reads++; if (o.slow) return new Promise<boolean>((r) => { release = () => r(true); }); return Promise.resolve(o.ok ? o.ok() : true); },
  });
  stop = () => a.stop();
  const tick = async (s: number) => { vi.advanceTimersByTime(s * 1000); await flush(); };
  return { doc, tick, reads: () => reads, release: () => release?.() };
}

test("reads every 30 s and pauses while hidden, reading at once when shown", async () => {
  const r = setup();
  await r.tick(30); expect(r.reads()).toBe(1);
  r.doc.show(true); await r.tick(120); expect(r.reads()).toBe(1);
  r.doc.show(false); await flush(); expect(r.reads()).toBe(2);
});

test("no overlapping reads", async () => {
  const r = setup({ slow: true });
  await r.tick(30); r.doc.show(false); await r.tick(120); expect(r.reads()).toBe(1);
  r.release(); await flush(); await r.tick(30); expect(r.reads()).toBe(2);
});

test("backs off 30, 60, 120 s up to 5 min on errors", async () => {
  const r = setup({ ok: () => false });
  await r.tick(30); await r.tick(30); expect(r.reads()).toBe(2);
  await r.tick(59); expect(r.reads()).toBe(2); await r.tick(1); expect(r.reads()).toBe(3);
  expect([nextDelayS(30, 3), nextDelayS(30, 9)]).toEqual([120, 300]);
});

test("waits while a picker is open, then reads", async () => {
  const pop = document.createElement("div");
  pop.setAttribute("role", "dialog");
  document.body.append(pop);
  const r = setup({ held: () => userBusy() });
  await r.tick(90); expect(r.reads()).toBe(0);
  pop.remove(); await r.tick(1); expect(r.reads()).toBe(1);
});

test("off reads nothing; the setting is checked and kept", async () => {
  const r = setup({ every: 0 });
  await r.tick(600); expect(r.reads()).toBe(0);
  expect([0, 10, 300, 9, 301, "30", null].map(cleanEvery)).toEqual([0, 10, 300, 30, 30, 30, 30]);
  const base = defaultSettings("EUR", "Direct");
  expect(base.spoolman.refreshS).toBe(30);
  expect(mergeSettings({ ...base, spoolman: { url: "http://h", refreshS: 60 } }, base).spoolman).toEqual({ url: "http://h", refreshS: 60 });
  expect(resetNames({ ...base, spoolman: { url: "", refreshS: 5 } })).toContain("spoolman.refreshS");
});
