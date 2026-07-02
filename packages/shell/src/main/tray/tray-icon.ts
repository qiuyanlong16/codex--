import { nativeImage } from "electron";

/** In-memory placeholder tray icon when packaged assets are missing. */
export function createPlaceholderTrayIcon(): Electron.NativeImage {
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = (size - 1) / 2;
      const cy = (size - 1) / 2;
      const nx = (x - cx) / (size / 2);
      const ny = (y - cy) / (size / 2);
      const inRoundedSquare = Math.abs(nx) ** 2.2 + Math.abs(ny) ** 2.2 <= 0.92;
      const dist = Math.hypot(x - cx, y - cy);
      const inDot = dist <= size * 0.22;

      if (inDot) {
        buf[i] = 107;
        buf[i + 1] = 107;
        buf[i + 2] = 255;
        buf[i + 3] = 255;
      } else if (inRoundedSquare) {
        buf[i] = 56;
        buf[i + 1] = 52;
        buf[i + 2] = 47;
        buf[i + 3] = 255;
      } else {
        buf[i] = 0;
        buf[i + 1] = 0;
        buf[i + 2] = 0;
        buf[i + 3] = 0;
      }
    }
  }

  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}
