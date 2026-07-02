#!/usr/bin/env node
/**
 * Generate placeholder brand icons for packaging (Windows-friendly).
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "resources", "icons");
mkdirSync(outDir, { recursive: true });

const png = join(outDir, "icon.png").replace(/\\/g, "\\\\");
const ico = join(outDir, "icon.ico").replace(/\\/g, "\\\\");
const trayBmp = join(outDir, "tray-icon.bmp").replace(/\\/g, "\\\\");
const trayPng = join(outDir, "tray-icon.png").replace(/\\/g, "\\\\");

const ps = `
Add-Type -AssemblyName System.Drawing
function New-BrandBitmap($size) {
  $bmp = New-Object System.Drawing.Bitmap $size,$size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(255, 47, 52, 56))
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 107, 107))
  $margin = [int]($size * 0.28)
  $d = $size - 2 * $margin
  $g.FillEllipse($brush, $margin, $margin, $d, $d)
  $g.Dispose()
  return $bmp
}
$main = New-BrandBitmap 256
$tray = New-BrandBitmap 32
$main.Save("${png}", [System.Drawing.Imaging.ImageFormat]::Png)
$tray.Save("${trayPng}", [System.Drawing.Imaging.ImageFormat]::Png)
$tray.Save("${trayBmp}", [System.Drawing.Imaging.ImageFormat]::Bmp)
$icon = [System.Drawing.Icon]::FromHandle($main.GetHicon())
$fs = [System.IO.File]::Create("${ico}")
$icon.Save($fs)
$fs.Close()
$main.Dispose()
$tray.Dispose()
Write-Host "wrote icons"
`;

const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "inherit" });
if (r.status !== 0) {
  console.error("[gen-icons] failed — install icons manually under resources/icons/");
  process.exit(1);
}

console.log("[gen-icons] OK");
