#!/usr/bin/env node
/**
 * Stage nanobot bundle from user-provided zip into packages/shell/resources/.
 *
 * The user provides a zip containing Python >= 3.12.6 + nanobot + all dependencies
 * pre-installed. This script extracts it into the shell resources directory.
 *
 * Set BYCLAW_NANOBOT_PACKAGE_DIR to the directory containing the zip.
 * Set BYCLAW_PACK_SKIP_NANOBOT=1 to skip.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const STAGE_DIR = join(ROOT, "packages/shell/resources/nanobot-bundle");
const LOCK_PATH = join(ROOT, "nanobot-resource.lock.json");

function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

function resolvePackageDir() {
  if (process.env.BYCLAW_NANOBOT_PACKAGE_DIR) {
    return process.env.BYCLAW_NANOBOT_PACKAGE_DIR;
  }
  if (existsSync(LOCK_PATH)) {
    try {
      const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
      if (lock.source?.localPath && existsSync(lock.source.localPath)) {
        return lock.source.localPath;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function findZipFiles(dir) {
  return readdirSync(dir)
    .filter((f) => /^nanobot.*\.zip$/i.test(f) || f === "nanobot.zip")
    .sort();
}

function extractZip(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  if (process.platform === "win32") {
    const ps = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
    const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("Expand-Archive failed");
  } else {
    const r = spawnSync("unzip", ["-o", zipPath, "-d", destDir], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("unzip failed");
  }
}

export function stageNanobotBundle(options = {}) {
  if (process.env.BYCLAW_PACK_SKIP_NANOBOT === "1") {
    console.log("[stage-nanobot-bundle] skipped (BYCLAW_PACK_SKIP_NANOBOT=1)");
    return { staged: false };
  }

  const packageDir = options.packageDir ?? resolvePackageDir();
  if (!packageDir) {
    console.warn(
      "[stage-nanobot-bundle] WARNING: No nanobot package dir set. " +
      "Set BYCLAW_NANOBOT_PACKAGE_DIR or nanobot-resource.lock.json. " +
      "Skipping nanobot bundle staging.",
    );
    return { staged: false };
  }
  if (!existsSync(packageDir)) {
    throw new Error(`Nanobot package dir not found: ${packageDir}`);
  }

  const zipFiles = findZipFiles(packageDir);
  if (zipFiles.length === 0) {
    // Try direct copy mode — assume the directory itself is the bundle
    console.log("[stage-nanobot-bundle] No zip found, copying directory contents...");
    mkdirSync(STAGE_DIR, { recursive: true });
    const entries = readdirSync(packageDir);
    let staged = 0;
    for (const entry of entries) {
      const src = join(packageDir, entry);
      const dest = join(STAGE_DIR, entry);
      if (statSync(src).isFile()) {
        copyFileSync(src, dest);
        staged++;
      }
    }
    console.log(`[stage-nanobot-bundle] copied ${staged} files from ${packageDir}`);
    return { staged: true, source: packageDir };
  }

  mkdirSync(STAGE_DIR, { recursive: true });
  for (const file of zipFiles) {
    const src = join(packageDir, file);
    console.log(`[stage-nanobot-bundle] extracting ${file}...`);
    extractZip(src, STAGE_DIR);
  }

  // Write manifest
  const manifest = {
    source: packageDir,
    files: zipFiles.map((f) => ({
      file: f,
      sha256: sha256File(join(packageDir, f)),
    })),
    stagedAt: new Date().toISOString(),
  };
  writeFileSync(join(STAGE_DIR, "nanobot_manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("[stage-nanobot-bundle] OK");
  return { staged: true, manifest };
}

if (process.argv[1]?.endsWith("stage-nanobot-bundle.mjs")) {
  try {
    stageNanobotBundle();
  } catch (err) {
    console.error(`[stage-nanobot-bundle] ${err.message}`);
    process.exit(1);
  }
}
