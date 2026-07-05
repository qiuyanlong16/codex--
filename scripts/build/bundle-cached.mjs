#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { rmSync } from "node:fs";
import path from "node:path";
import { resolveTargetArch, resolveTargetPlatform, isWindowsTarget } from "./lib/platform.mjs";

const repoRoot = process.cwd();
const targetPlatform = resolveTargetPlatform();
const targetArch = resolveTargetArch();
const electronCache = path.resolve(process.env.ELECTRON_CACHE ?? ".cache/electron");
const builderCache = path.resolve(process.env.ELECTRON_BUILDER_CACHE ?? ".cache/electron-builder");
const builderMirror =
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR ??
  "https://npmmirror.com/mirrors/electron-builder-binaries/";
const electronMirror = process.env.ELECTRON_MIRROR ?? "https://npmmirror.com/mirrors/electron/";

function electronBuilderArgs() {
  if (targetPlatform === "darwin") {
    return ["--mac", `--${targetArch}`];
  }
  if (targetPlatform === "linux") {
    return ["--linux", `--${targetArch}`];
  }
  return ["--win", `--${targetArch}`];
}

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/**
 * Copy packages/web/dist/ into the venv's nanobot/web/dist/ so the gateway
 * serves the built webui when it starts. Runs during bundle, after both
 * the webui build and the venv creation are complete.
 */
function copyWebuiDistToVenv() {
  const webDistSrc = path.join(repoRoot, "packages", "web", "dist");
  if (!fs.existsSync(webDistSrc)) {
    console.log("[bundle:cached] webui dist not found, skipping copy");
    return;
  }

  // Find the venv (could be at python-venv or the old python location)
  const venvRoots = [
    path.join(repoRoot, "packages", "shell", "resources", "python-venv"),
    path.join(repoRoot, "packages", "shell", "resources", "python"),
  ];

  for (const venvRoot of venvRoots) {
    if (!fs.existsSync(venvRoot)) continue;

    // Find nanobot package inside the venv's site-packages
    const sitePackages = findSitePackages(venvRoot);
    if (!sitePackages) continue;

    const dest = path.join(sitePackages, "nanobot", "web", "dist");
    console.log(`[bundle:cached] copying webui dist → ${dest}`);
    fs.rmSync(dest, { recursive: true, force: true });
    copyDirSync(webDistSrc, dest);
    console.log("[bundle:cached] webui dist copied OK");
    return;
  }

  console.log("[bundle:cached] no venv found for webui dist copy");
}

function findSitePackages(venvRoot) {
  // Windows: venvRoot/Lib/site-packages
  const winPath = path.join(venvRoot, "Lib", "site-packages");
  if (fs.existsSync(winPath)) return winPath;

  // Unix: venvRoot/lib/python3.X/site-packages
  const libDir = path.join(venvRoot, "lib");
  if (fs.existsSync(libDir)) {
    for (const entry of fs.readdirSync(libDir)) {
      if (entry.startsWith("python")) {
        const sp = path.join(libDir, entry, "site-packages");
        if (fs.existsSync(sp)) return sp;
      }
    }
  }
  return null;
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

function assertBundleInputs() {
  const required = [
    "packages/shell/dist/main/index.js",
    "packages/shell/dist/preload/index.js",
    "packages/shell/resources/python-venv_manifest.json",
    "resources/icons/icon.png",
    "resources/icons/tray-icon.bmp",
  ];
  if (isWindowsTarget()) {
    required.push(
      "resources/icons/icon.ico",
      "resources/installer/wizard-sidebar.bmp",
      "resources/installer/wizard-banner.bmp",
    );
  }
  for (const rel of required) {
    const full = path.join(repoRoot, rel);
    if (!fs.existsSync(full)) {
      console.error(`[bundle:cached] missing required file: ${rel}`);
      process.exit(1);
    }
  }
  const tarShards = fs
    .readdirSync(path.join(repoRoot, "packages/shell/resources"))
    .filter((name) => /^python-venv_\d+\.tar$/.test(name));
  if (tarShards.length === 0) {
    console.error("[bundle:cached] no python-venv_*.tar shards found — run pack-python-venv.mjs first");
    process.exit(1);
  }
  console.log(`[bundle:cached] bundle inputs OK (${tarShards.length} venv shards)`);
}

run("node", ["scripts/build/bundle-installer-scripts.mjs"]);
// NOTE: fetch-installer-python.mjs removed — installer-python/ is not in
// electron-builder.yml extraResources and was never packaged. The venv tar
// shards (from pack-python-venv.mjs) are the sole Python delivery mechanism.
if (process.env.BYCLAW_PACK_SKIP_NANOBOT !== "1") {
  run("node", ["scripts/build/stage-nanobot-bundle.mjs"]);
}

// Copy webui dist to venv (if venv exists) so the gateway serves the built webui
copyWebuiDistToVenv();

try {
  rmSync(path.join(repoRoot, "dist-release"), { recursive: true, force: true });
} catch {
  // ignore
}

run("node", ["scripts/build/prefetch-electron.mjs"], {
  ELECTRON_CACHE: electronCache,
  ELECTRON_MIRROR: electronMirror,
  ELECTRON_PLATFORM: targetPlatform,
  ELECTRON_ARCH: targetArch,
});

run("node", ["scripts/build/prepare-electron-native-deps.mjs"]);
run("node", ["scripts/build/ensure-brand-icons.mjs"]);
assertBundleInputs();

const builderArgs = electronBuilderArgs();
if (process.env.CI === "true") {
  builderArgs.push("--publish", "never");
}
console.log(`[bundle:cached] electron-builder ${builderArgs.join(" ")} (platform=${targetPlatform})`);

const electronBuilderBin = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron-builder.cmd" : "electron-builder",
);

const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
run(
  fs.existsSync(electronBuilderBin) ? electronBuilderBin : pnpmCmd,
  fs.existsSync(electronBuilderBin)
    ? [...builderArgs, "--config", "electron-builder.yml"]
    : ["exec", "electron-builder", ...builderArgs, "--config", "electron-builder.yml"],
  {
    ELECTRON_CACHE: electronCache,
    ELECTRON_BUILDER_CACHE: builderCache,
    ELECTRON_MIRROR: electronMirror,
    ELECTRON_BUILDER_BINARIES_MIRROR: builderMirror,
  },
);

console.log("[bundle:cached] complete");
