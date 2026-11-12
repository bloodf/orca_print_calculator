import { defineConfig } from "vite";
export default defineConfig({
  root: new URL("..", import.meta.url).pathname,
  build: { outDir: process.env.HOSTMOCK_OUT, emptyOutDir: true, minify: false, lib: { entry: "e2e/hostmock.entry.ts", formats: ["iife"], name: "opcHostMock", fileName: () => "hostmock.js" } },
});
