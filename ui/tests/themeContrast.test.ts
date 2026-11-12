// @vitest-environment node
// X01 / B-25: contrast of the colours the plugin shows, computed from the shared palette (ui/shared/src/palette.json) through the
// --opc-* aliases in theme.css. Nothing here is a claim about native Orca rendering or WCAG compliance as a whole.
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");
const palette = JSON.parse(readFileSync(new URL("../shared/src/palette.json", import.meta.url), "utf8")) as Record<"light" | "dark", Record<string, string>>;
const rootBlock = css.slice(css.indexOf(":root {")).match(/\{([^}]*)\}/)![1]!;
const camel = (kebab: string): string => kebab.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
/** --opc-x -> palette key, following one alias hop at most (--opc-accent-text: var(--opc-primary-bg)). */
function key(name: string, seen = 0): string {
  const m = new RegExp(`--${name}:\\s*var\\(--(oui|opc)-([\\w-]+)`).exec(rootBlock);
  if (!m) throw new Error(`--${name} is not an alias of the shared palette`);
  if (m[1] === "oui") return camel(m[2]!);
  if (seen > 2) throw new Error(`alias loop at ${name}`);
  return key(`opc-${m[2]}`, seen + 1);
}
const colour = (theme: "light" | "dark", name: string): string => palette[theme][key(name)]!;
const lum = (h: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

describe("own tokens meet 4.5:1 for text, from the shared palette", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: primary action label, and text colours on the page and on panels`, () => {
      expect(ratio(colour(theme, "opc-on-primary"), colour(theme, "opc-primary-bg")), "on-primary / primary").toBeGreaterThanOrEqual(4.5);
      for (const bg of ["opc-bg", "opc-raised"]) {
        for (const n of ["opc-accent-text", "opc-muted", "opc-price", "opc-warn", "opc-bad", "opc-fg", "opc-ok"]) {
          expect(ratio(colour(theme, n), colour(theme, bg)), `${theme}: ${n} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
    test(`${theme}: status text on its own tinted background`, () => {
      expect(ratio(colour(theme, "opc-warn"), colour(theme, "opc-warn-bg")), "warn").toBeGreaterThanOrEqual(4.5);
      expect(ratio(colour(theme, "opc-bad"), colour(theme, "opc-bad-bg")), "bad").toBeGreaterThanOrEqual(4.5);
      expect(ratio(colour(theme, "opc-ok"), colour(theme, "opc-ok-bg")), "ok").toBeGreaterThanOrEqual(4.5);
    });
  }
  test("no colour is written as a literal in the plugin's own tokens: every one is an alias of the shared palette", () => {
    for (const m of rootBlock.matchAll(/--(opc-(?:bg|raised|fg|muted|border|primary-bg|on-primary|ok|warn|bad|warn-bg|bad-bg|ok-bg))\s*:\s*([^;]+);/g)) {
      expect(m[2], m[1]).toMatch(/^var\(--(oui|opc)-/);
    }
  });
  test("the primary background is the palette's own, so a host accent cannot lower the pair", () => {
    expect(key("opc-primary-bg")).toBe("primary");
    expect(key("opc-on-primary")).toBe("onPrimary");
    expect(css).not.toMatch(/var\(--orca-/);
  });
});

describe("forced colors and checkbox accent", () => {
  test("focus and the current tab get system-colour styles of their own (box-shadow and fills are dropped there)", () => {
    const fc = css.slice(css.indexOf("@media (forced-colors: active)"));
    expect(fc).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid CanvasText/);
    expect(fc).toMatch(/\.p-tab-active[^{]*\{[^}]*Highlight/);
    expect(fc).toMatch(/\.seg-opt\[aria-checked="true"\][^{]*\{[^}]*Highlight/);
  });
  test("native controls that remain (none are checkboxes) follow the shared accent", () => {
    expect(readFileSync(new URL("../shared/src/base.css", import.meta.url), "utf8")).toMatch(/accent-color:\s*var\(--p-primary-color\)/);
  });
  test("reduced motion lives in the shared base.css (universal, over PrimeVue's runtime styles); theme.css keeps no copy", () => {
    expect(readFileSync(new URL("../shared/src/base.css", import.meta.url), "utf8")).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.orca-ui \*/);
    expect(css).not.toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*/);
  });
});
