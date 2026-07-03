#!/usr/bin/env node
/**
 * Copy NSIS installer scripts for venv unpack + Python install.
 * Additionally bundles the `tar` npm module into unpack-python-venv-parallel.cjs
 * via esbuild so the packaged script is fully self-contained (no node_modules needed).
 */
import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const scriptsSrc = join(ROOT, "resources/installer/scripts");
const scriptsDest = join(ROOT, "packages/shell/resources/installer-scripts");

const scriptFiles = [
  "unpack-nanobot.cjs",
  "install-python.cjs",
];

mkdirSync(scriptsDest, { recursive: true });
for (const file of scriptFiles) {
  const src = join(scriptsSrc, file);
  if (existsSync(src)) {
    copyFileSync(src, join(scriptsDest, file));
  }
}

// Bundle unpack-python-venv-parallel.cjs with the `tar` npm module inlined
// so it doesn't need node_modules at runtime. Falls back to tar.exe when
// available, but has a working JS tar extractor when tar.exe fails (e.g.
// Permission denied under Program Files).
const unpackSrc = join(scriptsSrc, "unpack-python-venv-parallel.cjs");
if (existsSync(unpackSrc)) {
  const { buildSync } = await import("esbuild");
  const unpackDest = join(scriptsDest, "unpack-python-venv-parallel.cjs");
  buildSync({
    entryPoints: [unpackSrc],
    outfile: unpackDest,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    external: [
      "node:*",
      "worker_threads",
    ],
    minify: false,
    sourcemap: false,
  });
  console.log("[bundle-installer-scripts] bundled unpack-python-venv-parallel.cjs with tar module →", unpackDest);
}

// Copy tar module for worker-thread fallback (kept for reference; bundled version is primary)
const tarSrc = join(scriptsSrc, "node_modules");
if (existsSync(tarSrc)) {
  cpSync(tarSrc, join(scriptsDest, "node_modules"), { recursive: true });
}

console.log("[bundle-installer-scripts] OK →", scriptsDest);
