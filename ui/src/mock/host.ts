// Fake window.orca for the dev harness: answers the bridge commands from a scenario, in memory.
import type { OrcaHost } from "../bridge";
import type { HostPlate, Settings } from "../state/types";
import { plates, spoolman } from "./fixtures";
import { buildScenario, type ScenarioName } from "./scenarios";

const LATENCY = 120;

export function createMockHost(name: ScenarioName): OrcaHost {
  const { state, behaviour } = buildScenario(name);
  let settings: Settings | null = state.settings;
  let quotes = state.quotes;
  // Real injected shape: onMessage registers; delivery goes through window.__orcaDispatch to every registered callback.
  const handlers: ((msg: unknown) => void)[] = [];
  (window as unknown as { __orcaDispatch?: (msg: unknown) => void }).__orcaDispatch = (msg) => handlers.forEach((fn) => fn(msg));
  const deliver = (payload: unknown): void => (window as unknown as { __orcaDispatch: (msg: unknown) => void }).__orcaDispatch(payload);
  const host: OrcaHost = {
    onMessage(cb) { handlers.push(cb); },
    postMessage(msg) {
      const m = msg as { type?: string; id?: number; cmd?: string; args?: Record<string, unknown> };
      if (m.type !== "cmd") return;
      const send = (payload: unknown, delay = LATENCY) => setTimeout(() => deliver(payload), delay);
      const ok = (data: unknown, delay?: number) => send({ type: "res", id: m.id, ok: true, data }, delay);
      const fail = (error: string, delay?: number) => send({ type: "res", id: m.id, ok: false, error }, delay);
      switch (m.cmd) {
        case "get_state":
          if (behaviour.hang) return;
          return behaviour.fail ? fail("host_error") : ok({ ...state, settings, quotes });
        case "save_settings": settings = (m.args?.settings as Settings) ?? settings; return ok({}, 30);
        case "save_quotes": quotes = (m.args?.quotes as typeof quotes) ?? quotes; return ok({}, 30);
        case "spoolman_fetch": return behaviour.spoolman === "offline" ? fail("unreachable", 400) : ok(spoolman(), 250);
        case "import_sliced": return importSliced(String(m.args?.name ?? ""), ok, fail);
        case "export_file": return ok({ path: `/mock/exports/${String(m.args?.name)}` });
        default: return fail("unknown_command");
      }
    },
  };
  return host;
}

function importSliced(name: string, ok: (d: unknown, delay?: number) => void, fail: (e: string, delay?: number) => void): void {
  if (name === "plain.3mf") return fail("no_slice_info", 300);
  if (name === "x.zip") return fail("not_zip", 300);
  const imported: HostPlate[] = plates().map((p) => ({ ...p, source: "file", fileName: name, slicedAt: null }));
  ok({ plates: imported }, 400);
}
