// Minimal real-time Chrome DevTools client for the MOCK visual/behaviour checks. Chrome always runs with
// --use-mock-keychain --password-store=basic, owns a throw-away profile, and is closed afterwards.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openBrowser() {
  const profile = await mkdtemp(join(tmpdir(), "opc-cdp-"));
  const proc = spawn(CHROME, ["--headless=new", '--disable-extensions', '--disable-component-extensions-with-background-pages', "--use-mock-keychain", "--password-store=basic", "--disable-gpu", "--hide-scrollbars", "--disable-background-networking", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (c) => { stderr += c; });
  let port;
  for (let i = 0; i < 200 && !port; i++) { try { port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; } catch { await delay(25); } }
  if (!port) throw new Error("Chrome did not start: " + stderr);
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; });
  let id = 0; const pending = new Map(); const listeners = [];
  socket.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    else for (const l of listeners) l(m);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); socket.send(JSON.stringify({ id: i, method, params })); });
  const on = (fn) => listeners.push(fn);
  const close = async () => { socket.close(); proc.kill("SIGTERM"); await new Promise((r) => (proc.exitCode !== null ? r() : proc.once("exit", r))); await rm(profile, { recursive: true, force: true }); };
  return { call, on, close, stderr: () => stderr };
}

/** Evaluate an async function body in the page; throws on exception. */
export async function evaluate(call, body) {
  const r = await call("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: `(async () => { ${body} })()` });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
export const waitFor = (call, test, ms = 8000) => evaluate(call, `const t0 = performance.now(); while (!(${test})) { if (performance.now() - t0 > ${ms}) throw new Error("timeout: " + ${JSON.stringify(test)}); await new Promise(r => setTimeout(r, 25)); } return true;`);
