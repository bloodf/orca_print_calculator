// @vitest-environment node
// The shipped single file: its CSP meta must come before the first script, and the policy must be the exact one we mean.
import { describe, expect, test } from "vitest";
import { build } from "vite";

type Out = { output: { fileName: string; type: string; source?: unknown }[] };
async function built(): Promise<string> {
  // Vitest sets NODE_ENV=test, which would build Vue's development flavour: build as `vite build` does.
  const was = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  let r: Out | Out[];
  try {
    r = (await build({ configFile: "vite.config.ts", mode: "production", logLevel: "silent", build: { write: false } })) as Out | Out[];
  } finally {
    process.env.NODE_ENV = was;
  }
  const out = Array.isArray(r) ? r[0]! : r;
  const page = out.output.find((o) => o.fileName === "index.html");
  expect(page?.type).toBe("asset");
  return String(page!.source);
}

/** 387,010 B before the Vue + PrimeVue migration; 877 kB after (Vue Options API, PrimeVue components, the shared Aura preset). The CI gate uses the same figure. */
const BUDGET = 900_000;

describe("built index.html", () => {
  test("carries the CSP meta, before the first <script", async () => {
    const html = await built();
    const csp = html.indexOf('http-equiv="Content-Security-Policy"');
    expect(csp > -1).toBe(true);
    expect(csp < html.indexOf("<script")).toBe(true);
    expect(html.includes("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'")).toBe(true);
  }, 60_000);
  test("is one self-contained file: no external script, style or image reference", async () => {
    const html = await built();
    expect(/<script[^>]+src=/.test(html)).toBe(false);
    expect(/<link[^>]+rel="stylesheet"/.test(html)).toBe(false);
    expect(/https?:\/\/(?!www\.w3\.org)[^"'\s)]+\.(png|jpg|svg|css|js)/.test(html)).toBe(false);
  }, 60_000);
  test("does not rewrite scope ids behind our back (data-v ids are the framework's own 8 hex digits)", async () => {
    const html = await built();
    expect(/data-v-[0-9a-f]{8}/.test(html)).toBe(true);
  }, 60_000);
  test("stays within the measured budget and ships neither the dev mock host nor runtime code generation", async () => {
    const html = await built();
    expect(new TextEncoder().encode(html).length).toBeLessThanOrEqual(BUDGET);
    expect(html.includes("Desk organizer")).toBe(false); // a mock fixture string: the dev host is tree-shaken out
    expect(/\bnew Function\(|[^.\w]eval\(/.test(html)).toBe(false); // the CSP has no 'unsafe-eval'
  }, 60_000);
  test("PrimeVue's Options API path is compiled in (its components are Options API objects)", async () => {
    const html = await built();
    expect(html.includes("pcTabs") || html.includes("$pcTabs")).toBe(true); // PrimeVue's own injection keys are in the bundle: it was bundled, not stubbed
  }, 60_000);
});
