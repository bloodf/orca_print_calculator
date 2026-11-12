// MOCK screenshots + DOM/overflow/console measurements of a built single-file page (harness build with the mock host).
// usage: node e2e/shoot.mjs <index.html> <outDir> [filter]
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { delay, evaluate, openBrowser, waitFor } from "./cdp.mjs";

const [, , html, out, filter = ""] = process.argv;
await mkdir(out, { recursive: true });
const base = pathToFileURL(html).href;
const click = (sel, text) => `const els = [...document.querySelectorAll(${JSON.stringify(sel)})]; const el = ${text ? `els.find(e => e.textContent.trim().includes(${JSON.stringify(text)}))` : "els[0]"}; if (!el) throw new Error("no " + ${JSON.stringify(sel + " " + (text ?? ""))}); el.click(); await new Promise(r => setTimeout(r, 450)); return true;`;
// widths: wide 1280x900, narrow 720x900, zoom200 = 640x450 css px at DPR 2 (a 1280 px window at 200% zoom)
const VIEWPORTS = { w1280: [1280, 900, 1], w720: [720, 900, 1], z200: [640, 450, 2] };
const RUNS = [
  { n: "calc-ok", q: "state=ok", ready: "document.querySelector('[data-price-panel]')" },
  { n: "calc-unknown", q: "state=unknown", ready: "document.querySelector('[data-testid=incomplete-line]')" },
  { n: "calc-impossible", q: "state=impossible", ready: "document.querySelector('[data-testid=hero-impossible]')" },
  { n: "calc-firstrun", q: "state=firstRun", ready: "document.querySelector('.fr')" },
  { n: "calc-empty", q: "state=empty", ready: "document.querySelector('.p-button')" },
  { n: "calc-saved", q: "state=savedQuote", ready: "document.querySelector('[data-quote-banner]')" },
  { n: "calc-undo", q: "state=savedQuote&act=closeDirty", ready: "document.querySelector('.toast-host .p-message')" },
  { n: "calc-offline", q: "state=offline", ready: "document.querySelector('[data-spoolman-offline]')" },
  { n: "calc-loading", q: "state=loading", ready: "document.querySelector('header')" },
  { n: "error", q: "state=hostError", ready: "document.querySelector('.host-error')" },
  { n: "quotes", q: "state=ok&view=quotes", ready: "document.querySelector('#quotes-title')" },
  { n: "stock", q: "state=ok&view=stock", ready: "document.querySelector('[data-testid=filament-table]')" },
  { n: "stock-offline", q: "state=offline&view=stock", ready: "document.querySelector('[data-stock-offline]')" },
  { n: "settings", q: "state=ok&view=settings", ready: "document.querySelector('[role=tabpanel]')" },
  { n: "settings-sheet", q: "state=ok&view=settings", ready: "document.querySelector('[role=tabpanel]')", steps: [click("#settings-tab-sheet")] },
  { n: "dialog-help", q: "state=ok", ready: "document.querySelector('[data-testid=help-open]')", steps: [click("[data-testid=help-open]")] },
  { n: "popover-printer", q: "state=ok", ready: "document.querySelector('header .chip')", steps: [click("header [aria-haspopup=dialog].chip")] },
  { n: "menu-extras", q: "state=ok", ready: "document.querySelector('[data-section=extras]')", steps: [`const b = document.querySelector('[data-section=extras] .sec-btn'); if (b.getAttribute('aria-expanded') !== 'true') b.click(); await new Promise(r => setTimeout(r, 400)); return true;`, click("[aria-controls=extras-menu]")] },
  { n: "picker-spool", q: "state=ok", ready: "document.querySelector('.card .chip')", steps: [click(".card .chip"), click(".mrow .actions button")] },
];
const SETS = [["light", "pt-BR", "w1280"], ["dark", "en", "w1280"], ["light", "en", "w720"], ["dark", "pt-BR", "w720"], ["light", "pt-BR", "z200"], ["dark", "en", "z200"]];
const b = await openBrowser();
try {
const { call, on } = b;
const problems = [];
on((m) => {
  if (m.method === "Runtime.exceptionThrown") problems.push({ kind: "exception", text: m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text });
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) problems.push({ kind: "console." + m.params.type, text: m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 400) });
  if (m.method === "Log.entryAdded" && ["error", "warning"].includes(m.params.entry.level)) problems.push({ kind: "log." + m.params.entry.level, text: m.params.entry.text + " " + (m.params.entry.url ?? "") });
});
await call("Page.enable"); await call("Runtime.enable"); await call("Log.enable");
await call("Page.addScriptToEvaluateOnNewDocument", { source: "try { localStorage.clear(); sessionStorage.clear(); } catch {}" }); // every run starts from the mock's own state
await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }); // no half-finished animations in captures
const results = [];
for (const run of RUNS) for (const [theme, lang, vp] of SETS) {
  const id = `${run.n}__${theme}-${lang}-${vp}`;
  if (filter && !id.includes(filter)) continue;
  const [w, h, dpr] = VIEWPORTS[vp];
  await call("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  const before = problems.length;
  await call("Page.navigate", { url: `${base}?${run.q}&theme=${theme}&lang=${lang}&bar=0` });
  let status = "ok", note = "";
  try {
    await delay(150);
    await waitFor(call, run.ready);
    await delay(500);
    for (const s of run.steps ?? []) { try { await evaluate(call, s); } catch (e) { if (!run.soft) throw e; note += " step:" + String(e.message).slice(0, 60); } }
    await delay(350);
  } catch (e) { status = "FAIL"; note = String(e.message).slice(0, 160); }
  const m = await evaluate(call, `const cs = (e) => e ? getComputedStyle(e) : null; const btn = document.querySelector('.p-button'); const root = document.documentElement;
    return { overflowX: root.scrollWidth > innerWidth, scrollWidth: root.scrollWidth, innerWidth, dark: root.classList.contains('orca-dark'), lang: root.lang,
      bodyFont: cs(document.body).fontSize, btnRadius: btn ? cs(btn).borderRadius : null, btnBg: btn ? cs(btn).backgroundColor : null, pv: document.querySelectorAll('[class*=p-]').length,
      clipped: [...document.querySelectorAll('header *, .p-tab, .p-button')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).map(e => (e.className?.toString?.() ?? '').slice(0, 40)).slice(0, 5) };`);
  const shot = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(`${out}/${id}.png`, Buffer.from(shot.data, "base64"));
  results.push({ id, status, note, ...m, problems: problems.slice(before) });
  console.log(id, status, m.overflowX ? "OVERFLOW" : "", m.clipped.length ? "CLIPPED " + m.clipped.join("|") : "", problems.length - before ? `problems=${problems.length - before}` : "", note);
}
await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));


} finally { await b.close(); }
