import { builtinModules } from "node:module";
import path from "node:path";
import { defineConfig } from "vite";

const external = [
  "electron",
  "better-sqlite3",
  "xlsx",
  ...builtinModules,
  ...builtinModules.map((mod) => `node:${mod}`),
];

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../../packages/shared/src"),
      "@persistence": path.resolve(__dirname, "../../packages/persistence/src"),
      "@ingestion": path.resolve(__dirname, "../../packages/ingestion/src"),
      "@analytics": path.resolve(__dirname, "../../packages/analytics/src"),
      "@export": path.resolve(__dirname, "../../packages/export/src"),
    },
  },
  build: {
    outDir: "dist-electron/main",
    emptyOutDir: false,
    sourcemap: true,
    target: "node20",
    lib: {
      entry: path.resolve(__dirname, "src/main/index.ts"),
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
