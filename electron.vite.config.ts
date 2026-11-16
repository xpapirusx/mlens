import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const root = import.meta.dirname;

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve(root, "src/shared"),
        "@main": resolve(root, "src/main"),
      },
    },
    build: {
      outDir: resolve(root, "out/main"),
      sourcemap: true,
      rollupOptions: {
        input: { index: resolve(root, "src/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve(root, "src/shared"),
      },
    },
    build: {
      outDir: resolve(root, "out/preload"),
      sourcemap: true,
      rollupOptions: {
        input: { index: resolve(root, "src/preload/index.ts") },
        output: { format: "cjs", entryFileNames: "index.cjs" },
      },
    },
  },
  renderer: {
    root: resolve(root, "src/renderer"),
    resolve: {
      alias: {
        "@renderer": resolve(root, "src/renderer"),
        "@shared": resolve(root, "src/shared"),
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      outDir: resolve(root, "out/renderer"),
      sourcemap: true,
      rollupOptions: {
        input: resolve(root, "src/renderer/index.html"),
      },
    },
  },
});
