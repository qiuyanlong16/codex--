import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist/preload",
    emptyOutDir: true,
    sourcemap: true,
    target: "node22",
    lib: {
      entry: resolve(__dirname, "src/preload/index.ts"),
      formats: ["cjs"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: ["electron"],
    },
  },
});
