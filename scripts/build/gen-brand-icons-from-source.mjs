#!/usr/bin/env node
/**
 * Generate all brand icons from resources/icons/source/codex--.jpg
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";
import png2icons from "png2icons";
import { createBMP } from "./lib/bmp.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceJpg = join(root, "resources/icons/source/codex--.jpg");
const iconsDir = join(root, "resources/icons");
const brandDir = join(root, "packages/web/public/brand");

mkdirSync(iconsDir, { recursive: true });
mkdirSync(brandDir, { recursive: true });

async function resizePng(size) {
  return sharp(sourceJpg)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
}

async function trayBmp() {
  const { data, info } = await sharp(sourceJpg)
    .resize(32, 32, { fit: "cover", position: "centre" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelFn = (x, y) => {
    const idx = (y * info.width + x) * info.channels;
    return [data[idx], data[idx + 1], data[idx + 2]];
  };
  return createBMP(info.width, info.height, pixelFn);
}

async function main() {
  const icon1024 = await resizePng(1024);
  writeFileSync(join(iconsDir, "icon.png"), icon1024);

  const tray32 = await resizePng(32);
  writeFileSync(join(iconsDir, "tray-icon.png"), tray32);
  writeFileSync(join(iconsDir, "tray-icon.bmp"), await trayBmp());

  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoBuffers = await Promise.all(icoSizes.map((size) => resizePng(size)));
  const ico = await pngToIco(icoBuffers);
  writeFileSync(join(iconsDir, "icon.ico"), ico);

  const icns = png2icons.createICNS(icon1024, png2icons.BILINEAR, 0);
  if (icns) {
    writeFileSync(join(iconsDir, "icon.icns"), icns);
  }

  writeFileSync(join(brandDir, "nanobot_icon.png"), await resizePng(128));
  writeFileSync(join(brandDir, "nanobot_favicon_32.png"), await resizePng(32));
  writeFileSync(join(brandDir, "nanobot_apple_touch.png"), await resizePng(180));

  console.log("[gen-brand-icons-from-source] wrote icon.png, icon.ico, icon.icns, tray icons, web brand assets");
}

main().catch((err) => {
  console.error("[gen-brand-icons-from-source] failed:", err);
  process.exit(1);
});
