#!/usr/bin/env node
/**
 * Generate NSIS wizard BMP assets for Windows installer branding.
 *
 * Output:
 *   resources/installer/wizard-sidebar.bmp  164×314  installer left panel
 *   resources/installer/wizard-banner.bmp   150×57   installer header strip
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createBMP } from "./lib/bmp.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "resources/installer");
const sourceJpg = join(root, "resources/icons/source/codex--.jpg");

const SIDEBAR_W = 164;
const SIDEBAR_H = 314;
const BANNER_W = 150;
const BANNER_H = 57;
const ACCENT = "#00d8ff";

function gradientBackgroundSvg(width, height, horizontal = false) {
  const gradient = horizontal
    ? `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
         <stop offset="0%" stop-color="#1e2230"/>
         <stop offset="100%" stop-color="#0f1118"/>
       </linearGradient>`
    : `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0%" stop-color="#1e2230"/>
         <stop offset="55%" stop-color="#161820"/>
         <stop offset="100%" stop-color="#0f1118"/>
       </linearGradient>`;

  const glow = horizontal
    ? `<radialGradient id="glow" cx="18%" cy="50%" r="65%">
         <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.14"/>
         <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
       </radialGradient>`
    : `<radialGradient id="glow" cx="50%" cy="28%" r="48%">
         <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.2"/>
         <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
       </radialGradient>`;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>${gradient}${glow}</defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <rect width="${width}" height="${height}" fill="url(#glow)"/>
  </svg>`;
}

function rawToBmp(data, width, height) {
  return createBMP(width, height, (x, y) => {
    const idx = (y * width + x) * 3;
    return [data[idx], data[idx + 1], data[idx + 2]];
  });
}

async function composeBmp(width, height, layers) {
  const bgSvg = Buffer.from(gradientBackgroundSvg(width, height, width > height));
  const composed = await sharp(bgSvg).composite(layers).png().toBuffer();
  const { data } = await sharp(composed)
    .resize(width, height)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return rawToBmp(data, width, height);
}

async function buildSidebarFromSource() {
  const logoSize = 84;
  const logo = await sharp(sourceJpg)
    .resize(logoSize, logoSize, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  const logoLeft = Math.round((SIDEBAR_W - logoSize) / 2);
  const logoTop = 68;
  const labelSvg = Buffer.from(`<svg width="${SIDEBAR_W}" height="72" xmlns="http://www.w3.org/2000/svg">
    <text x="${SIDEBAR_W / 2}" y="26" text-anchor="middle"
      font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="600" fill="#eef2f7">codex--</text>
    <text x="${SIDEBAR_W / 2}" y="48" text-anchor="middle"
      font-family="Segoe UI, Arial, sans-serif" font-size="10" fill="#7a8499">AI coding assistant</text>
  </svg>`);

  return composeBmp(SIDEBAR_W, SIDEBAR_H, [
    { input: logo, left: logoLeft, top: logoTop },
    { input: labelSvg, left: 0, top: logoTop + logoSize + 10 },
  ]);
}

async function buildBannerFromSource() {
  const logoSize = 36;
  const logo = await sharp(sourceJpg)
    .resize(logoSize, logoSize, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  const labelSvg = Buffer.from(`<svg width="96" height="${BANNER_H}" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="24" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="600" fill="#eef2f7">codex--</text>
    <text x="0" y="40" font-family="Segoe UI, Arial, sans-serif" font-size="9" fill="#7a8499">Setup</text>
  </svg>`);

  return composeBmp(BANNER_W, BANNER_H, [
    { input: logo, left: 8, top: Math.round((BANNER_H - logoSize) / 2) },
    { input: labelSvg, left: 52, top: Math.round((BANNER_H - 44) / 2) },
  ]);
}

function sidebarPlaceholderPixel(x, y, w, h) {
  const ty = y / h;
  const r = Math.round(18 + ty * 8);
  const g = Math.round(18 + ty * 6);
  const b = Math.round(40 + ty * 18);
  const cx = w / 2;
  const dx = Math.abs(x - cx) / (w / 2);
  const highlight = Math.round((1 - dx * dx) * 12);
  return [
    Math.min(255, r + highlight),
    Math.min(255, g + highlight),
    Math.min(255, b + highlight + 6),
  ];
}

function bannerPlaceholderPixel(x, _y, w, _h) {
  const tx = x / w;
  return [Math.round(22 + tx * 10), Math.round(22 + tx * 8), Math.round(48 + tx * 16)];
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  let sidebar;
  let banner;
  if (existsSync(sourceJpg)) {
    sidebar = await buildSidebarFromSource();
    banner = await buildBannerFromSource();
    console.log("[gen-installer-images] wrote branded wizard-sidebar.bmp and wizard-banner.bmp");
  } else {
    sidebar = createBMP(SIDEBAR_W, SIDEBAR_H, sidebarPlaceholderPixel);
    banner = createBMP(BANNER_W, BANNER_H, bannerPlaceholderPixel);
    console.log("[gen-installer-images] wrote placeholder wizard-sidebar.bmp and wizard-banner.bmp");
  }

  writeFileSync(join(outDir, "wizard-sidebar.bmp"), sidebar);
  writeFileSync(join(outDir, "wizard-banner.bmp"), banner);
}

main().catch((err) => {
  console.error("[gen-installer-images] failed:", err);
  process.exit(1);
});
