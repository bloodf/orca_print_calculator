// Page <-> host RPC over Orca's injected bridge. Page sends {type:"cmd", id, cmd, args}; host answers
// {type:"res", id, ok:true, data} or {type:"res", id, ok:false, error:"<code>", detail?:"<text>"} and pushes
// {type:"event", name, data}. The page sends {type:"ready"} first (the host only binds the page; it pushes no state:
// the page loads through get_state). `error` is a CODE, never prose; `detail` is for logs.
// Real Orca 2.5 shape: window.orca.postMessage(obj) sends; window.orca.onMessage(cb) REGISTERS a callback (it is not a
// property to assign); the host delivers through window.__orcaDispatch(msg), which calls every registered callback.
// `msg` may arrive as an object or as a JSON string; dispatch() accepts both.
import type { HostInfo, HostPlate, HostState, SavedQuote, Settings, SpoolmanData } from "./state/types";

export interface OrcaHost {
  postMessage(msg: unknown): void;
  onMessage(cb: (msg: unknown) => void): void;
}

declare global {
  interface Window {
    orca?: OrcaHost;
  }
}

/** Command table (import_sliced per docs/spike.md section 9). */
export type Commands = {
  get_state: { args: Record<string, unknown>; data: HostState };
  save_settings: { args: { settings: Settings }; data: Record<string, never> };
  save_quotes: { args: { quotes: SavedQuote[] }; data: Record<string, never> };
  spoolman_fetch: { args: { url: string }; data: SpoolmanData };
  import_sliced: { args: { name: string; b64: string }; data: { plates: HostPlate[] } };
  export_file: { args: { name: string; text: string }; data: { path: string } };
};
export type CommandName = keyof Commands;

/** Events pushed by the host. `host.kind` says why the host info changed. */
export type HostEvent = { kind?: "PresetSelected" | "ProjectOpened" | "NewProject" | "ProjectClosed"; host?: HostInfo };
/** `deleted` is the index of a plate the user removed; the plates after it have already moved down by one. */
export type PlatesEvent = { plates: HostPlate[]; deleted?: number } | HostPlate[];

/** A host failure. `code` is a machine code (`not_zip`, `no_slice_info`, `too_big`, `unreachable`, `http_503`, `timeout`, ...). */
export class BridgeError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "BridgeError";
    this.code = code;
  }
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer?: ReturnType<typeof setTimeout> };
type Listener = (data: unknown) => void;

const pending = new Map<number, Pending>();
const listeners = new Map<string, Set<Listener>>();
let nextId = 1;
const registered = new WeakSet<OrcaHost>(); // one registration per host object, however many calls

function dispatch(raw: unknown): void {
  const msg = (typeof raw === "string" ? safeParse(raw) : raw) as Record<string, unknown> | null;
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "res") {
    const p = pending.get(msg.id as number);
    if (!p) return;
    pending.delete(msg.id as number);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.data);
    else p.reject(new BridgeError(String(msg.error ?? "host_error")));
  } else if (msg.type === "event") {
    listeners.get(msg.name as string)?.forEach((fn) => fn(msg.data));
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function host(): OrcaHost {
  const h = window.orca;
  if (!h) throw new BridgeError("no_host");
  if (!registered.has(h)) {
    registered.add(h);
    h.onMessage(dispatch);
  }
  return h;
}

/** Every command times out with the code `timeout` so no spinner can wait forever: get_state 10 s (docs/ux.md 6.2), importing a big file 120 s, spoolman_fetch 30 s (the host's worst case is 25 s), the rest 25 s. */
const TIMEOUTS: Record<CommandName, number> = { get_state: 10_000, import_sliced: 120_000, save_settings: 25_000, save_quotes: 25_000, spoolman_fetch: 30_000, export_file: 25_000 };

export function call<K extends CommandName>(cmd: K, args: Commands[K]["args"], timeoutMs: number = TIMEOUTS[cmd]): Promise<Commands[K]["data"]> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const p: Pending = { resolve: resolve as (v: unknown) => void, reject };
    if (timeoutMs) p.timer = setTimeout(() => { pending.delete(id); reject(new BridgeError("timeout")); }, timeoutMs);
    pending.set(id, p);
    try {
      host().postMessage({ type: "cmd", id, cmd, args });
    } catch (e) {
      pending.delete(id);
      clearTimeout(p.timer);
      reject(e instanceof Error ? e : new BridgeError("host_error"));
    }
  });
}

export const errorCode = (e: unknown): string => (e instanceof BridgeError ? e.code : e instanceof Error ? e.message : "host_error");

export function on(name: string, fn: Listener): () => void {
  const set = listeners.get(name) ?? new Set<Listener>();
  set.add(fn);
  listeners.set(name, set);
  return () => set.delete(fn);
}

export function ready(): void {
  host().postMessage({ type: "ready" });
}
