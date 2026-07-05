#!/usr/bin/env node
/**
 * Full build pipeline — clones nanobot, builds everything, packs the venv,
 * and produces the final Electron installer.
 *
 * Correct order (each step depends on the previous):
 *   1. clone-nanobot       → vendor/nanobot/
 *   2. sync-webui           → packages/web/ (from vendor/nanobot/webui/)
 *   3. build:web            → packages/web/dist/
 *   4. build:shell          → packages/shell/dist/
 *   5. create-python-venv   → packages/shell/resources/python-venv/
 *   6. pack-python-venv     → packages/shell/resources/python-venv_*.tar
 *   7. bundle-cached        → dist-release/*.exe  (electron-builder)
 *
 * Usage:
 *   node scripts/build/build-all.mjs
 *
 * Env vars:
 *   BYCLAW_PACK_SKIP_CLONE=1    Skip nanobot clone (use existing vendor/)
 *   BYCLAW_PACK_SKIP_VENV=1     Skip venv create+pack (use existing tar shards)
 *   BYCLAW_PACK_SKIP_BUNDLE=1   Skip electron-builder (stop after packing)
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(cmd, args, opts = {}) {
  console.log(`\n▶ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...opts.env },
  });
  if (r.status !== 0) {
    console.error(`\n✘ Command failed: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

function pnpm(...args) {
  run("pnpm", args);
}

function node(script, opts) {
  run("node", [script], opts ?? {});
}

// ── 1. Clone nanobot ─────────────────────────────────────────────
if (process.env.BYCLAW_PACK_SKIP_CLONE !== "1") {
  node("scripts/build/clone-nanobot.mjs");
} else {
  console.log("\n Skipping nanobot clone (BYCLAW_PACK_SKIP_CLONE=1)");
}

// ─ 2. Sync webui source from vendor ─────────────────────────────
node("scripts/build/sync-webui.mjs");

// ── 3. Build web UI ──────────────────────────────────────────────
pnpm("build:web");

// ── 4. Build Electron shell ──────────────────────────────────────
pnpm("build:shell");

// ── 5. Create Python venv with nanobot installed ─────────────────
if (process.env.BYCLAW_PACK_SKIP_VENV !== "1") {
  node("scripts/build/create-python-venv.mjs");
} else {
  console.log("\n⊘ Skipping venv creation (BYCLAW_PACK_SKIP_VENV=1)");
}

// ── 6. Pack venv into tar shards ─────────────────────────────────
if (process.env.BYCLAW_PACK_SKIP_VENV !== "1") {
  node("scripts/build/pack-python-venv.mjs");
} else {
  console.log("\n⊘ Skipping venv packing (BYCLAW_PACK_SKIP_VENV=1)");
}

// ── 7. Bundle installer scripts + electron-builder ───────────────
if (process.env.BYCLAW_PACK_SKIP_BUNDLE !== "1") {
  node("scripts/build/bundle-cached.mjs", {
    env: { BYCLAW_PACK_SKIP_NANOBOT: "1" },
  });
} else {
  console.log("\n⊘ Skipping electron-builder (BYCLAW_PACK_SKIP_BUNDLE=1)");
}

console.log("\n✅ Full build complete!");
console.log("Installer: dist-release/by-claw-nanobot-Setup-*.exe");
