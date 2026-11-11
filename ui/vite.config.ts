import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

// The shipped single file may run only its own inline script and style, show data: images and talk to nothing.
// Build only: the dev server needs /@vite/client and a websocket, which this policy forbids.
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'";
const csp = (): Plugin => ({
  name: "opc-csp",
  apply: "build",
  transformIndexHtml: {
    order: "post",
    handler(html) {
      // Fail the build, never ship without the policy: a changed <head> tag must not turn this into a silent no-op.
      if (!/<head[\s>]/.test(html)) throw new Error("opc-csp: no <head> in index.html, cannot add the Content-Security-Policy");
      return html.replace(/<head([^>]*)>/, `<head$1>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  },
});

export default defineConfig({
  plugins: [vue(), viteSingleFile(), csp()],
  // Every SFC is <script setup> (no options API), and the plugin ships as a single file with no devtools: switch those Vue paths off.
  define: { __VUE_OPTIONS_API__: false, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  build: { target: "safari14" },
  test: { environment: "jsdom", include: ["tests/**/*.test.ts"], coverage: {
      // The whole app layer, not just the engine. Excluded: the dev harness, pure data (strings, icon paths, types), the entry file.
      include: ["src/**/*.ts", "src/**/*.vue"],
      exclude: ["src/mock/**", "src/i18n/messages.ts", "src/components/base/icons.ts", "src/state/types.ts", "src/main.ts", "src/env.d.ts"],
      reporter: ["text-summary", "text"],
      thresholds: { branches: 80, lines: 85 },
    } },
});
