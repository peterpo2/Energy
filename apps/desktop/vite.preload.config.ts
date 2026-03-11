import { builtinModules } from "node:module";
import path from "node:path";
import { defineConfig } from "vite";

const external = [
  "electron",
  ...builtinModules,
  ...builtinModules.map((mod) => `node:${mod}`),
];

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
  build: {
    outDir: "dist-electron/preload",
    emptyOutDir: false,
    sourcemap: true,
    target: "node20",
    lib: {
      entry: path.resolve(__dirname, "src/preload/index.ts"),
      formats: ["cjs"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external,
      output: {
        entryFileNames: "index.js",
      },
    },
  },
});
