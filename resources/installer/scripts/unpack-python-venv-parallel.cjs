#!/usr/bin/env node
/**
 * Install-time parallel extraction of python-venv tar shards.
 * Modeled after by-claw-app's unpack-openclaw-parallel.cjs.
 *
 * Strategy:
 *   1. Prefer Windows tar.exe (System32) — fastest, one process per shard
 *   2. Fallback: Node.js tar module with Worker threads
 *   3. Final fallback: sequential extraction
 *
 * Usage: node unpack-python-venv-parallel.cjs <installDir>
 *   installDir = NSIS $INSTDIR (parent of resources/)
 *
 * Called from:
 *   - NSIS custom script (custom.nsh) during install, OR
 *   - Shell main process at first startup
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const instDir = process.argv[2];
if (!instDir) {
  console.error("[unpack-venv] missing install directory");
  process.exit(1);
}

const resourcesDir = path.join(instDir, "resources");
const manifestFile = path.join(resourcesDir, "python-venv_manifest.json");
const venvDir = path.join(resourcesDir, "python-venv");
const pythonExe = path.join(venvDir, "Scripts", "python.exe");

// ---------------------------------------------------------------------------
// Collect shard files
// ---------------------------------------------------------------------------

function collectTarFiles() {
  if (fs.existsSync(manifestFile)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
      const files = (manifest.shards || [])
        .map((s) => path.join(resourcesDir, s.file))
        .filter((p) => fs.existsSync(p));
      if (files.length > 0) return files;
    } catch { /* fall through */ }
  }

  // Fallback: discover shards by naming convention
  const shardFiles = [];
  for (let i = 0; i < 20; i++) {
    const p = path.join(resourcesDir, `python-venv_${i}.tar`);
    if (fs.existsSync(p)) shardFiles.push(p);
  }
  return shardFiles;
}

// ---------------------------------------------------------------------------
// tar.exe resolver
// ---------------------------------------------------------------------------

function resolveTarExe() {
  const candidates = [
    path.join(process.env.WINDIR || "C:\\Windows", "System32", "tar.exe"),
    "tar.exe",
  ];
  for (const c of candidates) {
    if (c === "tar.exe" || fs.existsSync(c)) {
      const probe = spawnSync(c, ["--version"], { encoding: "utf8", windowsHide: true });
      if (probe.status === 0) return c;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// JS-based sequential extraction fallback (used when tar.exe fails or is
// unavailable).  The `tar` npm module is bundled into this script by the
// build step (see bundle-installer-scripts.mjs) so no node_modules needed.
// ---------------------------------------------------------------------------

async function extractWithJsTar(tarFiles) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tar = require("tar");
  console.log(`[unpack-venv] using JS tar module (sequential, ${tarFiles.length} shards)`);
  const startAll = Date.now();

  for (const tarFile of tarFiles) {
    const started = Date.now();
    await tar.extract({ file: tarFile, cwd: resourcesDir });
    console.log(
      `[unpack-venv] ${path.basename(tarFile)} (${((Date.now() - started) / 1000).toFixed(1)}s)`,
    );
    try { fs.unlinkSync(tarFile); } catch { /* ignore */ }
  }

  console.log(`[unpack-venv] sequential extraction done (${((Date.now() - startAll) / 1000).toFixed(1)}s)`);
}

// ---------------------------------------------------------------------------
// Parallel tar.exe extraction
// ---------------------------------------------------------------------------

function extractWithTarExe(tarExe, tarFiles) {
  console.log(`[unpack-venv] using ${tarExe} (parallel, ${tarFiles.length} shards)`);
  const startAll = Date.now();

  return Promise.all(
    tarFiles.map((tarFile) =>
      new Promise((resolve, reject) => {
        const started = Date.now();
        const result = spawnSync(tarExe, ["-xf", tarFile, "-C", resourcesDir], {
          encoding: "utf8",
          windowsHide: true,
          timeout: 600_000,
        });
        // Windows tar.exe returns exit code 0 even on "Permission denied"!
        // Check stderr for failure indicators.
        const stderr = result.stderr || "";
        const hasErrors =
          result.status !== 0 ||
          /Permission denied|Can't create|Cannot create/i.test(stderr);
        if (hasErrors) {
          reject(new Error(stderr || result.stdout || `tar failed ${tarFile}`));
          return;
        }
        console.log(
          `[unpack-venv] ${path.basename(tarFile)} (${((Date.now() - started) / 1000).toFixed(1)}s)`,
        );
        // Clean up tar file after successful extraction
        try { fs.unlinkSync(tarFile); } catch { /* ignore */ }
        resolve();
      }),
    ),
  ).then(() => {
    console.log(`[unpack-venv] parallel extraction done (${((Date.now() - startAll) / 1000).toFixed(1)}s)`);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Already extracted?
  if (fs.existsSync(pythonExe)) {
    console.log("[unpack-venv] already extracted, skip");
    return;
  }

  const tarFiles = collectTarFiles();
  if (tarFiles.length === 0) {
    console.error("[unpack-venv] no python-venv_*.tar in resources");
    process.exit(1);
  }

  console.log(`[unpack-venv] ${tarFiles.length} shard(s) → ${venvDir}`);
  const start = Date.now();

  const tarExe = process.platform === "win32" ? resolveTarExe() : null;

  if (tarExe) {
    try {
      await extractWithTarExe(tarExe, tarFiles);
    } catch (err) {
      console.log(`[unpack-venv] tar.exe failed: ${err.message.split("\n")[0]} — falling back to JS tar`);
      await extractWithJsTar(tarFiles);
    }
  } else {
    // No tar.exe available — use bundled JS tar module
    await extractWithJsTar(tarFiles);
  }

  // Clean up manifest
  if (fs.existsSync(manifestFile)) {
    try { fs.unlinkSync(manifestFile); } catch { /* ignore */ }
  }

  // Verify
  if (!fs.existsSync(pythonExe)) {
    console.error(`[unpack-venv] python.exe not found at ${pythonExe}`);
    process.exit(1);
  }

  console.log(`[unpack-venv] done (${((Date.now() - start) / 1000).toFixed(1)}s)`);
}

main().catch((err) => {
  console.error(`[unpack-venv] ${err.message}`);
  process.exit(1);
});
