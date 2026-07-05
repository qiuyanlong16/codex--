#!/usr/bin/env node
/**
 * Cross-platform placeholder brand icons (PNG + tray BMP).
 * Windows ICO is generated separately when building for win32.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBMP } from "./lib/bmp.mjs";
import { createPNG } from "./lib/png.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "resources", "icons");
mkdirSync(outDir, { recursive: true });

function brandPixel(x, y, w, h) {
  const bg = [47, 52, 56];
  const accent = [255, 107, 107];
  const margin = Math.floor(w * 0.28);
  const cx = w / 2;
  const cy = h / 2;
  const radius = (w - 2 * margin) / 2;
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - cy;
  if (dx * dx + dy * dy <= radius * radius) return accent;
  return bg;
}

writeFileSync(join(outDir, "icon.png"), createPNG(256, 256, brandPixel));
writeFileSync(join(outDir, "tray-icon.png"), createPNG(32, 32, brandPixel));
writeFileSync(join(outDir, "tray-icon.bmp"), createBMP(32, 32, brandPixel));

console.log("[gen-brand-icons-node] wrote icon.png, tray-icon.png, tray-icon.bmp");
