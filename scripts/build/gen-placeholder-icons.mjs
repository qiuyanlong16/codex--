#!/usr/bin/env node
/**
 * Generate placeholder brand icons for packaging.
 * PNG/BMP via pure Node; ICO via PowerShell on Windows targets only.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { isWindowsTarget } from "./lib/platform.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "resources", "icons");
const iconPng = join(outDir, "icon.png");
const iconIco = join(outDir, "icon.ico");

function runNode(script) {
  const r = spawnSync("node", [script], { cwd: root, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

runNode(join(root, "scripts/build/gen-brand-icons-node.mjs"));

if (isWindowsTarget() && !existsSync(iconIco)) {
  const png = iconPng.replace(/\\/g, "\\\\");
  const ico = iconIco.replace(/\\/g, "\\\\");
  const ps = `
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile("${png}")
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fs = [System.IO.File]::Create("${ico}")
$icon.Save($fs)
$fs.Close()
$bmp.Dispose()
Write-Host "wrote icon.ico"
`;
  const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error("[gen-icons] failed to create icon.ico — install icons manually under resources/icons/");
    process.exit(1);
  }
}

console.log("[gen-icons] OK");
