#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const releaseDir = path.resolve(process.env.RELEASE_DIR ?? "dist-release");
const maxInstallerMb = Number(process.env.MAX_INSTALLER_MB ?? "200");

async function dirSize(dir) {
  let total = 0;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(full);
    else if (entry.isFile()) total += (await fs.stat(full)).size;
  }
  return total;
}

async function main() {
  const entries = await fs.readdir(releaseDir, { withFileTypes: true }).catch(() => []);
  const installers = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.(exe|dmg)$/i.test(entry.name)) continue;
    const full = path.join(releaseDir, entry.name);
    installers.push({ name: entry.name, size: (await fs.stat(full)).size });
  }
  if (installers.length === 0) {
    console.warn("[release:size-check] no installer found — skip");
    return;
  }
  for (const inst of installers) {
    const mb = inst.size / 1024 / 1024;
    console.log(`[release:size-check] ${inst.name}: ${mb.toFixed(2)} MB`);
    if (mb > maxInstallerMb) {
      throw new Error(`Installer exceeds ${maxInstallerMb} MB budget`);
    }
  }
  const unpacked = path.join(releaseDir, "win-unpacked");
  const unpackedSize = await dirSize(unpacked);
  if (unpackedSize > 0) {
    console.log(`[release:size-check] win-unpacked: ${(unpackedSize / 1024 / 1024).toFixed(2)} MB`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
