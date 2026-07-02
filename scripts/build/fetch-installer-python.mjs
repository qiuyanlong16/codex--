#!/usr/bin/env node
/**
 * Fetch Python embeddable package (>= 3.12.6) for the installer.
 * Caches locally in .python-package-cache/ to avoid re-downloading.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DEST_DIR = join(ROOT, "packages/shell/resources/installer-python");
const PYTHON_VERSION = process.env.BYCLAW_PYTHON_VERSION ?? "3.12.10";
const PYTHON_URL =
  process.env.BYCLAW_PYTHON_URL ??
  `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const CACHE_DIR = join(ROOT, ".python-package-cache");

async function downloadFile(url, destPath) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`download failed ${url}: ${res.status}`);
  }
  await pipeline(res.body, createWriteStream(destPath));
}

function extractZipWindows(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  const ps = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
  const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "inherit" });
  if (r.status !== 0) {
    throw new Error(`Expand-Archive failed for ${zipPath}`);
  }
}

function extractZipUnix(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  const r = spawnSync("unzip", ["-o", zipPath, "-d", destDir], { stdio: "inherit" });
  if (r.status !== 0) {
    throw new Error(`unzip failed for ${zipPath}`);
  }
}

function findPythonExe(dir) {
  const names = process.platform === "win32"
    ? ["python.exe", "python3.exe"]
    : ["python3", "python"];
  const direct = names.map((n) => join(dir, n)).find((p) => existsSync(p));
  if (direct) return direct;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const nested = names.map((n) => join(dir, entry.name, n)).find((p) => existsSync(p));
      if (nested) return nested;
    }
  }
  return null;
}

export async function fetchInstallerPython() {
  if (process.env.BYCLAW_PACK_SKIP_PYTHON === "1") {
    console.log("[fetch-installer-python] skipped (BYCLAW_PACK_SKIP_PYTHON=1)");
    return;
  }

  // If a local Python directory is provided, copy from there
  const localDir = process.env.BYCLAW_INSTALLER_PYTHON_DIR;
  if (localDir) {
    const exe = findPythonExe(localDir);
    if (!exe) {
      throw new Error(`BYCLAW_INSTALLER_PYTHON_DIR missing python executable: ${localDir}`);
    }
    mkdirSync(DEST_DIR, { recursive: true });
    // Copy all files from local dir
    for (const entry of readdirSync(localDir)) {
      const src = join(localDir, entry);
      if (statSync(src).isFile()) {
        copyFileSync(src, join(DEST_DIR, entry));
      }
    }
    console.log(`[fetch-installer-python] copied from local ${localDir}`);
    return;
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  const zipName = PYTHON_URL.split("/").pop() ?? "python-embed.zip";
  const zipPath = join(CACHE_DIR, zipName);

  if (!existsSync(zipPath)) {
    console.log(`[fetch-installer-python] downloading ${PYTHON_URL}`);
    await downloadFile(PYTHON_URL, zipPath);
  } else {
    console.log(`[fetch-installer-python] using cached ${zipPath}`);
  }

  const extractDir = join(CACHE_DIR, "python-extract");
  rmSync(extractDir, { recursive: true, force: true });

  if (process.platform === "win32") {
    extractZipWindows(zipPath, extractDir);
  } else {
    extractZipUnix(zipPath, extractDir);
  }

  const pythonExe = findPythonExe(extractDir);
  if (!pythonExe) {
    throw new Error(`python executable not found in ${extractDir}`);
  }

  mkdirSync(DEST_DIR, { recursive: true });
  // Copy all extracted files to dest
  for (const entry of readdirSync(extractDir)) {
    const src = join(extractDir, entry);
    if (statSync(src).isFile()) {
      copyFileSync(src, join(DEST_DIR, entry));
    }
  }
  const mb = (statSync(join(DEST_DIR, dirname(pythonExe).split("/").pop() ?? "python.exe")).size / 1024 / 1024).toFixed(1);
  console.log(`[fetch-installer-python] OK → ${DEST_DIR} (${mb} MB)`);
}

if (process.argv[1]?.endsWith("fetch-installer-python.mjs")) {
  fetchInstallerPython().catch((err) => {
    console.error(`[fetch-installer-python] ${err.message}`);
    process.exit(1);
  });
}
