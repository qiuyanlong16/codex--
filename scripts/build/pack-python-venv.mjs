#!/usr/bin/env node
/**
 * Pack python-venv into tar shards for fast NSIS install + parallel extraction.
 *
 * Instead of bundling 39,000+ individual files (slow NSIS extraction),
 * we pack the venv into 2-3 tar archives. NSIS only writes these few files,
 * and at first run we extract them in parallel using Windows tar.exe.
 *
 * Flow:
 *   1. Copy webui dist into venv's nanobot/web/dist/
 *   2. Split venv into ~3 tar shards (by top-level dirs in site-packages)
 *   3. Write a manifest JSON listing the shards
 *   4. Replace python-venv/ in resources with the tar shards + manifest
 *
 * Output:
 *   packages/shell/resources/python-venv_0.tar
 *   packages/shell/resources/python-venv_1.tar
 *   packages/shell/resources/python-venv_2.tar  (if needed)
 *   packages/shell/resources/python-venv_manifest.json
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VENV_DIR = path.join(ROOT, "packages", "shell", "resources", "python-venv");
const RESOURCES_DIR = path.join(ROOT, "packages", "shell", "resources");
const WEBUI_DIST = path.join(ROOT, "packages", "web", "dist");
const MANIFEST_PATH = path.join(RESOURCES_DIR, "python-venv_manifest.json");

// Max ~80 MB per shard to keep extraction fast
const TARGET_SHARD_SIZE = 80 * 1024 * 1024;

function resolveTarExe() {
  const candidates = [
    path.join(process.env.WINDIR || "C:\\Windows", "System32", "tar.exe"),
    "tar",
  ];
  for (const c of candidates) {
    const probe = spawnSync(c, ["--version"], { encoding: "utf8", windowsHide: true });
    if (probe.status === 0) return c;
  }
  return null;
}

function getDirSize(dir) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) total += getDirSize(full);
      else total += fs.statSync(full).size;
    }
  } catch { /* ignore */ }
  return total;
}

// ---------------------------------------------------------------------------
// 0. Make venv self-contained (copy base Python runtime into venv)
// ---------------------------------------------------------------------------

function makeVenvSelfContained() {
  const pyvenvCfg = path.join(VENV_DIR, "pyvenv.cfg");
  if (!fs.existsSync(pyvenvCfg)) {
    console.log("[pack-venv] no pyvenv.cfg found, skipping self-contained fix");
    return;
  }

  // Parse pyvenv.cfg to find base Python home
  const cfgContent = fs.readFileSync(pyvenvCfg, "utf8");
  const homeMatch = cfgContent.match(/^home\s*=\s*(.+)$/m);
  if (!homeMatch) {
    console.log("[pack-venv] no 'home' in pyvenv.cfg, skipping");
    return;
  }
  const basePythonHome = homeMatch[1].trim();
  console.log(`[pack-venv] base Python home (from pyvenv.cfg): ${basePythonHome}`);

  // On Windows, the base Python may be a minimal install that relies on
  // a full Python's DLLs/ (C extension modules like _socket.pyd) via the
  // Windows registry. We need to find the FULL Python and copy its runtime
  // files into the venv so it works on any machine.
  //
  // Step 1: Find the full Python's DLLs path via Windows registry
  const fullPythonDlls = findFullPythonDlls();
  if (!fullPythonDlls) {
    console.error("[pack-venv] WARNING: could not find full Python DLLs directory");
    console.error("[pack-venv] The venv may not be portable to other machines.");
    return;
  }
  console.log(`[pack-venv] full Python DLLs: ${fullPythonDlls}`);

  // Step 2: Find the full Python home (parent of DLLs)
  const fullPythonHome = path.dirname(fullPythonDlls);
  console.log(`[pack-venv] full Python home: ${fullPythonHome}`);

  const venvScripts = path.join(VENV_DIR, "Scripts");
  if (!fs.existsSync(venvScripts)) {
    console.error("[pack-venv] ERROR: venv Scripts/ not found");
    process.exit(1);
  }

  // Step 3: Copy runtime files from the FULL Python into venv/Scripts/
  // These are needed for the venv to work on any machine, not just the dev machine.
  const runtimeFiles = [
    "python.exe",
    "pythonw.exe",
    "python3.dll",
    "python313.dll",
    "python312.dll",
    "python311.dll",
    "vcruntime140.dll",
    "vcruntime140_1.dll",
  ];

  let copied = 0;
  // Prefer full Python for executables/DLLs (it has everything)
  for (const file of runtimeFiles) {
    const src = path.join(fullPythonHome, file);
    const dest = path.join(venvScripts, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      const sizeMB = (fs.statSync(src).size / 1024 / 1024).toFixed(1);
      console.log(`[pack-venv]   copied ${file} (${sizeMB} MB)`);
      copied++;
    }
  }

  // Also try the base Python home for anything not found in full Python
  if (basePythonHome !== fullPythonHome && fs.existsSync(basePythonHome)) {
    for (const file of runtimeFiles) {
      const dest = path.join(venvScripts, file);
      if (!fs.existsSync(dest)) {
        const src = path.join(basePythonHome, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
          console.log(`[pack-venv]   copied ${file} from base Python`);
          copied++;
        }
      }
    }
  }

  // Copy python313.zip (zipped stdlib) — from whichever location has it
  for (const pythonHome of [fullPythonHome, basePythonHome]) {
    const zipSrc = path.join(pythonHome, "python313.zip");
    if (fs.existsSync(zipSrc)) {
      fs.copyFileSync(zipSrc, path.join(venvScripts, "python313.zip"));
      const sizeMB = (fs.statSync(zipSrc).size / 1024 / 1024).toFixed(1);
      console.log(`[pack-venv]   copied python313.zip (${sizeMB} MB)`);
      break;
    }
  }

  // Step 4: Copy ALL .pyd C extension modules from full Python's DLLs/
  // Put them directly in Scripts/ (next to python.exe) so Python finds them
  // via the "." entry in the ._pth file.
  let pydCount = 0;
  if (fs.existsSync(fullPythonDlls)) {
    for (const entry of fs.readdirSync(fullPythonDlls)) {
      if (entry.endsWith(".pyd") || (entry.endsWith(".dll") && entry.startsWith("lib"))) {
        fs.copyFileSync(
          path.join(fullPythonDlls, entry),
          path.join(venvScripts, entry),
        );
        pydCount++;
      }
    }
  }
  console.log(`[pack-venv]   copied ${pydCount} C extension files into Scripts/`);

  if (copied === 0 && pydCount === 0) {
    console.error("[pack-venv] WARNING: no base Python files found to copy");
    return;
  }

  // Step 5: Create python313._pth for truly portable Python (no registry needed)
  // When a ._pth file exists next to python.exe, Python uses ONLY the paths
  // listed here — no registry, no environment variables.
  //   python313.zip  → stdlib (in Scripts/)
  //   .              → Scripts/ itself (where .pyd C extensions are)
  //   import site    → auto-adds ../Lib/site-packages (venv site-packages)
  const pthContent = [
    "python313.zip",
    ".",
    "",
    "import site",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(venvScripts, "python313._pth"), pthContent);
  console.log(`[pack-venv]   created python313._pth`);

  // Step 6: Rewrite pyvenv.cfg to point home to venv's own Scripts/
  const newCfg = cfgContent
    .replace(/^home\s*=.*$/m, `home = ${venvScripts}`)
    .replace(/^executable\s*=.*$/m, `executable = ${path.join(venvScripts, "python.exe")}`);
  fs.writeFileSync(pyvenvCfg, newCfg);
  console.log(`[pack-venv] pyvenv.cfg updated: home → ${venvScripts}`);
  console.log(`[pack-venv] venv is now self-contained (${copied} runtime + ${pydCount} C extension files)`);
}

/**
 * Find the full Python's DLLs directory via Windows registry.
 * The dev machine may have a minimal Python (e.g. Lenovo ByRuntime) as the
 * base, but C extension modules (.pyd) live in a full Python installation
 * registered in HKCU\Software\Python\PythonCore.
 */
function findFullPythonDlls() {
  // Use the venv Python to query the registry and sys.path
  const venvPython = path.join(VENV_DIR, "Scripts", "python.exe");
  if (!fs.existsSync(venvPython)) {
    console.log("[pack-venv] venv python not found, cannot query DLLs path");
    return null;
  }

  const script = `
import sys, os
# Find DLLs from sys.path
for p in sys.path:
    if p.endswith('DLLs') and os.path.isdir(p):
        print(p)
        break
`;
  try {
    const result = spawnSync(venvPython, ["-c", script], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
    });
    if (result.status === 0 && result.stdout.trim()) {
      const dllsPath = result.stdout.trim().split("\n")[0].trim();
      if (fs.existsSync(dllsPath)) return dllsPath;
    }
  } catch { /* fall through */ }

  // Fallback: try Windows registry directly
  try {
    const result = spawnSync("reg", [
      "query", "HKCU\\Software\\Python\\PythonCore\\3.13\\PythonPath",
      "/ve",
    ], { encoding: "utf8", windowsHide: true });
    if (result.status === 0) {
      const match = result.stdout.match(/REG_SZ\s+(.+)/);
      if (match) {
        for (const p of match[1].split(";")) {
          const trimmed = p.trim().replace(/\\$/, "");
          if (trimmed.endsWith("DLLs") && fs.existsSync(trimmed)) return trimmed;
        }
        // First path is usually Lib/, parent's DLLs sibling
        const firstPath = match[1].split(";")[0].trim().replace(/\\$/, "");
        const dllsSibling = path.join(path.dirname(firstPath), "DLLs");
        if (fs.existsSync(dllsSibling)) return dllsSibling;
      }
    }
  } catch { /* give up */ }

  return null;
}

// ---------------------------------------------------------------------------
// 1a. Replace pip-generated .exe console_script launchers with portable .cmd
// ---------------------------------------------------------------------------
// pip-generated console_script .exe launchers (e.g. nanobot.exe) have the
// build machine's Python path hardcoded inside them. When the venv is extracted
// on a different machine, these .exe files fail with "Fatal error in launcher".
// Solution: replace them with .cmd wrappers that use %~dp0python.exe (relative).

function replaceExeLaunchersWithCmd() {
  const scriptsDir = path.join(VENV_DIR, "Scripts");
  if (!fs.existsSync(scriptsDir)) {
    console.log("[pack-venv] Scripts/ not found, skipping launcher replacement");
    return;
  }

  // Parse all entry_points.txt to map command name → module:function
  const sitePackages = path.join(VENV_DIR, "Lib", "site-packages");
  const entryPoints = new Map(); // commandName → { module, func }

  if (fs.existsSync(sitePackages)) {
    for (const distDir of fs.readdirSync(sitePackages)) {
      if (!distDir.endsWith(".dist-info")) continue;
      const epFile = path.join(sitePackages, distDir, "entry_points.txt");
      if (!fs.existsSync(epFile)) continue;

      const content = fs.readFileSync(epFile, "utf8");
      let inConsoleScripts = false;
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed === "[console_scripts]") {
          inConsoleScripts = true;
          continue;
        }
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
          inConsoleScripts = false;
          continue;
        }
        if (!inConsoleScripts || !trimmed || trimmed.startsWith("#")) continue;

        // Format: name = module.path:function [extras]
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const name = trimmed.slice(0, eqIdx).trim();
        const rhs = trimmed.slice(eqIdx + 1).trim();
        // Strip extras like [cli]
        const cleanRhs = rhs.replace(/\s*\[.*?\]\s*$/, "");
        const colonIdx = cleanRhs.indexOf(":");
        if (colonIdx === -1) continue;
        const module = cleanRhs.slice(0, colonIdx);
        const func = cleanRhs.slice(colonIdx + 1);
        entryPoints.set(name, { module, func });
      }
    }
  }

  // Files to skip (Python runtime and pip — not pip console_script launchers)
  const skipExes = new Set([
    "python.exe", "pythonw.exe", "python3.exe",
    "pip.exe", "pip3.exe", "pip3.13.exe",
  ]);

  let replaced = 0;
  let alreadyCmd = 0;

  for (const file of fs.readdirSync(scriptsDir)) {
    if (!file.endsWith(".exe")) continue;
    if (skipExes.has(file.toLowerCase())) continue;

    const exeName = file.replace(/\.exe$/i, "");
    const ep = entryPoints.get(exeName);
    const exePath = path.join(scriptsDir, file);
    const cmdPath = path.join(scriptsDir, `${exeName}.cmd`);

    if (ep) {
      // Create .cmd wrapper: python -c "from module import func; func()"
      const cmdContent = `@echo off\r\n"%~dp0python.exe" -c "from ${ep.module} import ${ep.func}; ${ep.func}()" %*\r\n`;
      fs.writeFileSync(cmdPath, cmdContent);
      fs.unlinkSync(exePath);
      replaced++;
      console.log(`[pack-venv]   launcher: ${exeName}.exe → ${exeName}.cmd (${ep.module}:${ep.func})`);
    } else {
      // No entry_points info — create a fallback .cmd that tries python -m <name>
      const cmdContent = `@echo off\r\n"%~dp0python.exe" -m ${exeName} %*\r\n`;
      fs.writeFileSync(cmdPath, cmdContent);
      fs.unlinkSync(exePath);
      replaced++;
      console.log(`[pack-venv]   launcher: ${exeName}.exe → ${exeName}.cmd (fallback: python -m ${exeName})`);
    }
  }

  console.log(`[pack-venv] replaced ${replaced} .exe launchers with .cmd wrappers`);
}

// ---------------------------------------------------------------------------
// 2. Copy webui dist into venv
// ---------------------------------------------------------------------------

function copyWebuiDistToVenv() {
  if (!fs.existsSync(WEBUI_DIST)) {
    console.error("[pack-venv] ERROR: webui dist not found at", WEBUI_DIST);
    console.error("[pack-venv] Run `pnpm build:web` first.");
    process.exit(1);
  }

  // Find nanobot/web/dist inside the venv
  const sitePackages = path.join(VENV_DIR, "Lib", "site-packages");
  const nanobotWebDist = path.join(sitePackages, "nanobot", "web", "dist");

  if (!fs.existsSync(path.join(sitePackages, "nanobot"))) {
    // Might be an editable install — check the vendor path
    console.log("[pack-venv] editable install detected, checking vendor...");
    // For editable installs, nanobot points to vendor/nanobot
    // We need to create the dist dir in vendor
    const vendorDist = path.join(ROOT, "vendor", "nanobot", "nanobot", "web", "dist");
    fs.mkdirSync(path.dirname(vendorDist), { recursive: true });
    fs.rmSync(vendorDist, { recursive: true, force: true });
    copyDirSync(WEBUI_DIST, vendorDist);
    console.log(`[pack-venv] webui dist → ${vendorDist}`);
    return vendorDist;
  }

  fs.mkdirSync(path.dirname(nanobotWebDist), { recursive: true });
  fs.rmSync(nanobotWebDist, { recursive: true, force: true });
  copyDirSync(WEBUI_DIST, nanobotWebDist);
  console.log(`[pack-venv] webui dist → ${nanobotWebDist}`);
  return nanobotWebDist;
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

// ---------------------------------------------------------------------------
// 2. Plan shards
// ---------------------------------------------------------------------------

function planShards() {
  const sitePackages = path.join(VENV_DIR, "Lib", "site-packages");
  const sitePackagesDirs = fs.readdirSync(sitePackages, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => ({
      name: e.name,
      size: getDirSize(path.join(sitePackages, e.name)),
    }))
    .sort((a, b) => b.size - a.size); // largest first

  // Bin-packing: greedily assign dirs to shards
  const shards = [[]]; // array of arrays of dir names
  const shardSizes = [0];

  for (const dir of sitePackagesDirs) {
    // Find the shard with smallest current size
    let minIdx = 0;
    for (let i = 1; i < shards.length; i++) {
      if (shardSizes[i] < shardSizes[minIdx]) minIdx = i;
    }

    shards[minIdx].push(dir.name);
    shardSizes[minIdx] += dir.size;

    // If this shard is getting large, start a new one
    if (shardSizes[minIdx] > TARGET_SHARD_SIZE) {
      shards.push([]);
      shardSizes.push(0);
    }
  }

  // Remove empty shards
  const result = shards
    .map((dirs, i) => ({ dirs, size: shardSizes[i] }))
    .filter(s => s.dirs.length > 0);

  return result;
}

// ---------------------------------------------------------------------------
// 3. Create tar shards
// ---------------------------------------------------------------------------

function createTarShards(shards, tarExe) {
  const shardFiles = [];

  for (let i = 0; i < shards.length; i++) {
    const shardFile = path.join(RESOURCES_DIR, `python-venv_${i}.tar`);
    const shard = shards[i];

    console.log(`[pack-venv] shard ${i}: ${shard.dirs.length} dirs, ${(shard.size / 1024 / 1024).toFixed(1)} MB`);

    // We need to tar the entire venv structure but only include specific site-packages dirs
    // Strategy: create a temp staging dir with symlinks/copies, then tar it
    // Simpler: tar the whole venv for shard 0 (includes Scripts/, python.exe etc.),
    //          then tar only specific site-packages dirs for remaining shards

    if (i === 0) {
      // Shard 0: everything EXCEPT site-packages subdirs assigned to other shards
      const excludeDirs = shards.slice(1).flatMap(s => s.dirs);
      const excludeArgs = excludeDirs.flatMap(d => [
        "--exclude", `python-venv/Lib/site-packages/${d}`,
      ]);

      const args = [
        "-cf", shardFile,
        "-C", path.dirname(VENV_DIR),
        ...excludeArgs,
        "python-venv",
      ];

      const result = spawnSync(tarExe, args, {
        encoding: "utf8",
        windowsHide: true,
        timeout: 300_000,
      });
      if (result.status !== 0) {
        throw new Error(`tar shard 0 failed: ${result.stderr}`);
      }
    } else {
      // Shard N: only the assigned site-packages dirs
      // Create a tar with just these dirs under the venv path
      const tempDir = path.join(RESOURCES_DIR, `.tar-staging-${i}`);
      const stagingSitePkg = path.join(tempDir, "python-venv", "Lib", "site-packages");
      fs.mkdirSync(stagingSitePkg, { recursive: true });

      for (const dirName of shard.dirs) {
        const src = path.join(VENV_DIR, "Lib", "site-packages", dirName);
        const dest = path.join(stagingSitePkg, dirName);
        // Use junction on Windows for speed
        try {
          fs.symlinkSync(src, dest, "junction");
        } catch {
          copyDirSync(src, dest);
        }
      }

      const args = [
        "-cf", shardFile,
        "-C", tempDir,
        "python-venv",
      ];

      const result = spawnSync(tarExe, args, {
        encoding: "utf8",
        windowsHide: true,
        timeout: 300_000,
      });

      // Clean up staging
      fs.rmSync(tempDir, { recursive: true, force: true });

      if (result.status !== 0) {
        throw new Error(`tar shard ${i} failed: ${result.stderr}`);
      }
    }

    const fileSize = fs.statSync(shardFile).size;
    console.log(`[pack-venv]   → ${path.basename(shardFile)} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);
    shardFiles.push(path.basename(shardFile));
  }

  return shardFiles;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (!fs.existsSync(VENV_DIR)) {
  console.error("[pack-venv] ERROR: venv not found at", VENV_DIR);
  console.error("[pack-venv] Run `pnpm pack:create-venv` first.");
  process.exit(1);
}

const tarExe = resolveTarExe();
if (!tarExe) {
  console.error("[pack-venv] ERROR: tar.exe not found. Windows 10+ includes tar.exe.");
  process.exit(1);
}

console.log(`[pack-venv] venv: ${VENV_DIR} (${(getDirSize(VENV_DIR) / 1024 / 1024).toFixed(1)} MB)`);
console.log(`[pack-venv] tar:  ${tarExe}`);

// Step 0: Make venv self-contained by copying base Python runtime into it
// Without this, pyvenv.cfg points to the dev machine's Python (e.g. Lenovo ByRuntime)
// which doesn't exist on the target machine, causing exit code 103.
makeVenvSelfContained();

// Step 0a: Replace pip-generated .exe console_script launchers with portable .cmd
// The .exe launchers have the build machine's Python path hardcoded inside them.
// .cmd wrappers use %~dp0python.exe (relative path) so they work on any machine.
replaceExeLaunchersWithCmd();

// Step 1: Copy webui dist
copyWebuiDistToVenv();

// Step 2: Plan shards
const shards = planShards();
console.log(`[pack-venv] plan: ${shards.length} shards`);

// Step 3: Clean old shards
for (const entry of fs.readdirSync(RESOURCES_DIR)) {
  if (/^python-venv_\d+\.tar$/.test(entry) || entry === "python-venv_manifest.json") {
    fs.unlinkSync(path.join(RESOURCES_DIR, entry));
  }
}

// Step 4: Create tar shards
const shardFiles = createTarShards(shards, tarExe);

// Step 5: Write manifest
const manifest = {
  shards: shardFiles.map((file, i) => ({
    file,
    index: i,
    dirs: shards[i].dirs,
    size: shards[i].size,
  })),
  createdAt: new Date().toISOString(),
  venvSize: getDirSize(VENV_DIR),
};
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log(`[pack-venv] manifest → ${MANIFEST_PATH}`);

// Step 6: Summary
const totalTarSize = shardFiles.reduce((sum, f) => sum + fs.statSync(path.join(RESOURCES_DIR, f)).size, 0);
console.log("");
console.log(`[pack-venv] OK: ${shardFiles.length} shards, ${(totalTarSize / 1024 / 1024).toFixed(1)} MB total`);
console.log("");
console.log("Next: electron-builder will package these tar files instead of individual venv files.");
console.log("At install time, unpack-python-venv-parallel.cjs extracts them in parallel.");
