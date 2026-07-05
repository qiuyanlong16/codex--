#!/usr/bin/env node
/**
 * Create a Python virtual environment and install nanobot into it.
 *
 * The resulting venv is bundled with the Electron app as an extraResource,
 * so the user does NOT need Python installed on their machine.
 *
 * The venv is created at: packages/shell/resources/python-venv/
 *
 * Prerequisites:
 *   - A system Python >= 3.12 must be available on PATH
 *     (or set BYCLAW_PYTHON_EXE to a specific interpreter)
 *   - `vendor/nanobot/` must exist (run `pnpm pack:clone-nanobot` first)
 *
 * Env vars:
 *   BYCLAW_PYTHON_EXE        — Python interpreter to use (default: python3)
 *   BYCLAW_PYTHON_VENV_DIR   — Override venv destination
 *   BYCLAW_PACK_SKIP_VENV    — "1" to skip entirely
 *   BYCLAW_NANOBOT_VENDOR_DIR — Override vendor/nanobot path
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findSitePackagesDir } from "./lib/platform.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VENDOR_NANOBOT =
  process.env.BYCLAW_NANOBOT_VENDOR_DIR?.trim() || path.join(ROOT, "vendor", "nanobot");
const DEFAULT_VENV_DIR = path.join(ROOT, "packages", "shell", "resources", "python-venv");
const VENV_DIR = process.env.BYCLAW_PYTHON_VENV_DIR?.trim() || DEFAULT_VENV_DIR;

const PYTHON_EXE_NAME = process.platform === "win32" ? "python.exe" : "python3";

function resolveSystemPython() {
  if (process.env.BYCLAW_PYTHON_EXE?.trim()) {
    return process.env.BYCLAW_PYTHON_EXE.trim();
  }
  const candidates = process.platform === "win32" ? ["python"] : ["python3", "python"];
  for (const cmd of candidates) {
    const probe = spawnSync(cmd, ["--version"], { encoding: "utf8", stdio: "pipe" });
    if (probe.status === 0) return cmd;
  }
  return process.platform === "win32" ? "python" : "python3";
}

const SYSTEM_PYTHON = resolveSystemPython();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    stdio: opts.stdio ?? "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...opts.env },
    ...opts,
  });
  if (r.status !== 0) {
    const errOut = (r.stderr || r.stdout || "").toString().trim();
    throw new Error(
      `${cmd} ${args.join(" ")} exited with code ${r.status}` +
        (errOut ? `\n${errOut.slice(0, 4000)}` : ""),
    );
  }
  return r;
}

function venvPython() {
  if (process.platform === "win32") {
    return path.join(VENV_DIR, "Scripts", "python.exe");
  }
  const binDir = path.join(VENV_DIR, "bin");
  for (const name of ["python3", "python"]) {
    const candidate = path.join(binDir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(binDir, "python3");
}

function venvPip() {
  if (process.platform === "win32") {
    return path.join(VENV_DIR, "Scripts", "pip.exe");
  }
  return path.join(VENV_DIR, "bin", "pip");
}

// ---------------------------------------------------------------------------
// Skip gate
// ---------------------------------------------------------------------------

if (process.env.BYCLAW_PACK_SKIP_VENV === "1") {
  console.log("[create-python-venv] skipped (BYCLAW_PACK_SKIP_VENV=1)");
  process.exit(0);
}

if (!fs.existsSync(VENDOR_NANOBOT)) {
  console.error(
    `[create-python-venv] ERROR: vendor nanobot not found at ${VENDOR_NANOBOT}\n` +
      `Run \`pnpm pack:clone-nanobot\` first.`,
  );
  process.exit(1);
}

console.log(`[create-python-venv] vendor:  ${VENDOR_NANOBOT}`);
console.log(`[create-python-venv] venv:    ${VENV_DIR}`);
console.log(`[create-python-venv] python:  ${SYSTEM_PYTHON}`);

// ---------------------------------------------------------------------------
// 1. Check system Python version
// ---------------------------------------------------------------------------

const versionResult = run(SYSTEM_PYTHON, ["--version"], { stdio: "pipe" });
const versionStr = (versionResult.stdout || versionResult.stderr || "").toString().trim();
console.log(`[create-python-venv] system Python: ${versionStr}`);

// ---------------------------------------------------------------------------
// 2. Create the venv (if it doesn't already exist)
// ---------------------------------------------------------------------------

const pyInVenv = venvPython();

function venvHasPip() {
  const r = spawnSync(pyInVenv, ["-m", "pip", "--version"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  return r.status === 0;
}

if (fs.existsSync(pyInVenv) && !venvHasPip()) {
  console.log("[create-python-venv] existing venv is incomplete (no pip), recreating...");
  fs.rmSync(VENV_DIR, { recursive: true, force: true });
}

if (fs.existsSync(pyInVenv)) {
  console.log("[create-python-venv] venv already exists, reusing...");
} else {
  console.log(`[create-python-venv] creating venv...`);
  fs.mkdirSync(path.dirname(VENV_DIR), { recursive: true });
  run(SYSTEM_PYTHON, ["-m", "venv", "--clear", VENV_DIR]);
}

if (!fs.existsSync(pyInVenv)) {
  throw new Error(`venv creation failed: ${pyInVenv} not found`);
}

// ---------------------------------------------------------------------------
// 3. Upgrade pip in the venv
// ---------------------------------------------------------------------------

console.log("[create-python-venv] upgrading pip...");
run(pyInVenv, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"], {
  stdio: process.env.CI === "true" ? "inherit" : undefined,
  env: { PIP_DISABLE_PIP_VERSION_CHECK: "1" },
});

// Install nanobot from vendor source (with all optional extras)
// NOTE: Use regular install (NOT editable -e) so all files are copied into
// site-packages. Editable installs create .pth files pointing to the vendor
// directory, which breaks when the venv is extracted on a different machine.
// ---------------------------------------------------------------------------

console.log(`[create-python-venv] installing nanobot from ${VENDOR_NANOBOT}...`);

function vendorNanobotVersion() {
  const pyproject = fs.readFileSync(path.join(VENDOR_NANOBOT, "pyproject.toml"), "utf8");
  const match = pyproject.match(/^version\s*=\s*"([^"]+)"/m);
  return match?.[1] ?? null;
}

const pipEnv = {
  PIP_DISABLE_PIP_VERSION_CHECK: "1",
  PIP_PREFER_BINARY: "1",
};
const pipStdio = process.env.CI === "true" ? "inherit" : undefined;
const usePypiOnDarwinCi =
  process.env.CI === "true" &&
  (process.platform === "darwin" || process.env.BYCLAW_TARGET_PLATFORM === "darwin");

if (usePypiOnDarwinCi) {
  const version = vendorNanobotVersion();
  const spec = version ? `nanobot-ai[api]==${version}` : "nanobot-ai[api]";
  console.log(`[create-python-venv] macOS CI: installing ${spec} from PyPI`);
  run(pyInVenv, ["-m", "pip", "install", spec], { stdio: pipStdio, env: pipEnv });
} else {
  run(pyInVenv, ["-m", "pip", "install", ".[api]"], {
    cwd: VENDOR_NANOBOT,
    stdio: pipStdio,
    env: pipEnv,
  });
}

// ---------------------------------------------------------------------------
// 5. Verify the installation
// ---------------------------------------------------------------------------

const verifyResult = spawnSync(pyInVenv, ["-c", "import nanobot; print(nanobot.__version__)"], {
  encoding: "utf8",
});
const nanobotVersion = (verifyResult.stdout || "").trim();
console.log(`[create-python-venv] nanobot version: ${nanobotVersion || "(unknown)"}`);

// Check that the nanobot CLI entry point works (lighter than importing private symbols).
const gwResult = spawnSync(pyInVenv, ["-m", "nanobot", "--help"], {
  encoding: "utf8",
  stdio: "pipe",
});
if (gwResult.status !== 0) {
  const detail = (gwResult.stderr || gwResult.stdout || "").toString().trim();
  throw new Error(`nanobot CLI check failed: ${detail || "unknown error"}`);
}
console.log("[create-python-venv] nanobot CLI OK");

// ---------------------------------------------------------------------------
// 6. Clean up: remove __pycache__, pip, setuptools, tests (saves ~150 MB)
// ---------------------------------------------------------------------------

console.log("[create-python-venv] cleaning venv...");
const venvSitePackages = findSitePackagesDir(VENV_DIR);

// Remove all __pycache__ directories
let cacheCount = 0;
function removePycache(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__pycache__") {
        fs.rmSync(full, { recursive: true, force: true });
        cacheCount++;
      } else {
        removePycache(full);
      }
    }
  }
}
removePycache(VENV_DIR);
console.log(`[create-python-venv]   removed ${cacheCount} __pycache__ dirs`);

if (venvSitePackages) {
  // Remove pip and setuptools (not needed at runtime)
  for (const pkg of ["pip", "setuptools"]) {
    const pkgDir = path.join(venvSitePackages, pkg);
    if (fs.existsSync(pkgDir)) {
      fs.rmSync(pkgDir, { recursive: true, force: true });
    }
    // Also remove dist-info
    for (const entry of fs.readdirSync(venvSitePackages)) {
      if (entry.startsWith(`${pkg}-`) && entry.endsWith(".dist-info")) {
        fs.rmSync(path.join(venvSitePackages, entry), { recursive: true, force: true });
      }
    }
  }
  console.log("[create-python-venv]   removed pip + setuptools");

  // Remove test directories from site-packages
  let testCount = 0;
  for (const entry of fs.readdirSync(venvSitePackages, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const pkgDir = path.join(venvSitePackages, entry.name);
      for (const sub of fs.readdirSync(pkgDir, { withFileTypes: true })) {
        if (sub.isDirectory() && (sub.name === "tests" || sub.name === "test")) {
          fs.rmSync(path.join(pkgDir, sub.name), { recursive: true, force: true });
          testCount++;
        }
      }
    }
  }
  console.log(`[create-python-venv]   removed ${testCount} test dirs`);
} else {
  console.warn("[create-python-venv] site-packages not found, skipping pip/setuptools cleanup");
}

// Remove remaining .pyc files
let pycCount = 0;
function removePyc(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removePyc(full);
    } else if (entry.name.endsWith(".pyc")) {
      fs.unlinkSync(full);
      pycCount++;
    }
  }
}
removePyc(VENV_DIR);
console.log(`[create-python-venv]   removed ${pycCount} .pyc files`);

// ---------------------------------------------------------------------------
// 6. Print summary
// ---------------------------------------------------------------------------

const venvSize = getDirSize(VENV_DIR);
const sizeMb = (venvSize / 1024 / 1024).toFixed(1);

console.log("");
console.log(`[create-python-venv] OK → ${VENV_DIR} (${sizeMb} MB)`);
console.log("");
console.log("The venv will be bundled as an extraResource in the Electron app.");
console.log("To use a different Python interpreter, set BYCLAW_PYTHON_EXE.");

function getDirSize(dir) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        total += getDirSize(full);
      } else {
        total += fs.statSync(full).size;
      }
    }
  } catch {
    /* ignore */
  }
  return total;
}
