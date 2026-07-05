/**
 * Create 24-bit uncompressed BMP Buffer (bottom-up row order).
 * pixelFn(x, y, w, h) returns [r, g, b] (0-255).
 */
export function createBMP(width, height, pixelFn) {
  const bytesPerPixel = 3;
  const rowBytes = width * bytesPerPixel;
  const paddedRowBytes = Math.ceil(rowBytes / 4) * 4;
  const pixelDataSize = paddedRowBytes * height;
  const fileSize = 14 + 40 + pixelDataSize;

  const buf = Buffer.alloc(fileSize, 0);

  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(54, 10);

  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(pixelDataSize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  let pos = 54;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y, width, height);
      buf[pos++] = b & 0xff;
      buf[pos++] = g & 0xff;
      buf[pos++] = r & 0xff;
    }
    for (let p = rowBytes; p < paddedRowBytes; p++) buf[pos++] = 0;
  }

  return buf;
}
