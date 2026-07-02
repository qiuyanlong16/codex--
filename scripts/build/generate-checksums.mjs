#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const releaseDir = path.resolve(process.env.RELEASE_DIR ?? "dist-release");
const checksumDir = path.join(releaseDir, "checksums");
const checksumFile = path.join(checksumDir, "SHA256SUMS.txt");

const ignoredExt = new Set([".blockmap"]);
const ignoredNames = new Set(["builder-debug.yml", "latest.yml"]);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (ignoredNames.has(entry.name)) continue;
    if (ignoredExt.has(path.extname(entry.name))) continue;
    files.push(fullPath);
  }

  return files;
}

async function sha256(filePath) {
  const content = await fs.readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function main() {
  await fs.mkdir(checksumDir, { recursive: true });
  const allFiles = await walk(releaseDir);
  const files = allFiles
    .filter((file) => !file.startsWith(checksumDir))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error(`[checksums] No release artifacts found in: ${releaseDir}`);
  }

  const lines = [];
  for (const file of files) {
    const digest = await sha256(file);
    const relative = path.relative(releaseDir, file).replaceAll("\\", "/");
    lines.push(`${digest}  ${relative}`);
  }

  await fs.writeFile(checksumFile, `${lines.join("\n")}\n`, "utf8");
  console.log(`[checksums] Wrote ${lines.length} entries to ${checksumFile}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
