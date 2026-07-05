#!/usr/bin/env node
/**
 * Repair a broken macOS python-venv extracted from an older codex-- build.
 *
 * Usage:
 *   node scripts/diag/nanobot-fix-venv-mac.mjs
 *   node scripts/diag/nanobot-fix-venv-mac.mjs /path/to/python-venv
 *
 * Requires a local Python 3.12 framework (python.org pkg) OR an extracted
 * framework at /tmp/python312-fw/Versions/3.12 from the installer payload.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fixMacPythonDylibs,
  copyFrameworkLibs,
  copyPythonAppResources,
  adHocSignMacVenv,
  resolveMacPythonBasePrefix,
} from "../build/lib/macos-venv-portable.mjs";

const DEFAULT_VENV = path.join(os.homedir(), ".by-claw-nanobot", "resources", "python-venv");
const VENV_ROOT = process.argv[2]?.trim() || DEFAULT_VENV;
const FALLBACK_PREFIX = "/tmp/python312-fw/Versions/3.12";

function detectPyVersion(venvRoot) {
  const libDir = path.join(venvRoot, "lib");
  for (const entry of fs.readdirSync(libDir)) {
    if (/^python3\.\d+$/.test(entry)) return entry;
  }
  throw new Error(`could not detect python version under ${libDir}`);
}

function resolveBasePrefix(venvRoot) {
  const cfgPath = path.join(venvRoot, "pyvenv.cfg");
  if (fs.existsSync(cfgPath)) {
    try {
      return resolveMacPythonBasePrefix(cfgPath);
    } catch {
      /* fall through */
    }
  }
  if (fs.existsSync(path.join(FALLBACK_PREFIX, "Resources", "Python.app"))) {
    return FALLBACK_PREFIX;
  }
  throw new Error(
    "Python 3.12 framework not found. Install from python.org or extract pkg to /tmp/python312-fw/",
  );
}

function main() {
  if (process.platform !== "darwin") {
    console.error("[fix-venv-mac] macOS only");
    process.exit(1);
  }
  if (!fs.existsSync(VENV_ROOT)) {
    console.error(`[fix-venv-mac] venv not found: ${VENV_ROOT}`);
    process.exit(1);
  }

  const pyVersion = detectPyVersion(VENV_ROOT);
  const basePrefix = resolveBasePrefix(VENV_ROOT);
  console.log(`[fix-venv-mac] venv:   ${VENV_ROOT}`);
  console.log(`[fix-venv-mac] python: ${pyVersion}`);
  console.log(`[fix-venv-mac] source: ${basePrefix}`);

  copyPythonAppResources(basePrefix, VENV_ROOT);
  copyFrameworkLibs(basePrefix, VENV_ROOT);
  fixMacPythonDylibs(VENV_ROOT, pyVersion);
  adHocSignMacVenv(VENV_ROOT);

  const py = path.join(VENV_ROOT, "bin", "python3");
  const probe = spawnSync(py, ["-c", "import ssl, nanobot; print('OK', nanobot.__version__)"], {
    encoding: "utf8",
  });
  if (probe.status !== 0) {
    console.error(probe.stderr || probe.stdout);
    process.exit(1);
  }
  console.log(`[fix-venv-mac] ${probe.stdout.trim()}`);
}

main();
