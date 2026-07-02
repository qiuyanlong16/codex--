import { resolve } from "node:path";
import { defineConfig } from "vite";

const BUILD_DEFINES: Record<string, string> = {};
if (process.env.BYCLAW_BUILD_CHANNEL) {
  BUILD_DEFINES["process.env.BYCLAW_BUILD_CHANNEL"] = JSON.stringify(
    process.env.BYCLAW_BUILD_CHANNEL,
  );
}

const isWatch = process.argv.includes("--watch");

export default defineConfig({
  define: BUILD_DEFINES,
  build: {
    outDir: "dist/main",
    emptyOutDir: !isWatch,
    sourcemap: true,
    target: "node22",
    lib: {
      entry: resolve(__dirname, "src/main/index.ts"),
      formats: ["cjs"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: ["electron", "electron-log", "@byclaw-nanobot/shared", /^node:.*/],
    },
  },
});
