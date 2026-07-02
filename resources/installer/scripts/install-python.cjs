#!/usr/bin/env node
/**
 * Install Python embedded distribution from zip.
 * Usage: node install-python.cjs <installDir>
 */
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const instDir = process.argv[2];
if (!instDir) {
  console.error("[install-python] missing install directory");
  process.exit(1);
}

const resourcesDir = path.join(instDir, "resources");
const pythonDir = path.join(resourcesDir, "python");

try {
  if (!fs.existsSync(pythonDir)) {
    console.error("[install-python] python directory not found");
    process.exit(1);
  }

  const zipFile = path.join(pythonDir, "python.zip");
  if (!fs.existsSync(zipFile)) {
    console.log("[install-python] no python.zip found, assuming already installed");
    process.exit(0);
  }

  console.log("[install-python] extracting python.zip...");
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipFile.replace(/'/g, "''")}' -DestinationPath '${pythonDir.replace(/'/g, "''")}' -Force"`,
    { stdio: "inherit" },
  );
  fs.unlinkSync(zipFile);

  console.log("[install-python] OK");
  process.exit(0);
} catch (err) {
  console.error(`[install-python] ${err.message}`);
  process.exit(1);
}
