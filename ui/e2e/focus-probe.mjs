// Real-browser check that keyboard focus is visible on every PrimeVue severity the plugin uses (the 2.0.0 preset hid it on
// secondary/info/success/warn). Tabs through the production artifact and measures the focus outline of each button kind.
// usage: node e2e/focus-probe.mjs <dist/index.html> <hostmock.js> <outFile>
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { delay, evaluate, openBrowser, waitFor } from "./cdp.mjs";

const [, , html, hostmock, outFile] = process.argv;
const inject = await readFile(hostmock, "utf8");
const b = await openBrowser();
try {
const { call } = b;
await call("Page.enable"); await call("Runtime.enable");
const results = [];
for (const [theme, reduce] of [["light", false], ["dark", false], ["dark", true]]) {
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }] });
  const id = await call("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.clear(); } catch {} new MutationObserver((_, o) => { if (document.documentElement) { document.documentElement.setAttribute("data-orca-theme", "${theme}"); o.disconnect(); } }).observe(document, { childList: true }); ${inject}\nwindow.__opcInstall("ok");` });
  await call("Page.navigate", { url: pathToFileURL(html).href });
  await waitFor(call, "document.querySelector('[data-price-panel]')");
  await delay(500);
  const seen = {};
  for (let i = 0; i < 60; i++) {
    for (const type of ["keyDown", "keyUp"]) await call("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await delay(260); // the outline colour transitions in (0.15 s) unless reduced motion is on
    const f = await evaluate(call, `const e = document.activeElement; if (!e || !e.matches(':focus-visible')) return null; const cs = getComputedStyle(e); const kind = [...e.classList].filter(c => /^p-button-(secondary|info|success|warn|danger)$|^p-button$|^p-tab$|^p-inputtext$|^p-select-label$/.test(c)).join('.') || e.tagName; return { kind, outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, shadow: cs.boxShadow !== 'none', text: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24) };`);
    if (f && !seen[f.kind]) seen[f.kind] = f;
  }
  const motion = await evaluate(call, `const el = document.querySelector('.p-button'); const cs = getComputedStyle(el); return { transitionDuration: cs.transitionDuration, matches: matchMedia('(prefers-reduced-motion: reduce)').matches };`);
  results.push({ theme, reduce, seen, motion });
  console.log(theme, reduce ? "reduced-motion" : "", JSON.stringify(Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, `${v.outlineStyle} ${v.outlineWidth} ${v.outlineColor}`]))), JSON.stringify(motion));
  await call("Page.removeScriptToEvaluateOnNewDocument", { identifier: id.identifier });
}
await writeFile(outFile, JSON.stringify(results, null, 2));


} finally { await b.close(); }
