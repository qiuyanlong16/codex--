#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const electronCache = path.resolve(process.env.ELECTRON_CACHE ?? ".cache/electron");
const builderCache = path.resolve(process.env.ELECTRON_BUILDER_CACHE ?? ".cache/electron-builder");
const builderMirror =
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR ??
  "https://npmmirror.com/mirrors/electron-builder-binaries/";
const electronMirror = process.env.ELECTRON_MIRROR ?? "https://npmmirror.com/mirrors/electron/";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("node", ["scripts/build/bundle-installer-scripts.mjs"]);
if (process.env.BYCLAW_PACK_SKIP_PYTHON !== "1") {
  run("node", ["scripts/build/fetch-installer-python.mjs"]);
}
if (process.env.BYCLAW_PACK_SKIP_NANOBOT !== "1") {
  run("node", ["scripts/build/stage-nanobot-bundle.mjs"]);
}

try {
  rmSync(path.join(repoRoot, "dist-release"), { recursive: true, force: true });
} catch {
  // ignore
}

run("node", ["scripts/build/prefetch-electron.mjs"], {
  ELECTRON_CACHE: electronCache,
  ELECTRON_MIRROR: electronMirror,
  ELECTRON_PLATFORM: "win32",
  ELECTRON_ARCH: "x64",
});

run("node", ["scripts/build/prepare-electron-native-deps.mjs"]);

run(
  npx,
  [
    "--yes",
    "pnpm@9.15.4",
    "exec",
    "electron-builder",
    "--win",
    "--x64",
    "--config",
    "electron-builder.yml",
  ],
  {
    ELECTRON_CACHE: electronCache,
    ELECTRON_BUILDER_CACHE: builderCache,
    ELECTRON_MIRROR: electronMirror,
    ELECTRON_BUILDER_BINARIES_MIRROR: builderMirror,
  },
);

console.log("[bundle:cached] complete");
