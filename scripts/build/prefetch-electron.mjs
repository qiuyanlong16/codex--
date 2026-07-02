#!/usr/bin/env node
import fs from "node:fs/promises";
import { createWriteStream, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ELECTRON_VERSION = (process.env.ELECTRON_VERSION ?? "42.0.0").replace(/^[~^]/, "");
const TARGET_PLATFORM = process.env.ELECTRON_PLATFORM ?? "win32";
const TARGET_ARCH = process.env.ELECTRON_ARCH ?? "x64";
const MAX_RETRIES = Number(process.env.ELECTRON_DOWNLOAD_RETRIES ?? "3");
const CACHE_DIR = path.resolve(
  process.env.ELECTRON_CACHE ?? path.join(REPO_ROOT, ".cache/electron"),
);
const FILE_NAME = `electron-v${ELECTRON_VERSION}-${TARGET_PLATFORM}-${TARGET_ARCH}.zip`;
const FILE_PATH = path.join(CACHE_DIR, FILE_NAME);

/** Mirrors first — avoid slow GitHub on repeat local builds. */
const defaultUrls = [
  `https://npmmirror.com/mirrors/electron/v${ELECTRON_VERSION}/${FILE_NAME}`,
  `https://cdn.npmmirror.com/binaries/electron/v${ELECTRON_VERSION}/${FILE_NAME}`,
  `https://registry.npmmirror.com/-/binary/electron/v${ELECTRON_VERSION}/${FILE_NAME}`,
  `https://ghproxy.com/https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/${FILE_NAME}`,
  `https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/${FILE_NAME}`,
];

const customUrl = process.env.ELECTRON_MIRROR
  ? `${process.env.ELECTRON_MIRROR.replace(/\/?$/, "/")}${FILE_NAME}`
  : null;
const localZip = process.env.ELECTRON_LOCAL_ZIP;
const sourceUrls = customUrl ? [customUrl, ...defaultUrls] : defaultUrls;

function getCandidateCacheDirs() {
  const localAppData = process.env.LOCALAPPDATA;
  const userProfile = process.env.USERPROFILE ?? process.env.HOME;
  return [
    CACHE_DIR,
    path.join(REPO_ROOT, ".cache", "electron"),
    path.join(REPO_ROOT, ".cache", "electron-builder"),
    localAppData && path.join(localAppData, "electron", "Cache"),
    localAppData && path.join(localAppData, "electron", "cache"),
    localAppData && path.join(localAppData, "electron-builder", "Cache"),
    localAppData && path.join(localAppData, "electron-builder", "cache"),
    userProfile && path.join(userProfile, ".electron"),
    userProfile && path.join(userProfile, ".cache", "electron"),
  ].filter(Boolean);
}

function findFileRecursive(dir, fileName, depth = 0, maxDepth = 7) {
  if (depth > maxDepth) {
    return null;
  }
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === fileName) {
      return full;
    }
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, fileName, depth + 1, maxDepth);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function findLocalElectronZip() {
  const seen = new Set();
  for (const dir of getCandidateCacheDirs()) {
    const key = path.resolve(dir);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    try {
      if (!statSync(key).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }
    const hit = findFileRecursive(key, FILE_NAME);
    if (hit) {
      return hit;
    }
  }
  return null;
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && stat.size > 1_000_000;
  } catch {
    return false;
  }
}

async function copyToCache(fromPath) {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.copyFile(fromPath, FILE_PATH);
}

async function downloadToFile(url, destFile) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  await fs.mkdir(path.dirname(destFile), { recursive: true });
  const tempFile = `${destFile}.tmp`;
  const output = createWriteStream(tempFile);
  await pipeline(response.body, output);
  await fs.rename(tempFile, destFile);
}

async function main() {
  if (await fileExists(FILE_PATH)) {
    console.log(`[electron:prefetch] Cache hit: ${FILE_PATH}`);
    return;
  }

  const discovered = findLocalElectronZip();
  if (discovered && discovered !== FILE_PATH) {
    await copyToCache(discovered);
    console.log(`[electron:prefetch] Reused local zip: ${discovered}`);
    console.log(`[electron:prefetch] Cache ready: ${FILE_PATH}`);
    return;
  }

  await fs.mkdir(CACHE_DIR, { recursive: true });

  if (localZip) {
    const localPath = path.resolve(localZip);
    if (!(await fileExists(localPath))) {
      throw new Error(`[electron:prefetch] ELECTRON_LOCAL_ZIP not found: ${localPath}`);
    }
    await copyToCache(localPath);
    console.log(`[electron:prefetch] Copied from ELECTRON_LOCAL_ZIP: ${localPath}`);
    return;
  }

  let lastError = null;
  for (const url of sourceUrls) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        console.log(`[electron:prefetch] Downloading (${attempt}/${MAX_RETRIES}): ${url}`);
        await downloadToFile(url, FILE_PATH);
        console.log(`[electron:prefetch] Downloaded: ${FILE_PATH}`);
        return;
      } catch (error) {
        lastError = error;
        console.warn(`[electron:prefetch] Failed attempt ${attempt}: ${error.message}`);
      }
    }
  }

  throw new Error(
    `[electron:prefetch] All download attempts failed for ${FILE_NAME}. Last error: ${lastError?.message ?? "unknown"}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
