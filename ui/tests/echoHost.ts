// Minimal echo host in Orca's injected shape (onMessage registers; delivery through __orcaDispatch). For bridge tests only.
export function installMockOrca(): void {
  if (window.orca) return;
  const handlers: ((msg: unknown) => void)[] = [];
  const deliver = (payload: unknown): void => handlers.forEach((fn) => fn(payload));
  window.orca = {
    onMessage(cb) { handlers.push(cb); },
    postMessage(msg) {
      const m = msg as { type?: string; id?: number; cmd?: string; args?: unknown };
      const reply = (payload: unknown) => queueMicrotask(() => deliver(payload));
      if (m.type === "cmd") reply({ type: "res", id: m.id, ok: true, data: { cmd: m.cmd, args: m.args } });
    },
  };
  (window as unknown as { __orcaDispatch?: typeof deliver }).__orcaDispatch = deliver;
}
