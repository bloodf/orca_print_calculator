// MOCK screenshots for the store images and the README: the harness build with the mock host and its sample data,
// in headless Chrome. Nothing here talks to OrcaSlicer, Spoolman or a printer.
// usage: node e2e/brand-shots.mjs <harness index.html> <outDir> [filter]
// The harness build: NODE_ENV=development pnpm exec vite build --mode development --outDir <dir>
// scripts/brand_assets.py puts the "slot" captures into the empty square of each generated image.
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { delay, evaluate, openBrowser, waitFor } from "./cdp.mjs";

const [, , html, out, filter = ""] = process.argv;
await mkdir(out, { recursive: true });
const base = pathToFileURL(html).href;
const wait = "await new Promise(r => setTimeout(r, 450));";
const click = (sel) => `const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error("no " + ${JSON.stringify(sel)}); el.click(); ${wait}`;
const open = (section) => `const b = document.querySelector('[data-section=${section}] .sec-btn, [data-section=${section}] [aria-expanded]'); if (!b) throw new Error("no section ${section}"); if (b.getAttribute('aria-expanded') !== 'true') b.click(); ${wait}`;
// scrolls an element to just under the app bar, which stays at the top of the window
const top = (sel, gap = 12) => `const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error("no " + ${JSON.stringify(sel)}); const bar = document.querySelector("header").getBoundingClientRect().bottom; window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - bar - ${gap}); ${wait}`;
const PRICE = "document.querySelector('[data-price-panel]')";

// height / width of the empty square in the generated images (measured from their pixels): landscape, square, social
const SLOT = { land: 686 / 712, square: 490 / 494, social: 661 / 666 };
const BOTH = [["dark", "en"], ["dark", "pt-BR"]];
const ALL = [...BOTH, ["light", "en"], ["light", "pt-BR"]];
const SHOTS = [
  // slot captures: a narrow window, so the text stays readable inside the square (under 560 px the tab row is cut, under 640 the names)
  { n: "slot-overview", q: "state=ok", ready: PRICE, w: 640, slot: "land", sets: ALL, steps: [click(".card .chip")] },
  { n: "slot-overview-social", q: "state=ok", ready: PRICE, w: 640, slot: "social", sets: BOTH, steps: [click(".card .chip")] },
  { n: "slot-filament", q: "state=ok", ready: PRICE, w: 640, slot: "land", sets: BOTH, steps: [click(".card .chip")] },
  { n: "slot-costs", q: "state=ok", ready: PRICE, w: 640, slot: "land", sets: BOTH, steps: [open("machine"), top(".sections-area")] },
  { n: "slot-price", q: "state=ok", ready: PRICE, w: 640, slot: "land", sets: BOTH, steps: [top("[data-price-panel]")] },
  { n: "slot-price-square", q: "state=ok", ready: PRICE, w: 560, slot: "square", sets: BOTH, steps: [top("[data-price-panel]")] },
  { n: "slot-quotes", q: "state=ok&view=quotes", ready: "document.querySelector('#quotes-title')", w: 560, slot: "land", sets: BOTH, steps: [click("tbody tr:last-child .acts [aria-haspopup=menu]")] },
  // README screenshots: the wide layout (1440 px keeps the names whole in Portuguese too)
  { n: "calculator", q: "state=ok", ready: PRICE, w: 1440, h: 900, sets: ALL, steps: [click(".card .chip")] },
  { n: "quotes", q: "state=ok&view=quotes", ready: "document.querySelector('#quotes-title')", w: 1440, h: 440, sets: ALL },
];

const b = await openBrowser();
let failed = 0;
try {
  const { call } = b;
  await call("Page.enable"); await call("Runtime.enable");
  await call("Page.addScriptToEvaluateOnNewDocument", { source: "try { localStorage.clear(); sessionStorage.clear(); } catch {}" });
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  for (const s of SHOTS) for (const [theme, lang] of s.sets) {
    const id = `${s.n}-${theme}-${lang}`;
    if (filter && !id.includes(filter)) continue;
    const h = s.h ?? Math.round(s.w * SLOT[s.slot]);
    await call("Emulation.setDeviceMetricsOverride", { width: s.w, height: h, deviceScaleFactor: 2, mobile: false });
    await call("Page.navigate", { url: `${base}?${s.q}&theme=${theme}&lang=${lang}&bar=0` });
    await delay(150);
    await waitFor(call, s.ready);
    await delay(500);
    for (const step of s.steps ?? []) await evaluate(call, step);
    await delay(350);
    const m = await evaluate(call, `const r = document.documentElement; return { overflowX: r.scrollWidth > innerWidth, dark: r.classList.contains('orca-dark'), lang: r.lang };`);
    const ok = !m.overflowX && m.dark === (theme === "dark") && m.lang === lang;
    if (!ok) failed++;
    const shot = await call("Page.captureScreenshot", { format: "png" });
    await writeFile(`${out}/${id}.png`, Buffer.from(shot.data, "base64"));
    console.log(id, `${s.w}x${h}@2`, ok ? "ok" : "CHECK " + JSON.stringify(m));
  }
} finally { await b.close(); }
if (failed) { console.error(`${failed} capture(s) need a look`); process.exit(1); }
