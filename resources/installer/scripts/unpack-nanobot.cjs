#!/usr/bin/env node
/**
 * Unpack nanobot bundle zip into resources/nanobot-bundle/.
 * Usage: node unpack-nanobot.cjs <installDir>
 */
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const instDir = process.argv[2];
if (!instDir) {
  console.error("[unpack-nanobot] missing install directory");
  process.exit(1);
}

const resourcesDir = path.join(instDir, "resources");
const bundleDir = path.join(resourcesDir, "nanobot-bundle");
const manifestFile = path.join(bundleDir, "nanobot_manifest.json");

try {
  if (!fs.existsSync(bundleDir)) {
    console.error("[unpack-nanobot] bundle directory not found");
    process.exit(1);
  }

  // Find zip files in the bundle directory
  const zipFiles = fs.readdirSync(bundleDir).filter((f) => f.endsWith(".zip")).sort();
  if (zipFiles.length === 0) {
    console.log("[unpack-nanobot] no zip files found, assuming already unpacked");
    process.exit(0);
  }

  for (const zipFile of zipFiles) {
    const zipPath = path.join(bundleDir, zipFile);
    console.log(`[unpack-nanobot] extracting ${zipFile}...`);
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${bundleDir.replace(/'/g, "''")}' -Force"`,
      { stdio: "inherit" },
    );
    fs.unlinkSync(zipPath);
  }

  if (fs.existsSync(manifestFile)) {
    fs.unlinkSync(manifestFile);
  }

  console.log("[unpack-nanobot] OK");
  process.exit(0);
} catch (err) {
  console.error(`[unpack-nanobot] ${err.message}`);
  process.exit(1);
}
