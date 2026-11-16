// @vitest-environment node
// X01 / B-25: contrast of the colours the page shows. Since UI foundation 4.0 the page has no colour tokens of its own: it uses the
// shared --oui-* tokens with the lime accent (ui/src/orcaUi.ts), so the pairs below are read from the shared palette for that accent.
// Nothing here is a claim about native Orca rendering or WCAG compliance as a whole.
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app.css", import.meta.url), "utf8");
const orcaUi = readFileSync(new URL("../src/orcaUi.ts", import.meta.url), "utf8");
const palette = JSON.parse(readFileSync(new URL("../shared/src/palette.json", import.meta.url), "utf8")) as Record<"light" | "dark", Record<string, string>>;
const lum = (h: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

describe("the page's colours meet 4.5:1 for text, from the shared palette with the lime accent", () => {
  test("the accent the page installs is lime", () => {
    expect(orcaUi).toMatch(/installOrcaUI\(app, [^;]+, "lime"\);/);
  });
  for (const theme of ["light", "dark"] as const) {
    const c = (k: string): string => { const v = palette[theme][k]; if (!v) throw new Error(`no ${k} in the ${theme} palette`); return v; };
    test(`${theme}: primary action label, the app bar and the price band`, () => {
      expect(ratio(c("onLime"), c("lime")), "on-primary / primary").toBeGreaterThanOrEqual(4.5);
      expect(ratio(c("onBand"), c("limeBand")), "app bar and hero price on the band").toBeGreaterThanOrEqual(4.5);
    });
    test(`${theme}: text colours on the page, on panels and on raised rows`, () => {
      for (const bg of ["limeBackground", "limeSurface", "limeRaised"]) {
        for (const n of ["text", "muted", "lime", "warning", "danger", "success"]) expect(ratio(c(n), c(bg)), `${theme}: ${n} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    });
    test(`${theme}: status text on its own tinted background`, () => {
      expect(ratio(c("warning"), c("warningBg")), "warn").toBeGreaterThanOrEqual(4.5);
      expect(ratio(c("danger"), c("dangerBg")), "bad").toBeGreaterThanOrEqual(4.5);
      expect(ratio(c("success"), c("successBg")), "ok").toBeGreaterThanOrEqual(4.5);
    });
  }
  test("the primary background is the palette's own accent, so a host accent cannot lower the pair", () => {
    // the app installs the shared preset with the lime accent and writes no --oui-primary of its own anywhere in src
    const SOURCES = import.meta.glob("../src/**/*.{ts,vue,css}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    for (const [f, text] of Object.entries(SOURCES)) expect(text, f).not.toMatch(/--oui-primary\s*:|--p-primary-color\s*:/);
    expect(css).not.toMatch(/var\(--orca-/);
    for (const theme of ["light", "dark"] as const) expect(palette[theme].lime, theme).toMatch(/^#[0-9a-f]{6}$/i);
  });
  test("no colour is written as a literal in the page's own stylesheet: only shared tokens and system colours", () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|light-dark\(/i);
    expect(rules).not.toMatch(/var\(--orca-|--opc-/);
  });
});

describe("forced colors and checkbox accent", () => {
  test("focus and the current tab get system-colour styles of their own (box-shadow and fills are dropped there)", () => {
    const fc = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(fc).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid CanvasText/);
    expect(fc).toMatch(/\.oui-appbar-tab\[aria-selected="true"\][^{]*\{[^}]*Highlight/);
    expect(fc).toMatch(/\.seg-opt\[aria-checked="true"\][^{]*\{[^}]*Highlight/);
  });
  test("native controls that remain (none are checkboxes) follow the shared accent", () => {
    expect(readFileSync(new URL("../shared/src/base.css", import.meta.url), "utf8")).toMatch(/accent-color:\s*var\(--oui-primary\)/);
  });
  test("reduced motion lives in the shared base.css (universal, over PrimeVue's runtime styles); app.css keeps no copy", () => {
    expect(readFileSync(new URL("../shared/src/base.css", import.meta.url), "utf8")).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.orca-ui \*/);
    expect(css).not.toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*/);
  });
});
