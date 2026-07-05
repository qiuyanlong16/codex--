#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
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
