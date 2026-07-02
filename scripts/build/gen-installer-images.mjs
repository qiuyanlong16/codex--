/**
 * 生成 Inno Setup / NSIS 向导所需的 BMP 图片资源。
 *
 * 产出：
 *   resources/installer/wizard-sidebar.bmp  164×314  安装向导左侧大图
 *   resources/installer/wizard-banner.bmp   150×57   安装向导顶部横幅
 *
 * 用法：node scripts/build/gen-installer-images.mjs
 * 无需任何外部依赖，纯 Node.js Buffer 写入原始 BMP 格式。
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const outDir = join(root, "resources", "installer");

/**
 * 创建 24-bit 无压缩 BMP Buffer。
 * pixelFn(x, y, w, h) 返回 [r, g, b]（0-255）。
 * BMP 行顺序为 bottom-up。
 */
function createBMP(width, height, pixelFn) {
  const bytesPerPixel = 3;
  const rowBytes = width * bytesPerPixel;
  const paddedRowBytes = Math.ceil(rowBytes / 4) * 4;
  const pixelDataSize = paddedRowBytes * height;
  const fileSize = 14 + 40 + pixelDataSize;

  const buf = Buffer.alloc(fileSize, 0);

  // File header (14 bytes)
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(54, 10); // pixel data offset = 14 + 40

  // DIB header BITMAPINFOHEADER (40 bytes)
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // positive = bottom-up storage
  buf.writeUInt16LE(1, 26); // color planes
  buf.writeUInt16LE(24, 28); // bits per pixel
  buf.writeUInt32LE(0, 30); // compression = BI_RGB
  buf.writeUInt32LE(pixelDataSize, 34);
  buf.writeInt32LE(2835, 38); // ~72 DPI X
  buf.writeInt32LE(2835, 42); // ~72 DPI Y
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  // Pixel data
  let pos = 54;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y, width, height);
      buf[pos++] = b & 0xff; // BGR order
      buf[pos++] = g & 0xff;
      buf[pos++] = r & 0xff;
    }
    for (let p = rowBytes; p < paddedRowBytes; p++) buf[pos++] = 0;
  }

  return buf;
}

/** 深色渐变背景：顶部深空蓝 → 底部更深，带细微光晕 */
function sidebarPixel(x, y, w, h) {
  const ty = y / h; // 0=顶 1=底

  // 基础深蓝渐变
  const r = Math.round(18 + ty * 8);
  const g = Math.round(18 + ty * 6);
  const b = Math.round(40 + ty * 18);

  // 中央竖向高光条（x 方向柔光）
  const cx = w / 2;
  const dx = Math.abs(x - cx) / (w / 2);
  const highlight = Math.round((1 - dx * dx) * 12);

  return [
    Math.min(255, r + highlight),
    Math.min(255, g + highlight),
    Math.min(255, b + highlight + 6),
  ];
}

/** 顶部横幅：略浅的深蓝渐变，与侧边栏色系统一 */
function bannerPixel(x, _y, w, _h) {
  const tx = x / w;
  const r = Math.round(22 + tx * 10);
  const g = Math.round(22 + tx * 8);
  const b = Math.round(48 + tx * 16);
  return [r, g, b];
}

mkdirSync(outDir, { recursive: true });

const sidebar = createBMP(164, 314, sidebarPixel);
writeFileSync(join(outDir, "wizard-sidebar.bmp"), sidebar);
console.log("✔  resources/installer/wizard-sidebar.bmp  (164×314)");

const banner = createBMP(150, 57, bannerPixel);
writeFileSync(join(outDir, "wizard-banner.bmp"), banner);
console.log("✔  resources/installer/wizard-banner.bmp   (150×57)");
