// Runs the PRODUCTION single-file artifact (ui/dist/index.html, with its CSP meta) in headless Chrome against the mock host,
// in real time, and records what it did. MOCK only: no Orca, Spoolman or printer is involved.
// usage: node e2e/verify-artifact.mjs <dist/index.html> <hostmock.js> <outDir>
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { delay, evaluate, openBrowser, waitFor } from "./cdp.mjs";

const [, , html, hostmock, out] = process.argv;
await mkdir(out, { recursive: true });
const inject = await readFile(hostmock, "utf8");
const b = await openBrowser();
try {
const { call, on } = b;
const problems = [];
on((m) => {
  if (m.method === "Runtime.exceptionThrown") problems.push("exception: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) problems.push("console." + m.params.type + ": " + m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300));
  if (m.method === "Log.entryAdded" && ["error", "warning"].includes(m.params.entry.level)) problems.push("log." + m.params.entry.level + ": " + m.params.entry.text + " " + (m.params.entry.url ?? ""));
});
await call("Page.enable"); await call("Runtime.enable"); await call("Log.enable");
await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
const results = [];
const run = async (theme, lang, w, h, dpr, label) => {
  await call("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  const prev = await call("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.clear(); } catch {} new MutationObserver((_, o) => { if (document.documentElement) { document.documentElement.setAttribute("data-orca-theme", "${theme}"); o.disconnect(); } }).observe(document, { childList: true }); ${inject}\nwindow.__opcInstall("ok");` });
  const before = problems.length;
  await call("Page.navigate", { url: pathToFileURL(html).href });
  const r = { label, theme, lang, w, dpr, steps: {} };
  await waitFor(call, "document.querySelector('[data-price-panel]')");
  await delay(400);
  if (lang === "pt-BR") { // the language lives in Settings > Language; the same path a user takes
    await evaluate(call, `document.querySelector('[role=tab][aria-label="Settings"]').click(); await new Promise(r => setTimeout(r, 300)); document.getElementById('settings-tab-language').click(); await new Promise(r => setTimeout(r, 300));`);
    await evaluate(call, `const c = [...document.querySelectorAll('[role=combobox]')][0]; c.closest('.p-select').click(); await new Promise(r => setTimeout(r, 300)); const o = [...document.querySelectorAll('[role=option]')].find(x => x.textContent.includes('Português')); o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await new Promise(r => setTimeout(r, 400));`);
    await evaluate(call, `document.querySelector('[role=tab][aria-label="Calculadora"]').click(); await new Promise(r => setTimeout(r, 500));`);
  }
  // CSP is enforced: runtime code generation must be refused
  // (Runtime.evaluate skips the page CSP unless allowUnsafeEvalBlockedByCSP is false, so this probe sets it)
  const probe = await call("Runtime.evaluate", { allowUnsafeEvalBlockedByCSP: false, returnByValue: true, expression: `(() => { try { new Function("return 1")(); return "ALLOWED"; } catch (e) { return e.name + ": " + e.message.slice(0, 80); } })()` });
  r.steps.cspBlocksEval = probe.exceptionDetails ? "blocked at compile: " + (probe.exceptionDetails.exception?.description ?? "").slice(0, 100) : probe.result.value;
  r.steps.cspMeta = await evaluate(call, `return document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? null;`);
  r.steps.initial = await evaluate(call, `const root = document.documentElement; const btn = document.querySelector('.p-button-primary, #qa-save'); const cs = btn ? getComputedStyle(btn) : null;
    return { dark: root.classList.contains('orca-dark'), lang: root.lang, bodyFont: getComputedStyle(document.body).fontSize, primaryBg: cs?.backgroundColor, primaryColor: cs?.color, radius: cs?.borderRadius, overflowX: root.scrollWidth > innerWidth, primeControls: document.querySelectorAll('.p-button, .p-inputtext, .p-select, .p-checkbox, .p-tab').length, legacy: document.querySelectorAll('.btn, .seg-opt, select, textarea').length };`);
  await call("Page.captureScreenshot", { format: "png" }).then((s) => writeFile(`${out}/${label}-calc.png`, Buffer.from(s.data, "base64")));
  // views through the real tabs
  const tabNames = lang === "pt-BR" ? ["Orçamentos", "Extras e estoque", "Ajustes", "Calculadora"] : ["Quotes", "Extras and stock", "Settings", "Calculator"];
  for (const n of tabNames) {
    await evaluate(call, `document.querySelector('[role=tab][aria-label="${n}"]').click(); await new Promise(r => setTimeout(r, 400));`);
    r.steps["tab:" + n] = await evaluate(call, `return { selected: document.querySelector('[role=tab][aria-label="${n}"]').getAttribute('aria-selected'), titleFocused: document.activeElement?.hasAttribute('data-view-title') || document.activeElement?.tagName === 'MAIN', overflowX: document.documentElement.scrollWidth > innerWidth };`);
  }
  // help dialog: opens modal, Esc closes, focus returns to the ? button
  r.steps.help = await evaluate(call, `const btn = document.querySelector('[data-testid=help-open]'); btn.focus(); btn.click(); await new Promise(r => setTimeout(r, 500));
    const d = document.querySelector('[role=dialog]'); const opened = !!d && d.getAttribute('aria-modal') === 'true';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); (d?.querySelector('button[aria-label]'))?.focus(); d?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); await new Promise(r => setTimeout(r, 600));
    return { opened, closed: !document.querySelector('[role=dialog]'), focusBack: document.activeElement === btn };`);
  // channel select (PrimeVue Select) changes the channel
  r.steps.select = await evaluate(call, `const c = document.querySelector('#price .p-select, .p-select'); c.click(); await new Promise(r => setTimeout(r, 300)); const opts = [...document.querySelectorAll('[role=option]')]; const labels = opts.map(o => o.textContent.trim()); opts[opts.length - 1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await new Promise(r => setTimeout(r, 400)); return { labels, now: document.querySelector('.p-select [role=combobox]').textContent.trim() };`);
  // save a quote through the real bridge and see the confirmation
  r.steps.save = await evaluate(call, `document.getElementById('qa-save').click(); await new Promise(r => setTimeout(r, 900)); return { text: document.querySelector('.qa')?.textContent.replace(/\\s+/g, ' ').slice(0, 160), toast: !!document.querySelector('.toast-host .p-message') };`);
  // extras menu (PrimeVue Menu) adds a custom row
  r.steps.extras = await evaluate(call, `const sec = document.querySelector('[data-section=extras] .sec-btn'); if (sec.getAttribute('aria-expanded') !== 'true') sec.click(); await new Promise(r => setTimeout(r, 400));
    document.querySelector('[aria-controls=extras-menu]').click(); await new Promise(r => setTimeout(r, 400)); const items = [...document.querySelectorAll('[role=menuitem] .mi')]; const n = items.length; items[items.length - 1].click(); await new Promise(r => setTimeout(r, 500));
    return { menuItems: n, rows: document.querySelectorAll('[data-extra-name]').length, focusOnName: document.activeElement?.hasAttribute('data-extra-name') };`);
  await call("Page.captureScreenshot", { format: "png" }).then((s) => writeFile(`${out}/${label}-after.png`, Buffer.from(s.data, "base64")));
  r.problems = problems.slice(before);
  results.push(r);
  await call("Page.removeScriptToEvaluateOnNewDocument", { identifier: prev.identifier });
  console.log(label, JSON.stringify(r.steps.initial), "problems:", r.problems.length);
};
await run("light", "pt-BR", 1280, 900, 1, "prod-light-ptBR-1280");
await run("dark", "en", 720, 900, 1, "prod-dark-en-720");
await run("light", "en", 640, 450, 2, "prod-light-en-zoom200");
await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));

for (const result of results) {
  assert.deepEqual(result.problems, [], result.label);
  const s = result.steps;
  assert.match(s.cspBlocksEval, /EvalError|blocked/);
  assert(!s.initial.overflowX && s.initial.legacy === 0);
  assert(s.help.opened && s.help.closed && s.help.focusBack);
  assert(s.save.toast && s.extras.focusOnName);
  for (const [name, state] of Object.entries(s)) if (name.startsWith("tab:")) {
    assert(state.selected === 'true' && state.titleFocused && !state.overflowX, `${result.label}: ${name} navigation/focus failed`);
  }
}

} finally { await b.close(); }
